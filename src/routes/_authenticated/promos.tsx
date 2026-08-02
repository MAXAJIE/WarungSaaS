import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Gift, Plus, Ticket, Trash2 } from "lucide-react";
import { ViewToolbar, useViewPrefs, viewPadClass } from "@/components/view-toolbar";
import { Loading, StaffShell, useStoreGuard } from "@/components/staff-shell";
import { ConfirmDialog, Modal } from "@/components/modal";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  deleteGift,
  deleteVoucher,
  listPromos,
  upsertGift,
  upsertVoucher,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/promos")({
  component: PromosPage,
});

type Voucher = {
  id: string;
  code: string;
  label: string | null;
  kind: "percent" | "fixed";
  value: number | string;
  min_spend: number | string;
  is_active: boolean;
  used_by_order: string | null;
};
type GiftRow = {
  id: string;
  name: string;
  note: string | null;
  threshold: number | string;
  stock: number;
  is_active: boolean;
};

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
  const saveG = useServerFn(upsertGift);
  const delG = useServerFn(deleteGift);

  const [voucher, setVoucher] = useState({
    code: "",
    label: "",
    kind: "percent" as "percent" | "fixed",
    value: 10,
    min_spend: 0,
  });
  const [gift, setGift] = useState({ name: "", note: "", threshold: 50, stock: 10 });
  const [openVoucher, setOpenVoucher] = useState(false);
  const [openGift, setOpenGift] = useState(false);
  const [confirmV, setConfirmV] = useState<Voucher | null>(null);
  const [confirmG, setConfirmG] = useState<GiftRow | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["promos"] });
  const vM = useMutation({
    mutationFn: () => saveV({ data: voucher }),
    onSuccess: () => {
      setVoucher({ ...voucher, code: "", label: "" });
      setOpenVoucher(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const gM = useMutation({
    mutationFn: () => saveG({ data: gift }),
    onSuccess: () => {
      setGift({ ...gift, name: "", note: "" });
      setOpenGift(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = promos.data as { vouchers: Voucher[]; gifts: GiftRow[] } | undefined;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
        <details className="group relative shrink-0">
          <summary className="soft-press inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lift">
            <Plus className="size-4" /> {t("new_promo")}
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-border bg-card p-2 shadow-lift">
            <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("choose_promo_type")}
            </p>
            <button
              onClick={(e) => {
                (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                setOpenVoucher(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm font-semibold hover:bg-muted"
            >
              <Ticket className="size-4 text-primary" /> {t("new_voucher")}
            </button>
            <button
              onClick={(e) => {
                (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                setOpenGift(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm font-semibold hover:bg-muted"
            >
              <Gift className="size-4 text-primary" /> {t("new_gift")}
            </button>
          </div>
        </details>
      </div>

      {promos.isLoading ? (
        <Loading />
      ) : (
        <div className={prefs.filter === "all" ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"}>
          {prefs.filter !== "gifts" && (
            <section className="space-y-3">
              <Modal
                open={openVoucher}
                onClose={() => setOpenVoucher(false)}
                title={t("new_voucher")}
                size="sm"
                footer={
                  <>
                    <button
                      onClick={() => setOpenVoucher(false)}
                      className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      onClick={() => vM.mutate()}
                      disabled={!voucher.code || vM.isPending}
                      className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
                    >
                      {t("save")}
                    </button>
                  </>
                }
              >
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t("promo_code")}
                    </span>
                    <input
                      value={voucher.code}
                      onChange={(e) => setVoucher({ ...voucher, code: e.target.value })}
                      placeholder={t("promo_code")}
                      className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm uppercase outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {t("label")}
                    </span>
                    <input
                      value={voucher.label}
                      onChange={(e) => setVoucher({ ...voucher, label: e.target.value })}
                      placeholder="Merdeka treat"
                      className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <div className="flex gap-2">
                    {(["percent", "fixed"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setVoucher({ ...voucher, kind: k })}
                        className={`soft-press flex-1 rounded-2xl px-3 py-2 text-sm font-bold ${
                          voucher.kind === k
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card"
                        }`}
                      >
                        {k === "percent" ? t("percent_off") : t("fixed_off")}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {voucher.kind === "percent" ? t("percent_off") : t("fixed_off")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={voucher.value}
                        onChange={(e) => setVoucher({ ...voucher, value: Number(e.target.value) })}
                        className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("min_spend")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={voucher.min_spend}
                        onChange={(e) =>
                          setVoucher({ ...voucher, min_spend: Number(e.target.value) })
                        }
                        placeholder={t("min_spend")}
                        className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                </div>
              </Modal>

              {(data?.vouchers ?? [])
                .filter((v) =>
                  prefs.query
                    ? v.code.toLowerCase().includes(prefs.query.trim().toLowerCase())
                    : true,
                )
                .map((v) => (
                  <div
                    key={v.id}
                    className={`cozy-card flex items-center gap-3 ${viewPadClass(prefs)}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-bold">{v.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.kind === "percent" ? `${Number(v.value)}%` : formatMoney(v.value)} ·{" "}
                        {t("min_spend")} {formatMoney(v.min_spend)} ·{" "}
                        {v.used_by_order ? t("used") : t("active")}
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmV(v)}
                      className="soft-press grid size-9 place-items-center rounded-2xl bg-destructive/10 text-destructive"
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              {!(data?.vouchers ?? []).length && (
                <EmptyState title={t("empty_vouchers_title")} hint={t("empty_vouchers_hint")} />
              )}
            </section>
          )}

          {prefs.filter !== "vouchers" && (
            <section className="space-y-3">
              <Modal
                open={openGift}
                onClose={() => setOpenGift(false)}
                title={t("new_gift")}
                size="sm"
                footer={
                  <>
                    <button
                      onClick={() => setOpenGift(false)}
                      className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      onClick={() => gM.mutate()}
                      disabled={!gift.name || gM.isPending}
                      className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
                    >
                      {t("save")}
                    </button>
                  </>
                }
              >
                <div className="space-y-3">
                  <input
                    value={gift.name}
                    onChange={(e) => setGift({ ...gift, name: e.target.value })}
                    placeholder="Kopi O ais"
                    className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <input
                    value={gift.note}
                    onChange={(e) => setGift({ ...gift, note: e.target.value })}
                    placeholder={t("description")}
                    className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("gift_threshold")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={gift.threshold}
                        onChange={(e) => setGift({ ...gift, threshold: Number(e.target.value) })}
                        className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground">Stock</span>
                      <input
                        type="number"
                        min="0"
                        value={gift.stock}
                        onChange={(e) => setGift({ ...gift, stock: Number(e.target.value) })}
                        className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                </div>
              </Modal>

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
                        ≥ {formatMoney(g.threshold)} · {g.stock} left
                      </p>
                    </div>
                    <button
                      onClick={() => setConfirmG(g)}
                      className="soft-press grid size-9 place-items-center rounded-2xl bg-destructive/10 text-destructive"
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
