import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, Gift, Plus, Printer, Ticket, Trash2 } from "lucide-react";
import { ViewToolbar, useViewPrefs, viewPadClass } from "@/components/view-toolbar";
import { Loading, StaffShell, useStoreGuard } from "@/components/staff-shell";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { rewardSummary, type VoucherReward } from "@/lib/vouchers";
import { downloadVoucherPng, downloadVoucherSheetPng } from "@/components/voucher-canvas";
import {
  VoucherForm,
  type PromoProduct,
  type VoucherTemplateRow,
  type VoucherFormValue,
} from "@/components/voucher-form";
import { GiftForm, type GiftFormValue } from "@/components/gift-form";
import {
  deleteGift,
  deleteVoucher,
  deleteVoucherTemplate,
  listPromos,
  signVoucherArtwork,
  upsertGift,
  upsertVoucher,
  upsertVoucherTemplate,
  uploadVoucherArtwork,
} from "@/lib/staff.functions";

/** localStorage key for the export-time "print the code" toggle. */
const SHOW_CODE_KEY = "warung.voucher.showCode";



export const Route = createFileRoute("/_authenticated/promos")({
  component: PromosPage,
});

type Voucher = {
  id: string;
  code: string;
  label: string | null;
  reward: VoucherReward;
  value: number | string;
  nth_item: number;
  buy_qty: number;
  get_qty: number;
  min_spend: number | string;
  is_active: boolean;
  used_count: number;
  usage_limit: number;
  batch_id: string | null;
  artwork_path: string | null;
  qr_x: number | string;
  qr_y: number | string;
  qr_size: number | string;
  expires_at: string | null;
  terms: string;
};
type GiftRow = {
  id: string;
  name: string;
  note: string | null;
  threshold: number | string;
  stock: number;
  is_active: boolean;
  product_id: string;
  item_qty: number;
  min_items: number;
  required_product_id: string | null;
  required_qty: number;
  terms: string;
};

function batchLabel(vs: Voucher[]) {
  if (vs.length === 1) return vs[0]!.code;
  const codes = vs.map((v) => v.code).sort();
  return `${codes[0]} … ${codes[codes.length - 1]} (${vs.length})`;
}

function PromosPage() {
  const { t } = useI18n();
  const { me, hasStore } = useStoreGuard();
  const qc = useQueryClient();
  const { prefs, set } = useViewPrefs("promos");
  const promos = useQuery({
    queryKey: ["promos"],
    queryFn: useServerFn(listPromos) as never,
    enabled: hasStore,
  });
  const saveV = useServerFn(upsertVoucher);
  const delV = useServerFn(deleteVoucher);
  const saveTpl = useServerFn(upsertVoucherTemplate);
  const delTpl = useServerFn(deleteVoucherTemplate);
  const uploadArt = useServerFn(uploadVoucherArtwork);
  const signArt = useServerFn(signVoucherArtwork);
  const saveG = useServerFn(upsertGift);
  const delG = useServerFn(deleteGift);

  const [openVoucher, setOpenVoucher] = useState(false);
  const [voucherInitial, setVoucherInitial] = useState<Partial<VoucherFormValue> | null>(null);
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null);
  const [openGift, setOpenGift] = useState(false);
  const [giftInitial, setGiftInitial] = useState<Partial<GiftFormValue> | null>(null);
  const [confirmV, setConfirmV] = useState<Voucher | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<{ batchId: string; label: string } | null>(null);
  const [confirmG, setConfirmG] = useState<GiftRow | null>(null);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());
  const [artworkUrls, setArtworkUrls] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["promos"] });

  const data = promos.data as
    | {
        vouchers: Voucher[];
        gifts: GiftRow[];
        templates: VoucherTemplateRow[];
        products: PromoProduct[];
      }
    | undefined;

  const paths = useMemo(() => {
    const set2 = new Set<string>();
    (data?.vouchers ?? []).forEach((v) => v.artwork_path && set2.add(v.artwork_path));
    (data?.templates ?? []).forEach((tpl) => tpl.artwork_path && set2.add(tpl.artwork_path));
    return Array.from(set2);
  }, [data]);

  useMemo(() => {
    if (!paths.length) return;
    const missing = paths.filter((p) => !artworkUrls[p]);
    if (!missing.length) return;
    signArt({ data: { paths: missing } })
      .then((map) => setArtworkUrls((prev) => ({ ...prev, ...map })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join(",")]);

  const batches = useMemo(() => {
    const map = new Map<string, Voucher[]>();
    for (const v of data?.vouchers ?? []) {
      const key = v.batch_id ?? v.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries());
  }, [data]);

  const vSaveM = useMutation({
    mutationFn: (value: VoucherFormValue) =>
      saveV({
        data: {
          ...value,
          expires_at: value.expires_at || null,
        },
      }),
    onSuccess: (res: { vouchers: Voucher[] }) => {
      setOpenVoucher(false);
      invalidate();
      if (res?.vouchers?.length) {
        toast.success(t("batch_minted").replace("{count}", String(res.vouchers.length)));
        const bId = res.vouchers[0]?.batch_id ?? res.vouchers[0]?.id;
        if (bId) setOpenBatches((prev) => new Set(prev).add(bId));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gSaveM = useMutation({
    mutationFn: (value: GiftFormValue) => saveG({ data: value }),
    onSuccess: () => {
      setOpenGift(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Owner-controlled switch for what the customer sees on the exported voucher.
   * The QR always encodes the code; this only decides whether the code is also
   * printed as text. Kept in localStorage so the choice survives a reload
   * without touching the vouchers table.
   */
  const [showCode, setShowCode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SHOW_CODE_KEY) !== "0";
  });
  useEffect(() => {
    window.localStorage.setItem(SHOW_CODE_KEY, showCode ? "1" : "0");
  }, [showCode]);

  /**

   * Exported PNGs must match what the owner saw in the placement preview, so the
   * canvas size travels with the artwork: whichever saved design uses the same
   * artwork also carries the width/height the owner typed in.
   */
  function designFor(v: Voucher) {
    const tpl = (data?.templates ?? []).find(
      (tp) => v.artwork_path && tp.artwork_path === v.artwork_path,
    );
    const d = (tpl?.defaults ?? {}) as { width_px?: number; height_px?: number };
    const w = Number(d.width_px) || 0;
    const h = Number(d.height_px) || 0;
    return {
      artworkUrl: v.artwork_path ? (artworkUrls[v.artwork_path] ?? null) : null,
      qr_x: Number(v.qr_x) || 0.78,
      qr_y: Number(v.qr_y) || 0.5,
      qr_size: Number(v.qr_size) || 0.32,
      ...(w > 0 ? { width: w } : {}),
      ...(h > 0 ? { height: h } : {}),
    };
  }

  function exportOne(v: Voucher) {
    downloadVoucherPng(
      { code: v.code, label: v.label, rewardText: rewardSummary(v, "RM"), showCode },
      designFor(v),
    ).catch((e: Error) => toast.error(e.message));
  }

  function exportSheet(vs: Voucher[]) {
    downloadVoucherSheetPng(
      vs.map((v) => ({
        code: v.code,
        label: v.label,
        rewardText: rewardSummary(v, "RM"),
        showCode,
      })),
      designFor(vs[0]!),
    ).catch((e: Error) => toast.error(e.message));
  }


  return (
    <StaffShell
      title={t("nav_promos")}
      roles={
        (me.data?.roles?.length
          ? me.data.roles
          : me.data?.member
            ? [me.data.member.role]
            : []) as never
      }
      storeName={me.data?.store?.name ?? null}
    >
      {/* On phones the toolbar and the two controls stack instead of fighting
          over one flex row, which is what made them overlap. */}
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <ViewToolbar
            prefs={prefs}
            set={set}
            filters={[
              { id: "all", label: t("all") },
              { id: "vouchers", label: t("vouchers") },
              { id: "gifts", label: t("gifts") },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {/* Owner picks what the customer sees on the downloaded voucher. */}
          <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold shadow-cozy">
            <input
              type="checkbox"
              checked={showCode}
              onChange={(e) => setShowCode(e.target.checked)}
              className="size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="truncate">{t("voucher_show_code")}</span>
          </label>

          <details className="group relative shrink-0">
            <summary className="soft-press inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lift">
              <Plus className="size-4" /> {t("new_promo")}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(16rem,calc(100vw-2.5rem))] rounded-2xl border border-border bg-card p-2 shadow-lift">
              <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {t("choose_promo_type")}
              </p>
              <button
                onClick={(e) => {
                  (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                  setVoucherInitial(null);
                  setApplyTemplateId(null);
                  setOpenVoucher(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm font-semibold hover:bg-muted"
              >
                <Ticket className="size-4 text-primary" /> {t("new_voucher")}
              </button>
              <button
                onClick={(e) => {
                  (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                  setGiftInitial(null);
                  setOpenGift(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm font-semibold hover:bg-muted"
              >
                <Gift className="size-4 text-primary" /> {t("new_gift")}
              </button>
            </div>
          </details>
        </div>
      </div>


      {promos.isLoading ? (
        <Loading />
      ) : (
        <div className={prefs.filter === "all" ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"}>
          {prefs.filter !== "gifts" && (
            <section className="space-y-3">
              {batches
                .filter(([, vs]) =>
                  prefs.query
                    ? vs.some((v) =>
                        v.code.toLowerCase().includes(prefs.query.trim().toLowerCase()),
                      )
                    : true,
                )
                .map(([batchId, vs]) => {
                  const isBatch = vs.length > 1;
                  const isOpen = openBatches.has(batchId);
                  const usedTotal = vs.reduce((s, v) => s + (v.used_count || 0), 0);
                  return (
                    <div key={batchId} className={`cozy-card space-y-2 ${viewPadClass(prefs)}`}>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-lg font-bold">{batchLabel(vs)}</p>
                          <p className="text-xs text-muted-foreground">
                            {rewardSummary(vs[0]!, "RM")} · {t("min_spend")}{" "}
                            {formatMoney(vs[0]!.min_spend)} · {t("used_count")} {usedTotal}/
                            {isBatch ? vs.length : vs[0]!.usage_limit || "∞"}
                          </p>
                        </div>
                        {isBatch && (
                          <button
                            onClick={() => exportSheet(vs)}
                            className="soft-press grid size-9 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"
                            aria-label={t("download_sheet")}
                            title={t("download_sheet")}
                          >
                            <Printer className="size-4" />
                          </button>
                        )}
                        {!isBatch && (
                          <button
                            onClick={() => exportOne(vs[0]!)}
                            className="soft-press grid size-9 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground"
                            aria-label={t("download_png")}
                            title={t("download_png")}
                          >
                            <Download className="size-4" />
                          </button>
                        )}
                        <button
                          onClick={() =>
                            isBatch
                              ? setConfirmBatch({ batchId, label: batchLabel(vs) })
                              : setConfirmV(vs[0]!)
                          }
                          className="soft-press grid size-9 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive"
                          aria-label={t("delete")}
                        >
                          <Trash2 className="size-4" />
                        </button>
                        {isBatch && (
                          <button
                            onClick={() =>
                              setOpenBatches((prev) => {
                                const next = new Set(prev);
                                if (next.has(batchId)) next.delete(batchId);
                                else next.add(batchId);
                                return next;
                              })
                            }
                            className="soft-press grid size-9 shrink-0 place-items-center rounded-2xl border border-border"
                            aria-label={isOpen ? t("collapse") : t("expand")}
                          >
                            <ChevronDown
                              className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}
                      </div>
                      {isBatch && isOpen && (
                        <div className="space-y-1.5 border-t border-border/60 pt-2">
                          {vs.map((v) => (
                            <div key={v.id} className="flex items-center gap-2 text-sm">
                              <span className="flex-1 font-mono">{v.code}</span>
                              <span className="text-xs text-muted-foreground">
                                {v.used_count > 0 ? t("used") : t("active")}
                              </span>
                              <button
                                onClick={() => exportOne(v)}
                                className="soft-press grid size-7 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
                                aria-label={t("download_png")}
                              >
                                <Download className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmV(v)}
                                className="soft-press grid size-7 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
                                aria-label={t("delete")}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              {!batches.length && (
                <EmptyState title={t("empty_vouchers_title")} hint={t("empty_vouchers_hint")} />
              )}
            </section>
          )}

          {prefs.filter !== "vouchers" && (
            <section className="space-y-3">
              {(data?.gifts ?? [])
                .filter((g) =>
                  prefs.query
                    ? g.name.toLowerCase().includes(prefs.query.trim().toLowerCase())
                    : true,
                )
                .map((g) => (
                  <div
                    key={g.id}
                    className={`cozy-card flex items-center gap-3 ${viewPadClass(prefs)}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ≥ {formatMoney(g.threshold)} · {g.stock} {t("left")}
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmG(g)}
                      className="soft-press grid size-9 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive"
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              {!(data?.gifts ?? []).length && (
                <EmptyState title={t("empty_gifts_title")} hint={t("empty_gifts_hint")} />
              )}
            </section>
          )}
        </div>
      )}

      <VoucherForm
        open={openVoucher}
        onClose={() => setOpenVoucher(false)}
        products={data?.products ?? []}
        templates={data?.templates ?? []}
        initial={voucherInitial}
        applyTemplateId={applyTemplateId}
        submitting={vSaveM.isPending}
        onSubmit={(value) => vSaveM.mutateAsync(value)}
        onSaveTemplate={(name, value) =>
          saveTpl({
            data: {
              name,
              artwork_path: value.artwork_path,
              qr_x: value.qr_x,
              qr_y: value.qr_y,
              qr_size: value.qr_size,
              defaults: {
                reward: value.reward,
                value: value.value,
                reward_product_id: value.reward_product_id,
                nth_item: value.nth_item,
                buy_qty: value.buy_qty,
                get_qty: value.get_qty,
                stackable: value.stackable,
                max_discount: value.max_discount,
                min_spend: value.min_spend,
                min_items: value.min_items,
                required_product_id: value.required_product_id,
                required_qty: value.required_qty,
                usage_limit: value.usage_limit,
                terms: value.terms,
                // Canvas size travels with the design so a reopened template
                // restores the exact shape the owner drew the QR on.
                width_px: value.width_px,
                height_px: value.height_px,
              },
            },
          }).then(invalidate)
        }
        onDeleteTemplate={(id) => delTpl({ data: { id } }).then(invalidate)}
        onUploadArtwork={(dataUrl) => uploadArt({ data: { dataUrl } })}
        artworkUrls={artworkUrls}
      />

      <GiftForm
        open={openGift}
        onClose={() => setOpenGift(false)}
        products={data?.products ?? []}
        initial={giftInitial}
        submitting={gSaveM.isPending}
        onSubmit={(value) => gSaveM.mutateAsync(value)}
      />

      <ConfirmDialog
        open={!!confirmV}
        onClose={() => setConfirmV(null)}
        onConfirm={() =>
          confirmV &&
          delV({ data: { id: confirmV.id } })
            .then(invalidate)
            .catch((e: Error) => toast.error(e.message))
        }
        title={t("delete")}
        message={`${t("delete_confirm")} ${confirmV?.code ?? ""}`}
        confirmLabel={t("delete")}
        destructive
      />
      <ConfirmDialog
        open={!!confirmBatch}
        onClose={() => setConfirmBatch(null)}
        onConfirm={() =>
          confirmBatch &&
          delV({ data: { batchId: confirmBatch.batchId } })
            .then(invalidate)
            .catch((e: Error) => toast.error(e.message))
        }
        title={t("delete_batch")}
        message={`${t("delete_batch_confirm")} ${confirmBatch?.label ?? ""}`}
        confirmLabel={t("delete")}
        destructive
      />
      <ConfirmDialog
        open={!!confirmG}
        onClose={() => setConfirmG(null)}
        onConfirm={() =>
          confirmG &&
          delG({ data: { id: confirmG.id } })
            .then(invalidate)
            .catch((e: Error) => toast.error(e.message))
        }
        title={t("delete")}
        message={`${t("delete_confirm")} ${confirmG?.name ?? ""}`}
        confirmLabel={t("delete")}
        destructive
      />
    </StaffShell>
  );
}
