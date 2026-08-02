import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, QrCode, Plus, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { QrScannerBox, parsePromoCode } from "@/components/qr-scanner-box";
import { OrderBlockers } from "@/components/order-blockers";
import {
  CartSummary,
  ProductCustomizeSheet,
  ProductPickerGrid,
  type CartEntry,
  type PickerProduct,
} from "@/components/counter-product-picker";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  amendOrderItems,
  applyVoucher,
  approveOrder,
  getOrderBlockers,
  removeVoucher,
  setOrderGift,
  setSpecialDiscount,
} from "@/lib/orders.functions";
import type { Blocker } from "@/lib/vouchers";

/** Unmet terms, grouped by the voucher that asks for them. */
type BlockerGroup = { code: string; label: string; blockers: Blocker[] };

/** The shape of an order row as the counter screens read it. */
export type CounterOrder = {
  id: string;
  order_no: number | null;
  order_code?: string | null;
  customer_name: string;
  note: string;
  status: string;
  subtotal: number | string;
  discount_total: number | string;
  total: number | string;
  created_at: string;
  items: Array<{
    id: string;
    product_id?: string | null;
    name_snapshot: string;
    qty: number;
    unit_price: number | string;
  }>;
  voucher?: { code: string; label: string } | null;
  gift?: { name: string } | null;
  vouchers?: Array<{ voucher: { id: string; code: string; label: string } }>;
  special_discount?: number | string | null;
  special_discount_reason?: string | null;
};

export type CounterGift = {
  id: string;
  name: string;
  threshold: number | string;
  is_active: boolean;
};

const inputCls =
  "w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * The one popup the counter uses to take money — reached both by scanning a
 * customer's order QR and straight after creating a walk-in ticket.
 *
 * It can stack promo codes, run the event discount with a reason, add the items
 * a promo still needs (which syncs to the guest's phone), and only then approve
 * payment: while any voucher term is unmet, Approve stays locked.
 */
export function PaymentReview({
  open,
  order: initial,
  products,
  gifts,
  currency,
  onClose,
  onApproved,
}: {
  open: boolean;
  order: CounterOrder | null;
  products: PickerProduct[];
  gifts: CounterGift[];
  currency: string;
  onClose: () => void;
  onApproved?: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const applyV = useServerFn(applyVoucher);
  const dropV = useServerFn(removeVoucher);
  const blockersFn = useServerFn(getOrderBlockers);
  const amend = useServerFn(amendOrderItems);
  const discountFn = useServerFn(setSpecialDiscount);
  const giftFn = useServerFn(setOrderGift);
  const approve = useServerFn(approveOrder);

  const [order, setOrder] = useState<CounterOrder | null>(initial);
  const [groups, setGroups] = useState<BlockerGroup[]>([]);
  const [code, setCode] = useState("");
  const [scan, setScan] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [picking, setPicking] = useState<PickerProduct | null>(null);
  const [extra, setExtra] = useState<CartEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    setOrder(initial);
    setGroups([]);
    setCode("");
    setExtra([]);
    setAmount(
      initial?.special_discount && Number(initial.special_discount) > 0
        ? String(Number(initial.special_discount))
        : "",
    );
    setReason(initial?.special_discount_reason ?? "");
  }, [open, initial]);

  const orderId = order?.id ?? null;

  /** Blockers are recomputed server-side after every change to the ticket. */
  async function refreshBlockers(id: string | null = orderId) {
    if (!id) return;
    const res = await blockersFn({ data: { orderId: id } }).catch(() => null);
    setGroups((res?.blockers ?? []) as BlockerGroup[]);
  }

  useEffect(() => {
    if (open && orderId) void refreshBlockers(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const productNames = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])),
    [products],
  );
  const attached = order?.vouchers?.map((v) => v.voucher) ?? [];
  const eligibleGifts = order
    ? gifts.filter((g) => g.is_active && Number(order.total) >= Number(g.threshold))
    : [];

  function settle(next: unknown) {
    if (next) setOrder(next as CounterOrder);
    void refreshBlockers();
    qc.invalidateQueries({ queryKey: ["orders"] });
  }

  const voucherM = useMutation({
    mutationFn: (c: string) => applyV({ data: { orderId: orderId!, code: c } }),
    onSuccess: (res) => {
      const r = res as {
        ok: boolean;
        reason?: string;
        order?: unknown;
        blockers?: BlockerGroup[];
      };
      if (!r.ok) {
        toast.error(
          r.reason === "used"
            ? t("voucher_used")
            : r.reason === "expired"
              ? t("blocker_expired")
              : r.reason === "already_applied"
                ? t("voucher_applied")
                : r.reason === "not_stackable"
                  ? t("voucher_not_stackable")
                  : t("voucher_invalid"),
        );
        return;
      }
      toast.success(t("voucher_applied"));
      setCode("");
      if (r.order) setOrder(r.order as CounterOrder);
      setGroups((r.blockers ?? []) as BlockerGroup[]);
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (voucherId: string) => dropV({ data: { orderId: orderId!, voucherId } }),
    onSuccess: (res) => {
      toast.success(t("voucher_removed"));
      settle(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discountM = useMutation({
    mutationFn: (clear?: boolean) =>
      discountFn({
        data: {
          orderId: orderId!,
          amount: clear ? 0 : Number(amount) || 0,
          reason: clear ? "" : reason.trim(),
        },
      }),
    onSuccess: (res, clear) => {
      toast.success(clear ? t("discount_cleared") : t("discount_applied"));
      if (clear) {
        setAmount("");
        setReason("");
      }
      settle(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amendM = useMutation({
    mutationFn: () =>
      amend({
        data: {
          orderId: orderId!,
          add: extra.map((e) => e.item),
          note: t("items_added"),
        },
      }),
    onSuccess: (res) => {
      toast.success(t("items_added"));
      setExtra([]);
      setAddOpen(false);
      settle(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLineM = useMutation({
    mutationFn: (itemId: string) =>
      amend({ data: { orderId: orderId!, removeItemIds: [itemId], note: t("items_added") } }),
    onSuccess: (res) => settle(res),
    onError: (e: Error) => toast.error(e.message),
  });

  const giftM = useMutation({
    mutationFn: (giftId: string | null) => giftFn({ data: { orderId: orderId!, giftId } }),
    onSuccess: (res) => settle(res),
    onError: (e: Error) => toast.error(e.message),
  });

  const approveM = useMutation({
    mutationFn: () => approve({ data: { orderId: orderId! } }),
    onSuccess: () => {
      toast.success(t("order_approved"));
      qc.invalidateQueries({ queryKey: ["orders"] });
      onApproved?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blocked = groups.length > 0;
  const busy =
    voucherM.isPending ||
    removeM.isPending ||
    discountM.isPending ||
    amendM.isPending ||
    approveM.isPending;

  if (!order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("payment_review")}
      subtitle={`${order.order_code ?? `#${order.order_no ?? ""}`} · ${order.customer_name}`}
      size="md"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => (blocked ? toast.error(t("approve_blocked")) : approveM.mutate())}
            disabled={busy || blocked}
            className="soft-press flex-1 items-center justify-center gap-2 truncate rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
          >
            <Check className="inline size-4" /> {t("approve_payment")} ·{" "}
            {formatMoney(order.total, currency)}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Ticket lines. The counter may drop a line the guest changed their
            mind about, as long as one item stays. */}
        <Block title={t("ticket_cart")}>
          <ul className="space-y-1 text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{i.qty}×</span> {i.name_snapshot}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {formatMoney(Number(i.unit_price) * i.qty, currency)}
                  {order.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineM.mutate(i.id)}
                      aria-label={t("remove_item")}
                      className="soft-press grid size-6 shrink-0 place-items-center rounded-full border border-border text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span>{formatMoney(order.subtotal, currency)}</span>
          </div>
          {Number(order.discount_total) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t("discount")}</span>
              <span>-{formatMoney(order.discount_total, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-lg font-bold">
            <span>{t("total")}</span>
            <span>{formatMoney(order.total, currency)}</span>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="soft-press flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold"
          >
            <Plus className="size-4" /> {t("blocker_add_items")}
          </button>
        </Block>

        {groups.map((g) => (
          <div key={g.code} className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wide text-destructive">
              {g.code}
              {g.label ? ` · ${g.label}` : ""}
            </p>
            <OrderBlockers blockers={g.blockers} currency={currency} productNames={productNames} />
          </div>
        ))}

        {/* Promo codes: typed or scanned off a printed voucher. */}
        <Block title={t("promo_code")}>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("promo_code")}
              className={`${inputCls} uppercase`}
            />
            <button
              type="button"
              onClick={() => setScan(true)}
              aria-label={t("scan_voucher")}
              title={t("scan_voucher")}
              className="soft-press grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-card"
            >
              <QrCode className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => voucherM.mutate(code)}
              disabled={!code || voucherM.isPending}
              className="soft-press rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-60"
            >
              {t("apply")}
            </button>
          </div>
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attached.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                >
                  {v.code}
                  <button
                    type="button"
                    onClick={() => removeM.mutate(v.id)}
                    aria-label={t("remove_voucher")}
                    className="text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Block>

        {/* Event discount always carries a reason, so the logs explain itself. */}
        <Block title={t("special_discount")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("discount_amount_label")}
              className={inputCls}
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("discount_reason_label")}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                if (!reason.trim()) {
                  toast.error(t("discount_reason_required"));
                  return;
                }
                discountM.mutate(false);
              }}
              disabled={!Number(amount) || discountM.isPending}
              className="soft-press flex-1 rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-60"
            >
              {t("apply_discount")}
            </button>
            {Number(order.special_discount ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => discountM.mutate(true)}
                className="soft-press rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-destructive"
              >
                {t("clear_discount")}
              </button>
            )}
          </div>
          {order.special_discount_reason && (
            <p className="text-xs text-muted-foreground">
              {t("special_discount")}: {formatMoney(order.special_discount ?? 0, currency)} ·{" "}
              {order.special_discount_reason}
            </p>
          )}
        </Block>

        {eligibleGifts.length > 0 && (
          <Block title={t("gift_eligible")}>
            <div className="flex flex-wrap gap-2">
              {eligibleGifts.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => giftM.mutate(g.id)}
                  className={`soft-press rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    order.gift?.name === g.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </Block>
        )}
      </div>

      <Modal
        open={scan}
        onClose={() => setScan(false)}
        title={t("scan_voucher")}
        subtitle={t("scan_voucher_hint")}
        size="sm"
      >
        <QrScannerBox
          parse={parsePromoCode}
          onScan={(c) => {
            setScan(false);
            setCode(c);
            voucherM.mutate(c);
          }}
        />
      </Modal>

      {/* Adding the item a promo needs — the guest agrees at the counter, and
          their phone picks the change up on its next poll. */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("add_missing_items_title")}
        size="md"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={() => amendM.mutate()}
              disabled={!extra.length || amendM.isPending}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {t("add_to_ticket")}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <ProductPickerGrid products={products} onPick={setPicking} />
          <CartSummary
            cart={extra}
            currency={currency}
            onRemove={(key) => setExtra((c) => c.filter((e) => e.key !== key))}
          />
        </div>
      </Modal>

      <ProductCustomizeSheet
        open={!!picking}
        product={picking}
        products={products}
        onClose={() => setPicking(null)}
        onConfirm={(entry) => setExtra((c) => [...c, entry])}
      />
    </Modal>
  );
}
