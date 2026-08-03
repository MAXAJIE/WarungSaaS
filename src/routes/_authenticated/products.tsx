import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, GripVertical, ImagePlus, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { Loading, StaffShell, useStoreGuard } from "@/components/staff-shell";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  deleteProduct,
  listGroups,
  listProducts,
  reorderProducts,
  uploadProductPhoto,
  upsertProduct,
} from "@/lib/staff.functions";
import { ViewToolbar, useViewPrefs, viewGridClass, viewPadClass } from "@/components/view-toolbar";
import { ImageCropper } from "@/components/image-cropper";
import { EmptyState } from "@/components/empty-state";
import { ProductOptionsEditor } from "@/components/product-options-editor";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type ComboItem = { product_id: string; qty: number };

type Row = {
  id: string;
  name: string;
  name_zh: string | null;
  name_ms: string | null;
  description: string | null;
  category: string | null;
  cost_price: number | string;
  sell_price: number | string;
  is_available: boolean;
  is_combo: boolean;
  group_id: string | null;
  group_ids: string[];
  stock_total: number | null;
  stock_sold: number;
  photo_url: string | null;
  photo_signed_url: string | null;
  combo_items: ComboItem[];
};

type Group = { id: string; name: string; color: string | null };

const blank = {
  name: "",
  name_zh: "",
  name_ms: "",
  description: "",
  category: "",
  cost_price: 0,
  sell_price: 0,
  is_available: true,
  is_combo: false,
  stock_total: "" as number | "",
  group_ids: [] as string[],
  combo_items: [] as ComboItem[],
  photo_url: null as string | null,
  photo_preview: null as string | null,
};

type Draft = typeof blank & { id?: string };

/** The create/edit dialog is split per topic instead of one endless form. */
type TabId = "basics" | "pricing" | "inventory" | "options" | "combo" | "photo";

/**
 * A labelled block for a group of buttons. Deliberately a <div>: a <label>
 * forwards every click inside it to the first control it contains, so the
 * compartment chips used to toggle when the pointer was nowhere near a chip.
 */
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary";

function ProductsPage() {
  const { t } = useI18n();
  const { me, hasStore } = useStoreGuard();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["products"],
    queryFn: useServerFn(listProducts) as never,
    enabled: hasStore,
  });
  const groupsQ = useQuery({
    queryKey: ["groups"],
    queryFn: useServerFn(listGroups) as never,
    enabled: hasStore,
  });
  const save = useServerFn(upsertProduct);
  const upload = useServerFn(uploadProductPhoto);
  const reorder = useServerFn(reorderProducts);
  const { prefs, set } = useViewPrefs("products");
  const remove = useServerFn(deleteProduct);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [tab, setTab] = useState<TabId>("basics");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const dragId = useRef<string | null>(null);
  // Customisation editors register a saver here while they hold an unsaved
  // template, so saving the product persists those templates in the same go.
  const pendingOptionSaves = useRef(new Map<string, () => Promise<void>>());
  const [pendingOptionCount, setPendingOptionCount] = useState(0);
  const registerPendingOptionSave = useCallback(
    (productId: string, saver: (() => Promise<void>) | null) => {
      if (saver) pendingOptionSaves.current.set(productId, saver);
      else pendingOptionSaves.current.delete(productId);
      setPendingOptionCount(pendingOptionSaves.current.size);
    },
    [],
  );

  const allRows = (list.data as Row[] | undefined) ?? [];
  const groups = (groupsQ.data as Group[] | undefined) ?? [];

  useEffect(() => {
    setOrder(allRows.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.dataUpdatedAt]);

  const saveM = useMutation({
    mutationFn: async () => {
      // Templates first: if one fails the product save is aborted, so the
      // owner is never told "saved" while a customisation was lost.
      for (const saver of Array.from(pendingOptionSaves.current.values())) {
        await saver();
      }
      pendingOptionSaves.current.clear();
      setPendingOptionCount(0);
      const { photo_preview: _preview, group_ids, combo_items, stock_total, ...payload } = draft!;
      return save({
        data: {
          ...payload,
          // Owners set the TOTAL ever stocked; sold units are tracked separately
          // so raising the total simply tops the remaining count back up.
          stock_total: stock_total === "" ? null : Number(stock_total),
          group_ids,
          combo_items: payload.is_combo ? combo_items : [],
        },
      });
    },

    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const reorderM = useMutation({
    mutationFn: (ids: string[]) => reorder({ data: { ids } }),
    onSuccess: () => {
      toast.success(t("order_saved"));
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadM = useMutation({
    // The cropper hands us a square JPEG data URL, so the stored file always
    // matches the square tiles used on the menu.
    mutationFn: async (dataUrl: string) => upload({ data: { base64: dataUrl, ext: "jpg" } }),
    onSuccess: (res) =>
      setDraft((d) => (d ? { ...d, photo_url: res.path, photo_preview: res.signedUrl } : d)),
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = Array.from(
    new Set(allRows.map((r) => (r.category || "").trim()).filter(Boolean)),
  );
  const filters = [
    { id: "all", label: t("all") },
    { id: "available", label: t("available") },
    { id: "sold", label: t("sold") },
    { id: "combo", label: t("combo") },
    ...categories.map((c) => ({ id: `cat:${c}`, label: c })),
  ];
  const q = prefs.query.trim().toLowerCase();
  const sorted = order.length
    ? [...allRows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : allRows;
  const rows = sorted.filter((r) => {
    if (
      q &&
      !`${r.name} ${r.name_zh ?? ""} ${r.name_ms ?? ""} ${r.category ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (prefs.filter === "available") return r.is_available;
    if (prefs.filter === "sold") return !r.is_available;
    if (prefs.filter === "combo") return r.is_combo;
    if (prefs.filter.startsWith("cat:")) return (r.category || "") === prefs.filter.slice(4);
    return true;
  });
  const canDrag = !q && prefs.filter === "all";

  function onDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const next = order.filter((id) => id !== from);
    next.splice(next.indexOf(targetId), 0, from);
    setOrder(next);
    reorderM.mutate(next);
  }

  const comboTotal = (draft?.combo_items ?? []).reduce((sum, ci) => {
    const p = allRows.find((r) => r.id === ci.product_id);
    return sum + (p ? Number(p.sell_price) * ci.qty : 0);
  }, 0);

  return (
    <StaffShell
      title={t("nav_products")}
      roles={
        (me.data?.roles?.length
          ? me.data.roles
          : me.data?.member
            ? [me.data.member.role]
            : []) as never
      }
      storeName={me.data?.store?.name ?? null}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setTab("basics");
            setDraft({ ...blank });
          }}
          className="soft-press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lift"
        >
          <Plus className="size-4" /> {t("new_product")}
        </button>
        <button
          onClick={() => {
            setTab("combo");
            setDraft({ ...blank, is_combo: true });
          }}
          className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold"
        >
          <Layers className="size-4" /> {t("new_combo")}
        </button>
        {me.data?.store?.slug && (
          <a
            href={`/s/${me.data.store.slug}?preview=1`}
            target="_blank"
            rel="noreferrer"
            className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold"
          >
            <Eye className="size-4" /> {t("preview_as_customer")}
          </a>
        )}
        {canDrag && rows.length > 1 && (
          <span className="text-xs text-muted-foreground">{t("drag_hint")}</span>
        )}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? t("edit_product") : draft?.is_combo ? t("new_combo") : t("new_product")}
        subtitle={draft?.id ? draft.name : undefined}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setDraft(null)}
              className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
            >
              {t("cancel")}
            </button>
            <button
              onClick={() => setConfirmSave(true)}

              disabled={!draft?.name || saveM.isPending}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
            >
              {t("save")}
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5 rounded-2xl bg-muted/50 p-1.5">
              {(
                [
                  // A plain product has nothing to bundle, so the combo tab is
                  // not offered at all. In the combo dialog it leads instead.
                  ...(draft.is_combo ? ([["combo", t("combo")]] as Array<[TabId, string]>) : []),
                  ["basics", t("basics")],
                  ["pricing", t("pricing")],
                  ["inventory", t("inventory")],
                  ["options", t("customisations")],
                  ["photo", t("details")],
                ] as Array<[TabId, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`soft-press rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                    tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <section className={`space-y-3 ${tab === "basics" ? "" : "hidden"}`}>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["name", t("product_name")],
                    ["name_zh", "中文名"],
                    ["name_ms", "Nama Melayu"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      value={(draft[key] as string) ?? ""}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("category")}>
                  <input
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    list="product-categories"
                    className={inputClass}
                  />
                  <datalist id="product-categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <FieldBlock label={t("compartments")}>
                  <div className="flex flex-wrap gap-2">
                    {groups.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("no_group")}</p>
                    )}
                    {groups.map((g) => {
                      const on = draft.group_ids.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              group_ids: on
                                ? draft.group_ids.filter((id) => id !== g.id)
                                : [...draft.group_ids, g.id],
                            })
                          }
                          className={`soft-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground"
                          }`}
                        >
                          {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("compartments_hint")}
                  </p>
                </FieldBlock>
              </div>
              <Field label={t("description")}>
                <textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </section>

            <section className={`space-y-3 ${tab === "pricing" ? "" : "hidden"}`}>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["cost_price", t("cost_price")],
                    ["sell_price", t("sell_price")],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      step="0.10"
                      min="0"
                      value={draft[key]}
                      onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </section>

            <section className={`space-y-3 ${tab === "inventory" ? "" : "hidden"}`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t("stock_total")}>
                  <input
                    type="number"
                    min="0"
                    value={draft.stock_total}
                    placeholder={t("untracked")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        stock_total: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label={t("stock_sold")}>
                  <input
                    disabled
                    value={draft.id ? (allRows.find((r) => r.id === draft.id)?.stock_sold ?? 0) : 0}
                    className={`${inputClass} opacity-60`}
                  />
                </Field>
                <Field label={t("stock_left")}>
                  <input
                    disabled
                    value={
                      draft.stock_total === ""
                        ? "∞"
                        : Math.max(
                            0,
                            Number(draft.stock_total) -
                              (draft.id
                                ? (allRows.find((r) => r.id === draft.id)?.stock_sold ?? 0)
                                : 0),
                          )
                    }
                    className={`${inputClass} opacity-60`}
                  />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("stock_hint")}</p>
            </section>

            <section className={`space-y-3 ${tab === "combo" && draft.is_combo ? "" : "hidden"}`}>
              {draft.is_combo && (
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {t("pick_products")} · {formatMoney(comboTotal)}
                  </p>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {allRows
                      .filter((p) => !p.is_combo && p.id !== draft.id)
                      .map((p) => {
                        const picked = draft.combo_items.find((c) => c.product_id === p.id);
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={!!picked}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  combo_items: e.target.checked
                                    ? [...draft.combo_items, { product_id: p.id, qty: 1 }]
                                    : draft.combo_items.filter((c) => c.product_id !== p.id),
                                })
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatMoney(p.sell_price)}
                            </span>
                            {picked && (
                              <input
                                type="number"
                                min="1"
                                value={picked.qty}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    combo_items: draft.combo_items.map((c) =>
                                      c.product_id === p.id
                                        ? { ...c, qty: Math.max(1, Number(e.target.value)) }
                                        : c,
                                    ),
                                  })
                                }
                                aria-label={t("qty")}
                                className="w-16 rounded-xl border border-border bg-background px-2 py-1 text-xs"
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              {draft.is_combo && draft.combo_items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("contained_item_options")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("contained_item_options_hint")}
                  </p>
                  {draft.combo_items.map((ci) => {
                    const sub = allRows.find((r) => r.id === ci.product_id);
                    if (!sub) return null;
                    return (
                      <details
                        key={ci.product_id}
                        className="rounded-2xl border border-border bg-card"
                      >
                        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-bold">
                          {sub.name}
                        </summary>
                        <div className="border-t border-border/70 p-3">
                          <ProductOptionsEditor
                            productId={ci.product_id}
                            onPendingSaveChange={registerPendingOptionSave}
                          />

                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`space-y-3 ${tab === "options" ? "" : "hidden"}`}>
              {draft.id ? (
                <ProductOptionsEditor
                  productId={draft.id}
                  onPendingSaveChange={registerPendingOptionSave}
                />

              ) : (
                <p className="text-sm text-muted-foreground">{t("save_first")}</p>
              )}
            </section>

            <section className={`space-y-3 ${tab === "photo" ? "" : "hidden"}`}>
              <div className="flex items-center gap-3">
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
                  {draft.photo_preview ? (
                    <img
                      src={draft.photo_preview}
                      alt={draft.name || t("photo")}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" />
                  )}
                </div>
                <label className="soft-press inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold">
                  <ImagePlus className="size-4" />
                  {uploadM.isPending ? t("loading") : t("upload_photo")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setCropFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {draft.photo_url && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, photo_url: null, photo_preview: null })}
                    className="soft-press grid size-9 place-items-center rounded-2xl bg-destructive/10 text-destructive"
                    aria-label={t("remove_photo")}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_available}
                  onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })}
                />
                {t("available")}
              </label>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && delM.mutate(confirmDelete.id)}
        title={t("delete")}
        message={`${t("delete_confirm")} ${confirmDelete?.name ?? ""}`}
        confirmLabel={t("delete")}
        destructive
      />

      <ConfirmDialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={() => {
          setConfirmSave(false);
          saveM.mutate();
        }}
        title={t("save_product_title")}
        message={
          pendingOptionCount > 0 ? t("save_product_with_options") : t("save_product_message")
        }
        confirmLabel={t("save")}
      />


      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(dataUrl) => {
            setCropFile(null);
            uploadM.mutate(dataUrl);
          }}
        />
      )}

      <ViewToolbar prefs={prefs} set={set} filters={filters} />

      {list.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title={allRows.length ? t("empty_products_filtered_title") : t("empty_products_title")}
          hint={allRows.length ? t("empty_products_filtered_hint") : t("empty_products_hint")}
          {...(allRows.length ? {} : { actionLabel: t("new_product") })}
          onAction={() => {
            setTab("basics");
            setDraft({ ...blank });
          }}
        />
      ) : (
        <div className={viewGridClass(prefs)}>
          {rows.map((p) => (
            <article
              key={p.id}
              draggable={canDrag}
              onDragStart={() => (dragId.current = p.id)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && onDrop(p.id)}
              className={`cozy-card flex items-start gap-3 transition-transform duration-200 hover:-translate-y-0.5 ${viewPadClass(prefs)} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {canDrag && <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground" />}
              {p.photo_signed_url && (
                <img
                  src={p.photo_signed_url}
                  alt={p.name}
                  loading="lazy"
                  className={`shrink-0 rounded-2xl object-cover ${prefs.size === "sm" ? "size-12" : prefs.size === "lg" ? "size-24" : "size-16"}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">
                  {p.name}
                  {p.is_combo && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-primary">
                      {t("combo")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.category || "—"} · {p.is_available ? t("available") : t("sold")}
                  {(p.group_ids ?? []).length > 0 &&
                    ` · ${(p.group_ids ?? [])
                      .map((id) => groups.find((g) => g.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}`}
                </p>
                {p.is_combo && p.combo_items.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {p.combo_items
                      .map((ci) => {
                        const sub = allRows.find((r) => r.id === ci.product_id);
                        return sub ? `${sub.name}${ci.qty > 1 ? ` ×${ci.qty}` : ""}` : "";
                      })
                      .filter(Boolean)
                      .join(" + ")}
                  </p>
                )}
                {p.stock_total !== null && (
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-secondary/20 px-2 py-0.5 text-[11px] font-bold">
                    {t("stock_left")}: {Math.max(0, p.stock_total - (p.stock_sold ?? 0))} /{" "}
                    {p.stock_total}
                  </p>
                )}
                <p className="mt-2 text-sm">
                  <span className="font-bold">{formatMoney(p.sell_price)}</span>{" "}
                  <span className="text-muted-foreground">
                    ({t("cost")} {formatMoney(p.cost_price)})
                  </span>
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setTab(p.is_combo ? "combo" : "basics");
                    setDraft({
                      id: p.id,
                      name: p.name,
                      name_zh: p.name_zh ?? "",
                      name_ms: p.name_ms ?? "",
                      description: p.description ?? "",
                      category: p.category ?? "",
                      cost_price: Number(p.cost_price),
                      sell_price: Number(p.sell_price),
                      is_available: p.is_available,
                      is_combo: p.is_combo,
                      stock_total: p.stock_total ?? "",
                      group_ids: p.group_ids ?? [],
                      combo_items: p.combo_items.map((c) => ({
                        product_id: c.product_id,
                        qty: c.qty,
                      })),
                      photo_url: p.photo_url,
                      photo_preview: p.photo_signed_url,
                    });
                  }}
                  className="soft-press grid size-9 place-items-center rounded-2xl border border-border"
                  aria-label={t("edit")}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(p)}
                  className="soft-press grid size-9 place-items-center rounded-2xl bg-destructive/10 text-destructive"
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </StaffShell>
  );
}
