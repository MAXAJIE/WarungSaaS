import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, ChevronDown, QrCode, RefreshCw, Soup, Store, Timer, X } from "lucide-react";
import { Loading, StaffShell, useMe, type StoreRole } from "@/components/staff-shell";
import { EmptyState } from "@/components/empty-state";
import { OrderProgress } from "@/components/order-progress";
import { QrScannerBox } from "@/components/qr-scanner-box";
import { ConfirmDialog, Modal } from "@/components/modal";
import { PaymentReview, type CounterGift, type CounterOrder } from "@/components/payment-review";
import {
  CartSummary,
  ProductCustomizeSheet,
  ProductPickerGrid,
  type CartEntry,
  type PickerProduct,
} from "@/components/counter-product-picker";
import { useI18n, statusKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  advanceOrder,
  cancelOrder,
  createWalkInOrder,
  findOrderByCode,
  listOrders,
} from "@/lib/orders.functions";
import {
  createStore,
  joinWithInvite,
  listProducts,
  listPromos,
  peekInvite,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type OrderRow = {
  id: string;
  order_no: number | null;
  /** Pickup number shouted at the counter. */
  order_code?: string | null;
  customer_name: string;
  note: string;
  status: string;
  subtotal: number | string;
  discount_total: number | string;
  total: number | string;
  created_at: string;
  completed_at?: string | null;
  qr_token?: string | null;
  qr_expires_at?: string | null;
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

/** A submitted order only really counts once its QR is still live. */
function hasLiveQr(o: OrderRow, now: number) {
  if (!o.qr_token) return false;
  if (!o.qr_expires_at) return true;
  return new Date(o.qr_expires_at).getTime() > now;
}

function DashboardPage() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (!me.data?.member) return <Onboarding />;
  const roles = (me.data.roles?.length ? me.data.roles : [me.data.member.role]) as StoreRole[];
  const isOwner = roles.includes("owner");
  const isCashier = roles.includes("cashier");
  const title = isOwner
    ? "Owner"
    : isCashier
      ? "Counter"
      : roles.includes("kitchen")
        ? "Kitchen"
        : "Pickup";
  return (
    <StaffShell title={title} roles={roles} storeName={me.data.store?.name ?? null}>
      {/* One board per hat: the counter board, then any crew board the same
          person also covers. */}
      {(isOwner || isCashier) && <CashierBoard roles={roles} />}
      {roles.includes("kitchen") && <CrewBoard role="kitchen" />}
      {roles.includes("pickup") && !roles.includes("kitchen") && <CrewBoard role="pickup" />}
      {roles.includes("kitchen") && roles.includes("pickup") && <CrewBoard role="pickup" />}
    </StaffShell>
  );
}

/* ------------------------- onboarding ------------------------- */

function Onboarding() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const create = useServerFn(createStore);
  const join = useServerFn(joinWithInvite);
  const peek = useServerFn(peekInvite);
  const [path, setPath] = useState<"pick" | "owner" | "code">("pick");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState<{
    code: string;
    role: "cashier" | "kitchen" | "pickup";
    storeName: string;
  } | null>(null);

  const createM = useMutation({
    mutationFn: () => create({ data: { name, slug: slug || name } }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });
  const peekM = useMutation({
    mutationFn: () => peek({ data: { code } }),
    onSuccess: (res) =>
      setInvite({
        code: res.code,
        // Invites only ever hand out a single working role.
        role: res.role as "cashier" | "kitchen" | "pickup",
        storeName: res.storeName,
      }),
    onError: (e: Error) => toast.error(e.message),
  });
  const joinM = useMutation({
    mutationFn: () => join({ data: { code: invite!.code, role: invite!.role } }),
    onSuccess: () => {
      toast.success(t("joined"));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ROLES: Array<{ id: "cashier" | "kitchen" | "pickup"; icon: typeof Store }> = [
    { id: "cashier", icon: Store },
    { id: "kitchen", icon: Soup },
    { id: "pickup", icon: QrCode },
  ];

  if (invite) {
    return (
      <div className="mx-auto max-w-xl space-y-5 px-4 py-10 duration-300 animate-in fade-in slide-in-from-bottom-2">
        <div className="cozy-card p-6">
          <h1 className="font-display text-2xl font-bold">{t("choose_role")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invite.storeName} · {t("role_pick_hint")}
          </p>
          <div className="mt-4 grid gap-3">
            {ROLES.map((r) => {
              const active = invite.role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!active}
                  onClick={() => setInvite({ ...invite, role: r.id })}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ${
                    active ? "border-primary bg-primary/10 shadow-lift" : "border-border opacity-45"
                  }`}
                >
                  <span className="grid size-10 place-items-center rounded-2xl bg-card">
                    <r.icon className="size-5" />
                  </span>
                  <span className="font-semibold">{t(`role_${r.id}`)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setInvite(null)}
              className="soft-press rounded-2xl border border-border px-4 py-3 text-sm font-semibold"
            >
              {t("back")}
            </button>
            <button
              onClick={() => joinM.mutate()}
              disabled={joinM.isPending}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {t("continue")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-80 rounded-full bg-secondary/20 blur-3xl" />
      <div className="relative mx-auto max-w-xl space-y-5 px-4 py-14">
        <div className="text-center duration-500 animate-in fade-in slide-in-from-bottom-3">
          <span className="inline-grid size-14 place-items-center rounded-3xl bg-primary/10 text-primary shadow-lift">
            <Soup className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">{t("app_name")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("tagline")}</p>
        </div>

        {path === "pick" && (
          <div className="space-y-3 duration-300 animate-in fade-in">
            <button
              onClick={() => setPath("owner")}
              className="soft-press group flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left shadow-lift transition-all duration-200 hover:-translate-y-1 hover:border-primary"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110">
                <Store className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-bold">{t("i_am_owner")}</span>
                <span className="block text-xs text-muted-foreground">{t("create_store")}</span>
              </span>
            </button>
            <button
              onClick={() => setPath("code")}
              className="soft-press group flex w-full items-center gap-4 rounded-3xl border border-border bg-card p-5 text-left shadow-lift transition-all duration-200 hover:-translate-y-1 hover:border-primary"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary/20 transition-transform duration-200 group-hover:scale-110">
                <QrCode className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-bold">{t("i_have_code")}</span>
                <span className="block text-xs text-muted-foreground">{t("join_store")}</span>
              </span>
            </button>
          </div>
        )}

        {path === "owner" && (
          <div className="cozy-card p-6 duration-300 animate-in fade-in">
            <h1 className="font-display text-2xl font-bold">{t("create_store")}</h1>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("store_name")}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t("store_slug")}
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">{t("store_slug_hint")}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPath("pick")}
                  className="soft-press rounded-2xl border border-border px-4 py-3 text-sm font-semibold"
                >
                  {t("back")}
                </button>
                <button
                  onClick={() => createM.mutate()}
                  disabled={!name || createM.isPending}
                  className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {t("create_store")}
                </button>
              </div>
            </div>
          </div>
        )}

        {path === "code" && (
          <div className="cozy-card p-6 duration-300 animate-in fade-in">
            <h2 className="font-display text-xl font-bold">{t("join_store")}</h2>
            <div className="mt-4 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("invite_code")}
                className="flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm uppercase outline-none focus:border-primary"
              />
              <button
                onClick={() => peekM.mutate()}
                disabled={!code || peekM.isPending}
                className="soft-press rounded-2xl bg-secondary px-5 py-3 text-sm font-bold text-secondary-foreground disabled:opacity-60"
              >
                {t("join")}
              </button>
            </div>
            <button
              onClick={() => setPath("pick")}
              className="soft-press mt-3 rounded-2xl border border-border px-4 py-2 text-sm font-semibold"
            >
              {t("back")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- shared bits ------------------------- */

function useOrders() {
  const fn = useServerFn(listOrders);
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => fn({}),
    refetchInterval: 8000,
  });
}

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const tone: Record<string, string> = {
    submitted: "bg-accent text-accent-foreground",
    approved: "bg-secondary text-secondary-foreground",
    preparing: "bg-primary/15 text-primary",
    kitchen_done: "bg-chart-2/20 text-foreground",
    received: "bg-chart-3/20 text-foreground",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone[status] ?? "bg-muted"}`}
    >
      {t(statusKey(status))}
    </span>
  );
}

function OrderCard({
  order,
  currency,
  children,
  onClick,
}: {
  order: OrderRow;
  currency: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <article
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`cozy-card p-4 ${onClick ? "soft-press cursor-pointer text-left" : ""}`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold">
            {order.order_code ?? (order.order_no ? `#${order.order_no}` : t("st_submitted"))}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {order.order_code && order.order_no ? `#${order.order_no} · ` : ""}
            {order.customer_name}
          </p>
        </div>
        <div className="shrink-0">
          <StatusPill status={order.status} />
        </div>
      </div>

      <div className="mt-3">
        <OrderProgress status={order.status} />
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3">
            <span>
              <span className="font-semibold">{i.qty}×</span> {i.name_snapshot}
            </span>
            <span className="text-muted-foreground">
              {formatMoney(Number(i.unit_price) * i.qty, currency)}
            </span>
          </li>
        ))}
      </ul>

      {order.note && <p className="mt-2 text-xs italic text-muted-foreground">“{order.note}”</p>}

      <div className="mt-3 space-y-0.5 border-t border-border pt-2 text-sm">
        {Number(order.discount_total) - Number(order.special_discount ?? 0) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>
              {t("promo_discount")}
              {order.voucher ? ` · ${order.voucher.code}` : ""}
            </span>
            <span>
              -
              {formatMoney(
                Number(order.discount_total) - Number(order.special_discount ?? 0),
                currency,
              )}
            </span>
          </div>
        )}
        {Number(order.special_discount ?? 0) > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-muted-foreground">
            <span className="min-w-0 truncate">
              {t("special_discount")}
              {order.special_discount_reason ? ` · ${order.special_discount_reason}` : ""}
            </span>
            <span className="shrink-0">-{formatMoney(order.special_discount ?? 0, currency)}</span>
          </div>
        )}
        {order.gift && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t("gifts")}</span>
            <span>{order.gift.name}</span>
          </div>
        )}
        <div className="flex justify-between font-display text-lg font-bold">
          <span>{t("total")}</span>
          <span>{formatMoney(order.total, currency)}</span>
        </div>
      </div>

      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </article>
  );
}

function ActionButton({
  onClick,
  children,
  tone = "primary",
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "primary" | "muted" | "danger";
  disabled?: boolean;
}) {
  const cls =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : "border border-border bg-card text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`soft-press inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold disabled:opacity-60 ${cls}`}
    >
      {children}
    </button>
  );
}

/**
 * Read-only receipt for a closed ticket: every line, every voucher, the event
 * discount and its reason, the gift, and the timestamps. No approve/amend
 * actions ever appear here — Done tickets are history, not a workflow.
 */
function OrderDetailModal({
  order,
  currency,
  onClose,
}: {
  order: OrderRow | null;
  currency: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!order) return null;
  const vouchers = order.vouchers?.map((v) => v.voucher) ?? [];
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={order.order_code ?? (order.order_no ? `#${order.order_no}` : t("order_detail"))}
      subtitle={`${order.order_no ? `#${order.order_no} · ` : ""}${order.customer_name}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <p className="min-w-0 truncate text-sm text-muted-foreground">{t("status")}</p>
          <div className="shrink-0">
            <StatusPill status={order.status} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("ticket_cart")}
          </p>
          <ul className="space-y-1 text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{i.qty}×</span> {i.name_snapshot}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatMoney(i.unit_price, currency)} ={" "}
                  {formatMoney(Number(i.unit_price) * i.qty, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {vouchers.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("vouchers")}
            </p>
            <div className="flex flex-wrap gap-2">
              {vouchers.map((v) => (
                <span
                  key={v.id}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                >
                  {v.code}
                  {v.label ? ` · ${v.label}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-0.5 border-t border-border pt-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("subtotal")}</span>
            <span>{formatMoney(order.subtotal, currency)}</span>
          </div>
          {Number(order.special_discount ?? 0) > 0 && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-muted-foreground">
              <span className="min-w-0 truncate">
                {t("special_discount")}
                {order.special_discount_reason ? ` · ${order.special_discount_reason}` : ""}
              </span>
              <span className="shrink-0">
                -{formatMoney(order.special_discount ?? 0, currency)}
              </span>
            </div>
          )}
          {Number(order.discount_total) - Number(order.special_discount ?? 0) > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>
                {t("promo_discount")}
                {order.voucher ? ` · ${order.voucher.code}` : ""}
              </span>
              <span>
                -
                {formatMoney(
                  Number(order.discount_total) - Number(order.special_discount ?? 0),
                  currency,
                )}
              </span>
            </div>
          )}
          {order.gift && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t("gifts")}</span>
              <span>{order.gift.name}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-lg font-bold">
            <span>{t("total")}</span>
            <span>{formatMoney(order.total, currency)}</span>
          </div>
        </div>

        <div className="space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
          <p>
            {t("order_created")}: {new Date(order.created_at).toLocaleString()}
          </p>
          {order.completed_at && (
            <p>
              {t("order_closed")}: {new Date(order.completed_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------- cashier ------------------------- */

function CashierBoard({ roles: _roles }: { roles: StoreRole[] }) {
  const { t } = useI18n();
  const [showAllDone, setShowAllDone] = useState(false);
  const qc = useQueryClient();
  const orders = useOrders();
  const [tab, setTab] = useState<"live" | "scan" | "new">("live");
  /** Ticks every 30s so a QR that just expired stops being counted without a refetch. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const [detail, setDetail] = useState<OrderRow | null>(null);

  const cancel = useServerFn(cancelOrder);
  const find = useServerFn(findOrderByCode);

  // Menu and promos are loaded once for the whole board: the walk-in grid, the
  // payment popup's "add missing items" sheet and the gift chips all read them.
  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: useServerFn(listProducts) as never,
  });
  const promosQ = useQuery({ queryKey: ["promos"], queryFn: useServerFn(listPromos) as never });
  const products = ((productsQ.data as PickerProduct[] | undefined) ?? []).filter(Boolean);
  const gifts = (promosQ.data as { gifts?: CounterGift[] } | undefined)?.gifts ?? [];

  const run = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const currency = orders.data?.store.currency ?? "MYR";
  const list = (orders.data?.orders ?? []) as unknown as OrderRow[];
  /**
   * Unpaid tickets never sit on the counter board: they live on the guest's
   * phone until the counter scans their QR. "In progress" is therefore paid
   * work only, and the single action left on it is cancelling.
   */
  const active = list.filter((o) =>
    ["approved", "preparing", "kitchen_done", "received"].includes(o.status),
  );
  // A submitted order is only a real ticket to chase while its QR is still
  // live; once it expires or gets invalidated it self-heals off this count.
  const awaiting = list.filter((o) => o.status === "submitted" && hasLiveQr(o, now));
  const done = [...list.filter((o) => ["completed", "cancelled"].includes(o.status))].sort(
    (a, b) =>
      new Date(b.completed_at ?? b.created_at).getTime() -
      new Date(a.completed_at ?? a.created_at).getTime(),
  );
  /** Which order a confirmation dialog is currently asking about. */
  const [confirm, setConfirm] = useState<OrderRow | null>(null);
  /** The ticket the payment popup is reviewing, from a scan or a fresh walk-in. */
  const [review, setReview] = useState<CounterOrder | null>(null);
  /**
   * A walk-in ticket only exists because the popup is open. Closing or
   * cancelling that popup must delete it again, otherwise it lingers forever as
   * a ghost "awaiting payment" the counter can never scan.
   */
  const walkInId = useRef<string | null>(null);

  function discardWalkIn() {
    const id = walkInId.current;
    walkInId.current = null;
    setReview(null);
    if (!id) return;
    void cancel({ data: { orderId: id, reason: "walk-in cancelled at counter" } })
      .catch(() => undefined)
      .finally(() => qc.invalidateQueries({ queryKey: ["orders"] }));
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {(["live", "scan", "new"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`soft-press truncate rounded-2xl px-3 py-2.5 text-sm font-bold ${
              tab === k ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {k === "live" ? t("nav_orders") : k === "scan" ? t("nav_scan") : t("walkin_tab")}
          </button>
        ))}
      </div>

      {tab === "scan" && (
        <div className="mx-auto max-w-md space-y-3">
          <QrScannerBox
            onScan={(code) =>
              find({ data: { code } })
                .then((o) => setReview(o as unknown as CounterOrder))
                .catch(() => toast.error(t("scan_expired")))
            }
          />
          <p className="text-center text-xs text-muted-foreground">{t("awaiting_hint")}</p>
        </div>
      )}

      {tab === "new" && (
        <WalkInPanel
          products={products}
          currency={currency}
          onCreated={(o) => {
            walkInId.current = o.id;
            setReview(o);
          }}
        />
      )}

      {tab === "live" && (
        <>
          {orders.isLoading && <Loading />}
          <Section
            title={`${t("orders_active")} (${active.length})`}
            empty={t("empty_active_orders")}
          >
            {active.map((o) => (
              <OrderCard key={o.id} order={o} currency={currency}>
                <ActionButton tone="danger" onClick={() => setConfirm(o)}>
                  <Ban className="size-4" /> {t("cancel")}
                </ActionButton>
              </OrderCard>
            ))}
          </Section>

          {/* Unpaid tickets are only counted here — no detail, no approve — so a
              cashier cannot take money without scanning the guest's QR. */}
          {awaiting.length > 0 && (
            <div className="cozy-card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-display text-base font-bold">
                  {t("awaiting_payment")} · {awaiting.length}
                </p>
                <p className="text-xs text-muted-foreground">{t("awaiting_hint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setTab("scan")}
                className="soft-press inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                <QrCode className="size-4" /> {t("nav_scan")}
              </button>
            </div>
          )}

          <Section title={`${t("orders_done")} (${done.length})`} empty={t("empty_done_orders")}>
            {/* The board stays readable: only the last three closed tickets,
                with the rest one click away. */}
            {(showAllDone ? done : done.slice(0, 3)).map((o) => (
              <OrderCard key={o.id} order={o} currency={currency} onClick={() => setDetail(o)} />
            ))}
          </Section>
          {done.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllDone((v) => !v)}
              className="soft-press mx-auto flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold"
            >
              <ChevronDown
                className={`size-4 transition-transform ${showAllDone ? "rotate-180" : ""}`}
              />
              {showAllDone ? t("view_less") : `${t("view_more_history")} (${done.length - 3})`}
            </button>
          )}
        </>
      )}

      <OrderDetailModal order={detail} currency={currency} onClose={() => setDetail(null)} />

      <PaymentReview
        open={!!review}
        order={review}
        products={products}
        gifts={gifts}
        currency={currency}
        onClose={discardWalkIn}
        onApproved={() => {
          // Approved tickets are real orders now — keep them.
          walkInId.current = null;
          setTab("live");
        }}
      />

      {/* Cancelling is irreversible, so it never happens on a single stray tap. */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t("confirm_cancel_title")}
        message={`${t("confirm_cancel_body")} ${
          confirm ? (confirm.order_code ?? `#${confirm.order_no ?? ""}`) : ""
        }`.trim()}
        confirmLabel={t("confirm_cancel_yes")}
        destructive
        onConfirm={() => {
          if (!confirm) return;
          const orderId = confirm.id;
          run.mutate(() => cancel({ data: { orderId } }));
        }}
      />
    </div>
  );
}

function Section({
  title,
  children,
  empty: emptyLabel,
}: {
  title: string;
  children: React.ReactNode;
  /** Copy shown when this particular list is empty. */
  empty?: string;
}) {
  const { t } = useI18n();
  const empty = !Array.isArray(children) || children.length === 0;
  return (
    <section>
      <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
      {empty ? (
        <p className="cozy-card p-6 text-center text-sm text-muted-foreground">
          {emptyLabel ?? t("no_orders")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

/**
 * Walk-in ticket: square product widgets, a customise sheet per dish (including
 * every part of a combo), then Create order — which hands straight over to the
 * same payment popup a scanned customer order uses.
 */
function WalkInPanel({
  products,
  currency,
  onCreated,
}: {
  products: PickerProduct[];
  currency: string;
  onCreated: (order: CounterOrder) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const create = useServerFn(createWalkInOrder);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [picking, setPicking] = useState<PickerProduct | null>(null);
  const [name, setName] = useState("");

  const total = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.item.qty, 0), [cart]);

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          customer_name: name.trim() || "Walk-in",
          items: cart.map((c) => c.item),
        },
      }),
    onSuccess: (order) => {
      toast.success(t("walkin_created"));
      setCart([]);
      setName("");
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (order) onCreated(order as unknown as CounterOrder);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-muted-foreground">{t("walkin_grid_hint")}</p>
      <ProductPickerGrid products={products} onPick={setPicking} />

      <div className="mx-auto max-w-md space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("walkin_customer_name")}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <CartSummary
          cart={cart}
          currency={currency}
          onRemove={(key) => setCart((c) => c.filter((e) => e.key !== key))}
        />
        <ActionButton onClick={() => createM.mutate()} disabled={!cart.length || createM.isPending}>
          <Store className="size-4" /> {t("create_order_cta")} · {formatMoney(total, currency)}
        </ActionButton>
      </div>

      <ProductCustomizeSheet
        open={!!picking}
        product={picking}
        products={products}
        onClose={() => setPicking(null)}
        onConfirm={(entry) => setCart((c) => [...c, entry])}
      />
    </div>
  );
}

/* ------------------------- kitchen / pickup ------------------------- */

function CrewBoard({ role }: { role: "kitchen" | "pickup" }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const orders = useOrders();
  const me = useMe();
  const myGroupId = me.data?.member?.group_id ?? null;
  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: useServerFn(listProducts) as never,
    enabled: !!myGroupId,
  });
  const advance = useServerFn(advanceOrder);
  const [live, setLive] = useState(true);
  /** Handing food over closes the ticket, so it always asks first. */
  const [handOver, setHandOver] = useState<OrderRow | null>(null);

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => setLive(false), 15 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [live]);

  const run = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const currency = orders.data?.store.currency ?? "MYR";
  // A member assigned to a compartment (cupping, sealing, cooking…) is routed
  // straight to the orders their group is responsible for.
  const groupProductIds = new Set(
    (
      (productsQ.data as
        Array<{ id: string; group_id: string | null; group_ids?: string[] }> | undefined) ?? []
    )
      .filter((p) =>
        (p.group_ids?.length ? p.group_ids : p.group_id ? [p.group_id] : []).includes(
          myGroupId as string,
        ),
      )
      .map((p) => p.id),
  );
  const mine = ((orders.data?.orders ?? []) as unknown as OrderRow[]).filter((o) =>
    myGroupId && groupProductIds.size
      ? o.items.some((i) => i.product_id && groupProductIds.has(i.product_id))
      : true,
  );
  const list = mine.filter((o) =>
    role === "kitchen"
      ? ["approved", "preparing", "kitchen_done"].includes(o.status)
      : ["kitchen_done", "received"].includes(o.status),
  );
  /**
   * Pickup crew may follow approved tickets while the kitchen still cooks them,
   * but strictly as a read-only heads-up: no buttons until the kitchen marks
   * the ticket ready to pick-up (`kitchen_done`).
   */
  const watching =
    role === "pickup" ? mine.filter((o) => ["approved", "preparing"].includes(o.status)) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className={live ? "live-dot" : ""}>
            <Timer className="size-4" />
          </span>
          {live ? t("live_on") : t("live_paused")}
        </span>
        <button
          onClick={() => {
            setLive(true);
            orders.refetch();
          }}
          className="soft-press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <RefreshCw className="size-3.5" /> {live ? t("refresh") : t("live_resume")}
        </button>
      </div>
      {me.data?.group && (
        <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
          {t("your_group")}: {me.data.group.name}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("idle_note")}</p>

      {orders.isLoading ? (
        <Loading />
      ) : list.length === 0 && watching.length === 0 ? (
        <EmptyState
          title={role === "kitchen" ? t("empty_kitchen_title") : t("empty_pickup_title")}
          hint={role === "kitchen" ? t("empty_kitchen_hint") : t("empty_pickup_hint")}
        />
      ) : list.length === 0 ? null : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} currency={currency}>
              {role === "kitchen" ? (
                <>
                  {o.status === "approved" && (
                    <ActionButton
                      onClick={() =>
                        run.mutate(() => advance({ data: { orderId: o.id, action: "start" } }))
                      }
                    >
                      <Soup className="size-4" /> {t("start_cooking")}
                    </ActionButton>
                  )}
                  {["approved", "preparing"].includes(o.status) && (
                    // Stays white until cooking has actually started, then it is
                    // the obvious next step and turns primary.
                    <ActionButton
                      tone={o.status === "approved" ? "muted" : "primary"}
                      onClick={() =>
                        run.mutate(() =>
                          advance({ data: { orderId: o.id, action: "kitchen_done" } }),
                        )
                      }
                    >
                      <Check className="size-4" /> {t("mark_done")}
                    </ActionButton>
                  )}
                </>
              ) : (
                <>
                  {o.status === "kitchen_done" && (
                    <ActionButton
                      onClick={() =>
                        run.mutate(() => advance({ data: { orderId: o.id, action: "receive" } }))
                      }
                    >
                      <QrCode className="size-4" /> {t("receive_items")}
                    </ActionButton>
                  )}
                  {/* Handing over only becomes the primary action once the
                      items were confirmed as received at the counter. */}
                  <ActionButton
                    tone={o.status === "kitchen_done" ? "muted" : "primary"}
                    onClick={() => setHandOver(o)}
                  >
                    <Check className="size-4" /> {t("hand_over")}
                  </ActionButton>
                </>
              )}
            </OrderCard>
          ))}
        </div>
      )}

      {watching.length > 0 && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-bold">{t("pickup_in_kitchen_title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("pickup_in_kitchen_hint")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {watching.map((o) => (
              <div key={o.id} className="pointer-events-none opacity-70">
                <OrderCard order={o} currency={currency}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                    <Timer className="size-3.5" /> {t("pickup_view_only")}
                  </span>
                </OrderCard>
              </div>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!handOver}
        onClose={() => setHandOver(null)}
        title={t("confirm_pickup_title")}
        message={`${t("confirm_pickup_body")} ${
          handOver ? (handOver.order_code ?? `#${handOver.order_no ?? ""}`) : ""
        }`.trim()}
        confirmLabel={t("confirm_pickup_yes")}
        onConfirm={() => {
          if (!handOver) return;
          const id = handOver.id;
          run.mutate(() => advance({ data: { orderId: id, action: "complete" } }));
        }}
      />
    </div>
  );
}
