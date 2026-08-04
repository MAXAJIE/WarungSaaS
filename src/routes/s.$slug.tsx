import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  ClipboardList,
  Home,
  Minus,
  Plus,
  RefreshCw,
  ScanLine,
  ShoppingBasket,
  Soup,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import {
  cancelGuestOrder,
  confirmReceipt,
  getGuestOrder,
  getMenu,
  saveCart,
  submitOrder,
} from "@/lib/customer.functions";
import { useI18n, statusKey } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { QrImage } from "@/components/qr-code";
import { QrScannerBox } from "@/components/qr-scanner-box";
import { Modal } from "@/components/modal";
import { EmptyState } from "@/components/empty-state";
import { OrderProgress } from "@/components/order-progress";
import { formatMoney, mmss, secondsLeft } from "@/lib/money";

export const Route = createFileRoute("/s/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    preview: search["preview"] === "1" || search["preview"] === 1 || search["preview"] === true,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Order from ${params.slug} — Warung` },
      {
        name: "description",
        content:
          "Browse the stall menu, build your order on your own phone and show a QR code at the cashier to pay.",
      },
      { property: "og:title", content: `Order from ${params.slug} — Warung` },
      {
        property: "og:description",
        content: "Self-order from your phone: pick your food, pay at the counter, track the queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StorePage,
});

type MenuProduct = Awaited<ReturnType<typeof getMenu>>["products"][number];
type MenuOption = MenuProduct["options"][number];

/** One configured line in the local cart. Options are part of its identity. */
type CartLine = {
  key: string;
  product_id: string;
  qty: number;
  options: Array<{ option_id: string; value_id: string; label: string; price_delta: number }>;
};

function lineKey(productId: string, values: string[]) {
  return [productId, ...[...values].sort()].join("|");
}

function StorePage() {
  const { slug } = Route.useParams();
  const { preview: isOwnerPreview } = Route.useSearch();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const fetchMenu = useServerFn(getMenu);
  const fetchOrder = useServerFn(getGuestOrder);
  const doSaveCart = useServerFn(saveCart);
  const doSubmit = useServerFn(submitOrder);
  const doCancel = useServerFn(cancelGuestOrder);
  const doConfirm = useServerFn(confirmReceipt);

  const storageKey = `warung.guest.${slug}`;
  const layoutKey = `warung.layout.${slug}`;
  const cartKey = `warung.cart.${slug}`;
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);
  const [detail, setDetail] = useState<MenuProduct | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  /** Per-device category arrangement. Nothing here is ever sent to the server. */
  const [order, setOrder] = useState<string[]>([]);
  /**
   * A submitted ticket hides the menu. The customer can reopen it to add on,
   * but only until the cashier scans the QR.
   */
  const [addingMore, setAddingMore] = useState(false);
  /** The welcome screen greets every visit; both buttons lead into the same
   * page, just scrolled to a different starting widget. */
  const [screen, setScreen] = useState<"welcome" | "app">("welcome");
  /** The counter can silently amend a submitted order; we remember the last
   * edited_at the customer has seen so the notice only shows once per edit. */
  const [seenEditedAt, setSeenEditedAt] = useState<string | null>(null);

  useEffect(() => {
    setGuestToken(localStorage.getItem(storageKey));
    try {
      const raw = localStorage.getItem(layoutKey);
      if (raw) setOrder(JSON.parse(raw) as string[]);
    } catch {
      /* a corrupt layout just falls back to the menu order */
    }
    try {
      // The cart survives a refresh so "add more items" can resend the whole
      // basket, not just the newest line.
      const rawCart = localStorage.getItem(cartKey);
      if (rawCart) setLines(JSON.parse(rawCart) as CartLine[]);
    } catch {
      /* a corrupt cart simply starts empty */
    }
    setHydrated(true);
  }, [storageKey, layoutKey, cartKey]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(cartKey, JSON.stringify(lines));
  }, [lines, cartKey, hydrated]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const menuQuery = useQuery({
    queryKey: ["menu", slug],
    queryFn: () => fetchMenu({ data: { slug } }),
    retry: false,
  });

  const orderQuery = useQuery({
    queryKey: ["guest-order", guestToken],
    enabled: hydrated && !!guestToken,
    refetchInterval: 15000,
    queryFn: () => fetchOrder({ data: { guestToken: guestToken! } }),
  });

  useEffect(() => {
    if (orderQuery.data && "gone" in orderQuery.data && orderQuery.data.gone) {
      localStorage.removeItem(storageKey);
      setGuestToken(null);
    }
  }, [orderQuery.data, storageKey]);

  useEffect(() => {
    // Remember this stall so /order can offer it as a one-tap return visit.
    const name = menuQuery.data?.store?.name;
    if (!name) return;
    try {
      const raw = localStorage.getItem("warung.recent");
      const list = raw
        ? (JSON.parse(raw) as Array<{ slug: string; name: string; at: number }>)
        : [];
      const next = [{ slug, name, at: Date.now() }, ...list.filter((r) => r.slug !== slug)].slice(
        0,
        5,
      );
      localStorage.setItem("warung.recent", JSON.stringify(next));
    } catch {
      /* remembering a stall is a convenience, never a blocker */
    }
  }, [menuQuery.data?.store?.name, slug]);

  const liveOrder = orderQuery.data && !orderQuery.data.gone ? orderQuery.data.order : null;
  const live = orderQuery.data && !orderQuery.data.gone ? orderQuery.data : null;
  const locked = !!liveOrder && !["cart", "submitted"].includes(liveOrder.status);

  const products = menuQuery.data?.products ?? [];
  const store = menuQuery.data?.store;
  const currency = store?.currency ?? "MYR";

  const productName = (p: { name: string; name_zh: string | null; name_ms: string | null }) =>
    (lang === "zh" ? p.name_zh : lang === "ms" ? p.name_ms : p.name) || p.name;

  const categories = useMemo(() => {
    const map = new Map<string, MenuProduct[]>();
    for (const p of products) {
      const key = p.category || t("menu");
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    const entries = [...map.entries()];
    // Saved arrangement first, then anything the stall added since.
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return entries;
  }, [products, t, order]);

  function moveCategory(name: string, delta: number) {
    const current = categories.map(([c]) => c);
    const from = current.indexOf(name);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setOrder(next);
    localStorage.setItem(layoutKey, JSON.stringify(next));
  }

  const priceOf = (line: CartLine) => {
    const p = products.find((x) => x.id === line.product_id);
    const base = p ? Number(p.sell_price) : 0;
    return base + line.options.reduce((s, o) => s + o.price_delta, 0);
  };
  const cartTotal = lines.reduce((s, l) => s + priceOf(l) * l.qty, 0);

  const cartPayload = () =>
    lines
      .filter((l) => l.qty > 0)
      .map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        options: l.options.map((o) => ({ option_id: o.option_id, value_id: o.value_id })),
      }));

  const saveMutation = useMutation({
    mutationFn: async () => doSaveCart({ data: { slug, guestToken, note, items: cartPayload() } }),
    onSuccess: (res) => {
      localStorage.setItem(storageKey, res.guest_token);
      setGuestToken(res.guest_token);
      qc.invalidateQueries({ queryKey: ["guest-order"] });
      toast.success(t("save"));
    },
    onError: (e: Error) =>
      toast.error(e.message === "STORE_CLOSED" ? t("store_closed") : e.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      let token = guestToken;
      const items = cartPayload();
      if (!token || items.length) {
        const saved = await doSaveCart({ data: { slug, guestToken, note, items } });
        token = saved.guest_token;
        localStorage.setItem(storageKey, token);
        setGuestToken(token);
      }
      return doSubmit({ data: { guestToken: token! } });
    },
    onSuccess: () => {
      // The basket is kept (not cleared) so an add-on resends every line, but
      // the ordering UI closes: the ticket is with the cashier now.
      setAddingMore(false);
      qc.invalidateQueries({ queryKey: ["guest-order"] });
      toast.success(t("order_submitted"));
    },
    onError: (e: Error) =>
      toast.error(e.message === "STORE_CLOSED" ? t("store_closed") : e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => doCancel({ data: { guestToken: guestToken! } }),
    onSuccess: () => {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(cartKey);
      setGuestToken(null);
      setLines([]);
      setAddingMore(false);
      qc.invalidateQueries({ queryKey: ["guest-order"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receiptMutation = useMutation({
    mutationFn: async () => doConfirm({ data: { guestToken: guestToken! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guest-order"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function addLine(product: MenuProduct, picked: Map<string, string>) {
    const options = [...picked.entries()].flatMap(([optionId, valueId]) => {
      const opt = product.options.find((o) => o.id === optionId);
      const val = opt?.values.find((v) => v.id === valueId);
      return opt && val
        ? [
            {
              option_id: opt.id,
              value_id: val.id,
              label: `${opt.name}: ${val.label}`,
              price_delta: val.price_delta,
            },
          ]
        : [];
    });
    const key = lineKey(
      product.id,
      options.map((o) => o.value_id),
    );
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key, product_id: product.id, qty: 1, options }];
    });
    setDetail(null);
  }

  function bumpLine(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  if (menuQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  if (menuQuery.isError || !store) {
    return (
      <div className="grid min-h-screen place-items-center gap-4 bg-background px-6 text-center">
        <p className="font-display text-2xl font-bold">Store not found</p>
        <Link
          to="/"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  const qrSeconds = liveOrder?.qr_expires_at ? secondsLeft(liveOrder.qr_expires_at) : 0;
  const prepping =
    !!liveOrder && ["approved", "preparing", "kitchen_done", "received"].includes(liveOrder.status);
  const submitted = liveOrder?.status === "submitted";
  const closed = !!liveOrder && ["cancelled", "completed"].includes(liveOrder.status);
  /**
   * Ordering stays open only while the ticket is still a cart, or while the
   * customer has explicitly reopened a submitted ticket to add on. Once the
   * cashier scans it, the menu disappears entirely.
   */
  const orderingOpen = !liveOrder || liveOrder.status === "cart" || (submitted && addingMore);

  return (
    <div className="grain min-h-screen bg-background pb-40">
      <header className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {store.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="size-10 shrink-0 rounded-2xl object-cover shadow-lift"
            />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
              <Soup className="size-5" />
            </span>
          )}

          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold leading-tight">{store.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {store.tagline || t("tagline")}
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Link
            to="/order"
            className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"
          >
            <Home className="size-4" /> {t("go_main")}
          </Link>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold"
          >
            <ScanLine className="size-4" /> {t("scan_stall_qr")}
          </button>
          <LanguageSwitcher compact />
        </div>
      </header>

      {screen === "welcome" && (
        <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
          <section className="cozy-card overflow-hidden p-6 text-center sm:p-10">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name}
                className="mx-auto size-14 rounded-3xl object-cover"
              />
            ) : (
              <span className="mx-auto grid size-14 place-items-center rounded-3xl bg-secondary text-secondary-foreground">
                <Soup className="size-7" />
              </span>
            )}

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("welcome_hero_kicker")}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
              {store.name}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              {store.tagline || t("tagline")}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setScreen("app")}
                className="group soft-press relative overflow-hidden rounded-3xl bg-primary p-6 text-left text-primary-foreground shadow-lift transition-transform duration-300 hover:-translate-y-1 hover:shadow-cozy"
              >
                <UtensilsCrossed className="size-7 transition-transform duration-300 group-hover:scale-110" />
                <p className="mt-4 font-display text-xl font-bold">{t("welcome_place_order")}</p>
                <p className="mt-1 text-sm text-primary-foreground/80">
                  {t("welcome_place_order_sub")}
                </p>
                <ArrowRight className="mt-4 size-5 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreen("app");
                  setTimeout(
                    () => detailSectionRef.current?.scrollIntoView({ behavior: "smooth" }),
                    50,
                  );
                }}
                className="group soft-press relative overflow-hidden rounded-3xl border border-border bg-card p-6 text-left shadow-cozy transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <ClipboardList className="size-7 text-primary transition-transform duration-300 group-hover:scale-110" />
                <p className="mt-4 font-display text-xl font-bold">{t("welcome_order_detail")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("welcome_order_detail_sub")}
                </p>
                <ArrowRight className="mt-4 size-5 text-primary transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </section>
        </main>
      )}

      <main className={`mx-auto max-w-3xl space-y-6 px-4 ${screen === "app" ? "" : "hidden"}`}>
        {!store.is_open && (
          <p className="cozy-card border-destructive/40 p-4 text-sm font-semibold text-destructive">
            {t("store_closed")}
          </p>
        )}

        {/* Widget 1 — Start your order. Hidden once the ticket is submitted. */}
        {orderingOpen && (
          <section className="cozy-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">{t("start_your_order")}</h2>
              {isOwnerPreview && (
                <span className="text-xs text-muted-foreground">{t("arrangement")}</span>
              )}
            </div>

            {!products.length ? (
              <div className="mt-4">
                <EmptyState title={t("empty_menu_title")} hint={t("empty_menu_hint")} />
              </div>
            ) : (
              <div className="mt-4 space-y-7">
                {categories.map(([cat, list], index) => (
                  <div key={cat}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold">{cat}</h3>
                      {isOwnerPreview && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`move ${cat} up`}
                            disabled={index === 0}
                            onClick={() => moveCategory(cat, -1)}
                            className="soft-press grid size-8 place-items-center rounded-full border border-border disabled:opacity-40"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`move ${cat} down`}
                            disabled={index === categories.length - 1}
                            onClick={() => moveCategory(cat, 1)}
                            className="soft-press grid size-8 place-items-center rounded-full border border-border disabled:opacity-40"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3">
                      {list.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={locked || !store.is_open || p.sold_out}
                          onClick={() => setDetail(p)}
                          className="cozy-card grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3 text-left disabled:opacity-60 sm:flex"
                        >
                          {/* Photos are capped so one tall upload cannot blow up
                              the row on a phone; the crop is already square. */}
                          {p.photo_signed_url ? (
                            <img
                              src={p.photo_signed_url}
                              alt={productName(p)}
                              loading="lazy"
                              className="size-20 shrink-0 rounded-2xl object-cover sm:size-24"
                            />
                          ) : (
                            <span className="grid size-20 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground sm:size-24">
                              <Soup className="size-6" />
                            </span>
                          )}
                          <div className="min-w-0 sm:flex-1">
                            <p className="truncate font-semibold">{productName(p)}</p>
                            {p.description && (
                              <p className="truncate text-xs text-muted-foreground">
                                {p.description}
                              </p>
                            )}
                            <p className="mt-0.5 text-sm font-bold text-primary">
                              {formatMoney(p.sell_price, currency)}
                            </p>
                          </div>
                          <span className="soft-press col-span-2 shrink-0 rounded-full bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground sm:col-auto">
                            {t("add_to_order")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Widget 2 — Order detail */}
        <section ref={detailSectionRef} className="cozy-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">{t("order_detail")}</h2>
            {!!liveOrder && (
              <button
                type="button"
                onClick={() => orderQuery.refetch()}
                className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
              >
                <RefreshCw className="size-3.5" /> {t("refresh")}
              </button>
            )}
          </div>

          {liveOrder && liveOrder.status !== "cart" && !addingMore ? (
            <div className="mt-4 space-y-4">
              {liveOrder.edited_at && seenEditedAt !== liveOrder.edited_at && (
                <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-secondary px-4 py-3 text-secondary-foreground">
                  <Bell className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{t("order_updated_notice")}</p>
                    <p className="text-xs text-secondary-foreground/80">
                      {liveOrder.edited_note || t("order_updated_hint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSeenEditedAt(liveOrder.edited_at ?? null)}
                    className="soft-press shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold"
                  >
                    {t("dismiss")}
                  </button>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {t("pickup_number")}
                </p>
                <p className="font-display text-3xl font-bold">
                  {liveOrder.order_code ?? `#${liveOrder.order_no ?? "—"}`}
                </p>
                <p className="text-sm text-muted-foreground">{t(statusKey(liveOrder.status))}</p>
              </div>

              <OrderProgress status={liveOrder.status} />

              {liveOrder.status === "submitted" && liveOrder.qr_token && (
                <div className="flex flex-col items-center gap-3 text-center">
                  {qrSeconds > 0 ? (
                    <>
                      <QrImage value={liveOrder.qr_token} />
                      <p className="text-sm font-semibold">{t("show_qr")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("qr_expires_in")} {mmss(qrSeconds)}
                        <span className="hidden">{tick}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{t("go_pay")}</p>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">{t("qr_gone")}</p>
                  )}
                </div>
              )}

              {prepping && (
                <p className="rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground">
                  {t("prepping")}
                </p>
              )}

              <ul className="space-y-1 text-sm">
                {liveOrder.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {i.qty}× {i.name}
                    </span>
                    <span className="shrink-0">{formatMoney(i.unit_price * i.qty, currency)}</span>
                  </li>
                ))}
              </ul>
              {(Number(liveOrder.discount_total ?? 0) > 0 ||
                Number(liveOrder.special_discount ?? 0) > 0) && (
                <div className="space-y-1 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("subtotal")}</span>
                    <span>{formatMoney(liveOrder.subtotal, currency)}</span>
                  </div>
                  {Number(liveOrder.discount_total ?? 0) -
                    Number(liveOrder.special_discount ?? 0) >
                    0 && (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0">
                        {t("promo_discount")}
                        {liveOrder.vouchers?.length
                          ? ` · ${liveOrder.vouchers.map((v) => v.label || v.code).join(", ")}`
                          : ""}
                      </span>
                      <span className="shrink-0">
                        -
                        {formatMoney(
                          Number(liveOrder.discount_total ?? 0) -
                            Number(liveOrder.special_discount ?? 0),
                          currency,
                        )}
                      </span>
                    </div>
                  )}
                  {Number(liveOrder.special_discount ?? 0) > 0 && (
                    <div className="flex justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0">
                        {t("special_discount")}
                        {liveOrder.special_discount_reason
                          ? ` · ${liveOrder.special_discount_reason}`
                          : ""}
                      </span>
                      <span className="shrink-0">
                        -{formatMoney(liveOrder.special_discount ?? 0, currency)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 font-display text-lg font-bold">
                <span>{t("total")}</span>
                <span>{formatMoney(liveOrder.total, currency)}</span>
              </div>

              {live && (
                <p className="text-xs text-muted-foreground">
                  {t("est_wait")}: {live.estimateMinutes} {t("minutes")} · {live.queueAhead} ahead ·{" "}
                  {t("refresh_hint")}
                </p>
              )}

              {liveOrder.status === "received" && (
                <button
                  type="button"
                  disabled={receiptMutation.isPending}
                  onClick={() => receiptMutation.mutate()}
                  className="soft-press w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
                >
                  <Check className="mr-1 inline size-4" /> {t("confirm_received")}
                </button>
              )}

              {submitted && (
                <div className="space-y-2">
                  <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t("ordering_closed_hint")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddingMore(true)}
                    className="soft-press w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
                  >
                    <Plus className="mr-1 inline size-4" /> {t("add_more_items")}
                  </button>
                  <p className="text-xs text-muted-foreground">{t("add_more_hint")}</p>
                </div>
              )}

              {closed && (
                <div className="space-y-2">
                  <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {liveOrder.status === "cancelled" ? t("order_cancelled_hint") : t("reminder_3")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      // A closed ticket is finished for good; sending the
                      // customer back to the landing page (instead of
                      // restarting in-place) means a fresh visit gets its own
                      // guest token and its own QR, never glued to the old one.
                      localStorage.removeItem(storageKey);
                      localStorage.removeItem(cartKey);
                      setGuestToken(null);
                      setLines([]);
                      setAddingMore(false);
                      navigate({ to: "/order" });
                    }}
                    className="soft-press w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift"
                  >
                    {t("order_again")}
                  </button>
                </div>
              )}

              {!locked && !closed && (
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate()}
                  className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          ) : lines.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={t("empty_cart")} hint={t("empty_cart_hint")} />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {lines.map((l) => {
                const p = products.find((x) => x.id === l.product_id);
                return (
                  <div key={l.key} className="flex items-start gap-3 border-b border-border pb-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p ? productName(p) : l.product_id}</p>
                      {!!l.options.length && (
                        <p className="text-xs text-muted-foreground">
                          {l.options.map((o) => o.label).join(" · ")}
                        </p>
                      )}
                      <p className="text-sm font-bold text-primary">
                        {formatMoney(priceOf(l) * l.qty, currency)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label="minus"
                        onClick={() => bumpLine(l.key, -1)}
                        className="soft-press grid size-9 place-items-center rounded-full border border-border"
                      >
                        {l.qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
                      <button
                        type="button"
                        aria-label="plus"
                        onClick={() => bumpLine(l.key, 1)}
                        className="soft-press grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="flex items-center justify-between font-display text-lg font-bold">
                <span>{t("total")}</span>
                <span>{formatMoney(cartTotal, currency)}</span>
              </div>
            </div>
          )}
        </section>

        <section className="cozy-card p-5">
          <h2 className="font-display text-base font-bold">{t("reminder_title")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("reminder_1")}</li>
            <li>{t("reminder_2")}</li>
            <li>{t("reminder_3")}</li>
          </ul>
          <h3 className="mt-4 font-display text-base font-bold">{t("disclaimer_title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {store.disclaimer || t("disclaimer_body")}
          </p>
        </section>
      </main>

      {lines.length > 0 && !locked && orderingOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
              <ShoppingBasket className="size-4 shrink-0" />
              <span className="truncate">
                {t("your_order")} · {formatMoney(cartTotal, currency)}
              </span>
            </div>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => (addingMore ? setAddingMore(false) : saveMutation.mutate())}
              className="soft-press rounded-2xl border border-border px-4 py-3 text-sm font-bold"
            >
              {addingMore ? t("back") : t("save")}
            </button>
            <button
              type="button"
              disabled={submitMutation.isPending || !store.is_open}
              onClick={() => submitMutation.mutate()}
              className="soft-press rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
            >
              {submitMutation.isPending
                ? t("loading")
                : addingMore
                  ? t("done_adding")
                  : t("submit_order")}
            </button>
          </div>
        </div>
      )}

      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title={t("scan_stall_qr")}>
        <QrScannerBox
          title={t("scan_stall_qr")}
          manualHint={t("scan_stall_manual")}
          manualPlaceholder={t("scan_stall_manual_placeholder")}
          onScan={(code) => {
            setScanOpen(false);
            navigate({ to: "/s/$slug", params: { slug: code } });
          }}
        />
      </Modal>

      {detail && (
        <ProductDetail
          product={detail}
          currency={currency}
          title={productName(detail)}
          onClose={() => setDetail(null)}
          onAdd={(picked) => addLine(detail, picked)}
        />
      )}
    </div>
  );
}

/** Product sheet: photo, description and every customisation the owner defined. */
function ProductDetail({
  product,
  currency,
  title,
  onClose,
  onAdd,
}: {
  product: MenuProduct;
  currency: string;
  title: string;
  onClose: () => void;
  onAdd: (picked: Map<string, string>) => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const o of product.options) {
      if (o.is_required && o.values[0]) initial.set(o.id, o.values[0].id);
    }
    return initial;
  });

  const extra = [...picked.entries()].reduce((sum, [optionId, valueId]) => {
    const opt = product.options.find((o: MenuOption) => o.id === optionId);
    const val = opt?.values.find((v) => v.id === valueId);
    return sum + (val ? val.price_delta : 0);
  }, 0);
  const unit = Number(product.sell_price) + extra;
  const missing = product.options.some((o) => o.is_required && !picked.get(o.id));

  return (
    <Modal open onClose={onClose} title={title} subtitle={product.description || undefined}>
      <div className="space-y-4">
        {product.photo_signed_url && (
          // Square crop, but never taller than a phone can comfortably show.
          <img
            src={product.photo_signed_url}
            alt={title}
            className="mx-auto aspect-square w-full max-w-[240px] rounded-2xl object-cover sm:max-w-[320px]"
          />
        )}

        {product.options.map((o) => (
          <div key={o.id}>
            <p className="text-sm font-semibold">
              {o.name}
              {o.is_required && <span className="text-destructive"> *</span>}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {o.values.map((v) => {
                const active = picked.get(o.id) === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Map(prev);
                        if (active && !o.is_required) next.delete(o.id);
                        else next.set(o.id, v.id);
                        return next;
                      })
                    }
                    className={`soft-press rounded-full border px-3 py-1.5 text-sm font-semibold ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {v.label}
                    {v.price_delta !== 0 && ` (+${formatMoney(v.price_delta, currency)})`}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button
          type="button"
          disabled={missing}
          onClick={() => onAdd(picked)}
          className="soft-press w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
        >
          {t("add_to_cart")} · {formatMoney(unit, currency)}
        </button>
      </div>
    </Modal>
  );
}
