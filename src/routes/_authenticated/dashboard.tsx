import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Check, Minus, Plus, QrCode, RefreshCw, Soup, Store, Timer } from "lucide-react";
import { Loading, StaffShell, useMe } from "@/components/staff-shell";
import { OrderProgress } from "@/components/order-progress";
import { QrScannerBox } from "@/components/qr-scanner-box";
import { useI18n, statusKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import {
  advanceOrder,
  applyVoucher,
  approveOrder,
  cancelOrder,
  createWalkInOrder,
  findOrderByCode,
  listOrders,
  setOrderGift,
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
};

function DashboardPage() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (!me.data?.member) return <Onboarding />;
  const role = me.data.member.role;
  return (
    <StaffShell
      title={role === "cashier" ? "Counter" : role === "kitchen" ? "Kitchen" : "Pickup"}
      role={role}
      storeName={me.data.store?.name ?? null}
    >
      {role === "cashier" ? <CashierBoard /> : <CrewBoard role={role} />}
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
    onSuccess: (res) => setInvite({ code: res.code, role: res.role, storeName: res.storeName }),
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
                    active
                      ? "border-primary bg-primary/10 shadow-lift"
                      : "border-border opacity-45"
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
}: {
  order: OrderRow;
  currency: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <article className="cozy-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-bold">
            {order.order_no ? `#${order.order_no}` : t("st_submitted")}
          </p>
          <p className="text-sm text-muted-foreground">{order.customer_name}</p>
        </div>
        <StatusPill status={order.status} />
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
        {Number(order.discount_total) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>
              {t("discount")}
              {order.voucher ? ` · ${order.voucher.code}` : ""}
            </span>
            <span>-{formatMoney(order.discount_total, currency)}</span>
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

/* ------------------------- cashier ------------------------- */

function CashierBoard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const orders = useOrders();
  const [tab, setTab] = useState<"live" | "scan" | "new">("live");

  const advance = useServerFn(advanceOrder);
  const approve = useServerFn(approveOrder);
  const cancel = useServerFn(cancelOrder);

  const run = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const currency = orders.data?.store.currency ?? "MYR";
  const list = (orders.data?.orders ?? []) as unknown as OrderRow[];
  const pending = list.filter((o) => o.status === "submitted");
  const active = list.filter((o) =>
    ["approved", "preparing", "kitchen_done", "received"].includes(o.status),
  );
  const done = list.filter((o) => ["completed", "cancelled"].includes(o.status));

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(["live", "scan", "new"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`soft-press flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold ${
              tab === k ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {k === "live" ? t("nav_orders") : k === "scan" ? t("nav_scan") : t("new_order")}
          </button>
        ))}
      </div>

      {tab === "scan" && <ScanPanel />}
      {tab === "new" && <WalkInPanel />}

      {tab === "live" && (
        <>
          {orders.isLoading && <Loading />}
          <Section title={`${t("orders_pending")} (${pending.length})`}>
            {pending.map((o) => (
              <OrderCard key={o.id} order={o} currency={currency}>
                <ActionButton onClick={() => run.mutate(() => approve({ data: { orderId: o.id } }))}>
                  <Check className="size-4" /> {t("approve_payment")}
                </ActionButton>
                <ActionButton
                  tone="danger"
                  onClick={() => run.mutate(() => cancel({ data: { orderId: o.id } }))}
                >
                  <Ban className="size-4" /> {t("cancel")}
                </ActionButton>
              </OrderCard>
            ))}
          </Section>

          <Section title={`${t("orders_active")} (${active.length})`}>
            {active.map((o) => (
              <OrderCard key={o.id} order={o} currency={currency}>
                {o.status === "approved" && (
                  <ActionButton
                    tone="muted"
                    onClick={() =>
                      run.mutate(() => advance({ data: { orderId: o.id, action: "start" } }))
                    }
                  >
                    <Soup className="size-4" /> {t("start_cooking")}
                  </ActionButton>
                )}
                {["approved", "preparing"].includes(o.status) && (
                  <ActionButton
                    tone="muted"
                    onClick={() =>
                      run.mutate(() => advance({ data: { orderId: o.id, action: "kitchen_done" } }))
                    }
                  >
                    <Check className="size-4" /> {t("mark_done")}
                  </ActionButton>
                )}
                {["kitchen_done", "received"].includes(o.status) && (
                  <ActionButton
                    onClick={() =>
                      run.mutate(() => advance({ data: { orderId: o.id, action: "complete" } }))
                    }
                  >
                    <Check className="size-4" /> {t("hand_over")}
                  </ActionButton>
                )}
                <ActionButton
                  tone="danger"
                  onClick={() => run.mutate(() => cancel({ data: { orderId: o.id } }))}
                >
                  <Ban className="size-4" /> {t("cancel")}
                </ActionButton>
              </OrderCard>
            ))}
          </Section>

          <Section title={`${t("orders_done")} (${done.length})`}>
            {done.map((o) => (
              <OrderCard key={o.id} order={o} currency={currency} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const empty = !Array.isArray(children) || children.length === 0;
  return (
    <section>
      <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
      {empty ? (
        <p className="cozy-card p-6 text-center text-sm text-muted-foreground">{t("no_orders")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function ScanPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const find = useServerFn(findOrderByCode);
  const applyV = useServerFn(applyVoucher);
  const setGift = useServerFn(setOrderGift);
  const approve = useServerFn(approveOrder);
  const promos = useQuery({ queryKey: ["promos"], queryFn: useServerFn(listPromos) as never });

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const currency = "MYR";

  const findM = useMutation({
    mutationFn: (code: string) => find({ data: { code } }),
    onSuccess: (o) => setOrder(o as unknown as OrderRow),
    onError: () => toast.error(t("scan_expired")),
  });

  const voucherM = useMutation({
    mutationFn: () => applyV({ data: { orderId: order!.id, code: voucherCode } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.reason === "used" ? t("voucher_used") : t("voucher_invalid"));
        return;
      }
      toast.success(t("voucher_applied"));
      setVoucherCode("");
      findM.mutate(order!.id ? (order as OrderRow).id : "");
      const refreshed = await find({ data: { code: "" } }).catch(() => null);
      if (refreshed) setOrder(refreshed as unknown as OrderRow);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveM = useMutation({
    mutationFn: () => approve({ data: { orderId: order!.id } }),
    onSuccess: () => {
      toast.success(t("order_approved"));
      setOrder(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gifts = (promos.data as { gifts?: Array<{ id: string; name: string; threshold: number; is_active: boolean }> } | undefined)?.gifts ?? [];
  const eligible = order ? gifts.filter((g) => g.is_active && Number(order.total) >= g.threshold) : [];

  if (!order) {
    return (
      <div className="mx-auto max-w-md">
        <QrScannerBox onScan={(code) => findM.mutate(code)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <OrderCard order={order} currency={currency} />

      <div className="cozy-card space-y-3 p-4">
        <div className="flex gap-2">
          <input
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value)}
            placeholder={t("promo_code")}
            className="flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm uppercase outline-none focus:border-primary"
          />
          <button
            onClick={() => voucherM.mutate()}
            disabled={!voucherCode}
            className="soft-press rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground disabled:opacity-60"
          >
            {t("apply")}
          </button>
        </div>

        {eligible.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t("gift_eligible")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {eligible.map((g) => (
                <button
                  key={g.id}
                  onClick={async () => {
                    const updated = await setGift({
                      data: { orderId: order.id, giftId: g.id },
                    }).catch((e: Error) => {
                      toast.error(e.message);
                      return null;
                    });
                    if (updated) setOrder(updated as unknown as OrderRow);
                  }}
                  className="soft-press rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <ActionButton onClick={() => approveM.mutate()} disabled={approveM.isPending}>
          <Check className="size-4" /> {t("approve_payment")}
        </ActionButton>
        <button
          onClick={() => setOrder(null)}
          className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}

function WalkInPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: useServerFn(listProducts) as never });
  const create = useServerFn(createWalkInOrder);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");

  const rows =
    (products.data as Array<{
      id: string;
      name: string;
      sell_price: number | string;
      is_available: boolean;
    }> | undefined) ?? [];

  const total = useMemo(
    () =>
      rows.reduce((s, p) => s + Number(p.sell_price) * (cart[p.id] ?? 0), 0),
    [rows, cart],
  );

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          customer_name: name || "Walk-in",
          items: Object.entries(cart)
            .filter(([, q]) => q > 0)
            .map(([product_id, qty]) => ({ product_id, qty })),
        },
      }),
    onSuccess: () => {
      toast.success(t("order_created"));
      setCart({});
      setName("");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-md space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("your_name")}
        className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
      />
      <div className="cozy-card divide-y divide-border p-2">
        {rows
          .filter((p) => p.is_available)
          .map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{formatMoney(p.sell_price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCart((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))
                  }
                  className="soft-press grid size-8 place-items-center rounded-full border border-border"
                  aria-label="-"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-5 text-center text-sm font-bold">{cart[p.id] ?? 0}</span>
                <button
                  onClick={() => setCart((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }))}
                  className="soft-press grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"
                  aria-label="+"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t("nav_products")} — <Link to="/products" className="underline">{t("add")}</Link>
          </p>
        )}
      </div>
      <ActionButton onClick={() => createM.mutate()} disabled={total <= 0 || createM.isPending}>
        <Store className="size-4" /> {t("new_order")} · {formatMoney(total)}
      </ActionButton>
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
        | Array<{ id: string; group_id: string | null; group_ids?: string[] }>
        | undefined) ?? []
    )
      .filter((p) =>
        (p.group_ids?.length ? p.group_ids : p.group_id ? [p.group_id] : []).includes(
          myGroupId as string,
        ),
      )
      .map((p) => p.id),
  );
  const list = ((orders.data?.orders ?? []) as unknown as OrderRow[])
    .filter((o) =>
      role === "kitchen"
        ? ["approved", "preparing", "kitchen_done"].includes(o.status)
        : ["kitchen_done", "received"].includes(o.status),
    )
    .filter((o) =>
      myGroupId && groupProductIds.size
        ? o.items.some((i) => i.product_id && groupProductIds.has(i.product_id))
        : true,
    );

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
      ) : list.length === 0 ? (
        <p className="cozy-card p-10 text-center text-sm text-muted-foreground">{t("no_orders")}</p>
      ) : (
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
                    <ActionButton
                      tone="muted"
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
                      tone="muted"
                      onClick={() =>
                        run.mutate(() => advance({ data: { orderId: o.id, action: "receive" } }))
                      }
                    >
                      <QrCode className="size-4" /> {t("receive_items")}
                    </ActionButton>
                  )}
                  <ActionButton
                    onClick={() =>
                      run.mutate(() => advance({ data: { orderId: o.id, action: "complete" } }))
                    }
                  >
                    <Check className="size-4" /> {t("hand_over")}
                  </ActionButton>
                </>
              )}
            </OrderCard>
          ))}
        </div>
      )}
    </div>
  );
}
