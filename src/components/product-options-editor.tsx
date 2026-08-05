import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/modal";
import {
  deleteProductOption,
  listProductOptions,
  upsertProductOption,
} from "@/lib/staff.functions";
import { useI18n } from "@/lib/i18n";

type Value = { id?: string; label: string; price_delta: number };
type OptionDraft = { id?: string; name: string; is_required: boolean; values: Value[] };
/** A customisation group typed before the product exists, kept in the dialog. */
export type LocalOptionGroup = { name: string; is_required: boolean; values: Value[] };

const inputClass =
  "w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";

/**
 * Owner-side editor for the choices a customer sees on a product.
 *
 * Works in two modes:
 * - saved product (`productId` set): groups are read from and written to the server.
 * - unsaved draft (`productId` null): groups live in `localValue` and the parent
 *   dialog persists them right after the product row is created.
 */
export function ProductOptionsEditor({
  productId,
  localValue,
  onLocalChange,
  /**
   * Lets the parent dialog flush an in-progress customisation template when the
   * product itself is saved, so a half-typed group is never silently dropped.
   * Called with a saver while a named draft is open, and with `null` otherwise.
   */
  onPendingSaveChange,
}: {
  productId: string | null;
  localValue?: LocalOptionGroup[];
  onLocalChange?: (groups: LocalOptionGroup[]) => void;
  onPendingSaveChange?: (productId: string, save: (() => Promise<void>) | null) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(listProductOptions);
  const save = useServerFn(upsertProductOption);
  const remove = useServerFn(deleteProductOption);
  const [draft, setDraft] = useState<(OptionDraft & { localIndex?: number }) | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [confirmDeleteValueIdx, setConfirmDeleteValueIdx] = useState<number | null>(null);
  const isLocal = !productId;
  const localGroups = localValue ?? [];

  const options = useQuery({
    queryKey: ["product-options", productId ?? "new"],
    queryFn: () => list({ data: { product_id: productId as string } }),
    enabled: !isLocal,
  });

  // Kept in a ref so the saver handed to the parent always reads the latest
  // draft without the parent having to re-subscribe on every keystroke.
  const draftRef = useRef<(OptionDraft & { localIndex?: number }) | null>(draft);
  draftRef.current = draft;
  const localRef = useRef<LocalOptionGroup[]>(localGroups);
  localRef.current = localGroups;
  const onLocalChangeRef = useRef(onLocalChange);
  onLocalChangeRef.current = onLocalChange;

  const persistDraft = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !d.name.trim()) return;
    const values = d.values.filter((v) => v.label.trim());
    if (isLocal) {
      // Nothing to talk to yet: hold the group in the dialog and let the parent
      // write it once the product row has an id.
      const group: LocalOptionGroup = {
        name: d.name.trim(),
        is_required: d.is_required,
        values: values.map((v) => ({
          label: v.label.trim(),
          price_delta: Number(v.price_delta) || 0,
        })),
      };
      const next =
        d.localIndex === undefined
          ? [...localRef.current, group]
          : localRef.current.map((g, i) => (i === d.localIndex ? group : g));
      localRef.current = next;
      onLocalChangeRef.current?.(next);
      setDraft(null);
      return;
    }
    await save({
      data: {
        ...(d.id ? { id: d.id } : {}),
        product_id: productId as string,
        name: d.name,
        is_required: d.is_required,
        values: values.map((v, i) => ({ ...v, sort_order: i })),
      },
    });
    setDraft(null);
    await qc.invalidateQueries({ queryKey: ["product-options", productId] });
  }, [isLocal, productId, qc, save]);

  const hasPending = !!draft?.name.trim();
  useEffect(() => {
    if (!onPendingSaveChange) return;
    const key = productId ?? "new";
    onPendingSaveChange(key, hasPending ? persistDraft : null);
    return () => onPendingSaveChange(key, null);
  }, [hasPending, onPendingSaveChange, persistDraft, productId]);

  const saveM = useMutation({
    mutationFn: persistDraft,
    onError: (e: Error) => toast.error(e.message),
  });


  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-options", productId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = isLocal
    ? localGroups.map((g, i) => ({
        id: `local-${i}`,
        name: g.name,
        is_required: g.is_required,
        values: g.values.map((v) => ({ label: v.label, price_delta: v.price_delta })),
      }))
    : (options.data ?? []);

  return (
    <div className="space-y-3">
      {isLocal && (
        <p className="text-[11px] text-muted-foreground">{t("options_before_save_hint")}</p>
      )}
      {rows.map((o, rowIndex) => (
        <div key={o.id} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              {o.name}
              {o.is_required && <span className="text-destructive"> *</span>}
            </p>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...(isLocal ? { localIndex: rowIndex } : { id: o.id }),
                  name: o.name,
                  is_required: o.is_required,
                  values: o.values.map((v) => ({
                    ...("id" in v && v.id ? { id: v.id as string } : {}),
                    label: v.label,
                    price_delta: Number(v.price_delta),
                  })),
                })
              }
              className="soft-press rounded-xl border border-border px-3 py-1 text-xs font-bold"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() =>
                isLocal
                  ? setConfirmDeleteGroup({ id: `local-${rowIndex}`, name: o.name })
                  : setConfirmDeleteGroup({ id: o.id, name: o.name })
              }
              aria-label={t("delete")}
              className="soft-press grid size-8 place-items-center rounded-xl bg-destructive/10 text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.values.map((v) => v.label).join(" · ") || "—"}
          </p>
        </div>
      ))}

      {!draft && (
        <button
          type="button"
          onClick={() =>
            setDraft({ name: "", is_required: false, values: [{ label: "", price_delta: 0 }] })
          }
          className="soft-press inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold"
        >
          <Plus className="size-4" /> {t("add_option")}
        </button>
      )}

      {draft && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
          <input
            value={draft.name}
            placeholder={t("option_name")}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.is_required}
              onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })}
            />
            {t("option_required")}
          </label>
          {draft.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={v.label}
                placeholder={t("value_label")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    values: draft.values.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
                className={inputClass}
              />
              <input
                type="number"
                step="0.10"
                value={v.price_delta}
                aria-label={t("price_delta")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    values: draft.values.map((x, j) =>
                      j === i ? { ...x, price_delta: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-28 rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label={t("delete")}
                onClick={() =>
                  v.id
                    ? setConfirmDeleteValueIdx(i)
                    : setDraft({ ...draft, values: draft.values.filter((_, j) => j !== i) })
                }
                className="soft-press grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, values: [...draft.values, { label: "", price_delta: 0 }] })
              }
              className="soft-press rounded-2xl border border-border bg-card px-4 py-2 text-xs font-bold"
            >
              <Plus className="mr-1 inline size-3.5" /> {t("add_value")}
            </button>
            <button
              type="button"
              disabled={!draft.name.trim() || saveM.isPending}
              onClick={() => saveM.mutate()}
              className="soft-press rounded-2xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {t("save_option")}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="soft-press rounded-2xl border border-border px-4 py-2 text-xs font-bold"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onClose={() => setConfirmDeleteGroup(null)}
        onConfirm={() => {
          if (!confirmDeleteGroup) return;
          if (isLocal) {
            const index = Number(confirmDeleteGroup.id.replace("local-", ""));
            const next = localRef.current.filter((_, i) => i !== index);
            localRef.current = next;
            onLocalChangeRef.current?.(next);
            if (draft?.localIndex === index) setDraft(null);
            return;
          }
          delM.mutate(confirmDeleteGroup.id);
        }}
        title={t("delete_option_group_title")}
        message={confirmDeleteGroup?.name ?? ""}
        confirmLabel={t("delete")}
        destructive
      />
      <ConfirmDialog
        open={confirmDeleteValueIdx !== null}
        onClose={() => setConfirmDeleteValueIdx(null)}
        onConfirm={() => {
          if (confirmDeleteValueIdx === null || !draft) return;
          setDraft({
            ...draft,
            values: draft.values.filter((_, j) => j !== confirmDeleteValueIdx),
          });
        }}
        title={t("delete_option_value_title")}
        message={draft?.values[confirmDeleteValueIdx ?? -1]?.label ?? ""}
        confirmLabel={t("delete")}
        destructive
      />
    </div>
  );
}
