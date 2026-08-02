import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, RefreshCw, ShoppingBasket, Soup } from "lucide-react";
import {
  cancelGuestOrder,
  getGuestOrder,
  getMenu,
  saveCart,
  submitOrder,
} from "@/lib/customer.functions";
import { useI18n, statusKey } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { QrImage } from "@/components/qr-code";
import { formatMoney, mmss, secondsLeft } from "@/lib/money";

export const Route = createFileRoute("/s/$slug")({
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

type Cart = Record<string, number>;

function StorePage() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const qc = useQueryClient();

  const fetchMenu = useServerFn(getMenu);
  const fetchOrder = useServerFn(getGuestOrder);
  const doSaveCart = useServerFn(saveCart);
  const doSubmit = useServerFn(submitOrder);
  const doCancel = useServerFn(cancelGuestOrder);

  const storageKey = `warung.guest.${slug}`;
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setGuestToken(localStorage.getItem(storageKey));
    setHydrated(true);
  }, [storageKey]);

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

  const order =
    orderQuery.data && !orderQuery.data.gone ? orderQuery.data.order : null;
  const live = orderQuery.data && !orderQuery.data.gone ? orderQuery.data : null;
  const locked = !!order && !["cart", "submitted"].includes(order.status);

  const products = menuQuery.data?.products ?? [];
  const store = menuQuery.data?.store;
  const currency = store?.currency ?? "MYR";

  const productName = (p: {
    name: string;
    name_zh: string | null;
    name_ms: string | null;
  }) => (lang === "zh" ? p.name_zh : lang === "ms" ? p.name_ms : p.name) || p.name;

  const categories = useMemo(() => {
    const map = new Map<string, typeof products>();
    for (const p of products) {
      const key = p.category || t("menu");
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [products, t]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => {
          const p = products.find((x) => x.id === id);
          return p ? { id, qty, name: productName(p), price: Number(p.sell_price) } : null;
        })
        .filter(Boolean) as Array<{ id: string; qty: number; name: string; price: number }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, products, lang],
  );

  const cartTotal = cartLines.reduce((s, l) => s + l.price * l.qty, 0);

  const saveMutation = useMutation({
    mutationFn: async () =>
      doSaveCart({
        data: {
          slug,
          guestToken,
          customerName: name,
          note,
          items: cartLines.map((l) => ({ product_id: l.id, qty: l.qty })),
        },
      }),
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
      if (!token || cartLines.length) {
        const saved = await doSaveCart({
          data: {
            slug,
            guestToken,
            customerName: name,
            note,
            items: cartLines.map((l) => ({ product_id: l.id, qty: l.qty })),
          },
        });
        token = saved.guest_token;
        localStorage.setItem(storageKey, token);
        setGuestToken(token);
      }
      return doSubmit({ data: { guestToken: token! } });
    },
    onSuccess: () => {
      setCart({});
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
      setGuestToken(null);
      setCart({});
      qc.invalidateQueries({ queryKey: ["guest-order"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function bump(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      return { ...c, [id]: next };
    });
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
        <Link to="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
          {t("back")}
        </Link>
      </div>
    );
  }

  const qrSeconds = order?.qr_expires_at ? secondsLeft(order.qr_expires_at) : 0;

  return (
    <div className="grain min-h-screen bg-background pb-40">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Soup className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold leading-tight">{store.name}</h1>
            <p className="text-xs text-muted-foreground">{store.tagline || t("tagline")}</p>
          </div>
        </div>
        <LanguageSwitcher compact />
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {!store.is_open && (
          <p className="cozy-card mb-4 border-destructive/40 p-4 text-sm font-semibold text-destructive">
            {t("store_closed")}
          </p>
        )}

        {order && order.status !== "cart" && (
          <section className="cozy-card mb-6 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {t("order_progress")}
                </p>
                <p className="font-display text-2xl font-bold">
                  #{order.order_no ?? "—"} · {t(statusKey(order.status))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => orderQuery.refetch()}
                className="soft-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"
              >
                <RefreshCw className="size-4" /> {t("refresh")}
              </button>
            </div>

            {order.status === "submitted" && order.qr_token && (
              <div className="mt-5 flex flex-col items-center gap-3 text-center">
                {qrSeconds > 0 ? (
                  <>
                    <QrImage value={order.qr_token} />
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

            <ul className="mt-5 space-y-1 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>
                    {i.qty}× {i.name}
                  </span>
                  <span>{formatMoney(i.unit_price * i.qty, currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-display text-lg font-bold">
              <span>{t("total")}</span>
              <span>{formatMoney(order.total, currency)}</span>
            </div>

            {live && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("est_wait")}: {live.estimateMinutes} min · {live.queueAhead} ahead ·{" "}
                {t("refresh_hint")}
              </p>
            )}

            {!locked && (
              <button
                type="button"
                onClick={() => cancelMutation.mutate()}
                className="mt-4 w-full text-center text-sm text-muted-foreground underline underline-offset-4"
              >
                {t("cancel")}
              </button>
            )}
          </section>
        )}

        <section className="space-y-8">
          {categories.map(([cat, list]) => (
            <div key={cat}>
              <h2 className="font-display text-lg font-bold">{cat}</h2>
              <div className="mt-3 grid gap-3">
                {list.map((p) => (
                  <article key={p.id} className="cozy-card flex items-center gap-3 p-3">
                    {p.photo_signed_url ? (
                      <img
                        src={p.photo_signed_url}
                        alt={productName(p)}
                        loading="lazy"
                        className="size-16 rounded-2xl object-cover"
                      />
                    ) : (
                      <span className="grid size-16 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                        <Soup className="size-6" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{productName(p)}</p>
                      {p.description && (
                        <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                      )}
                      <p className="mt-0.5 text-sm font-bold text-primary">
                        {formatMoney(p.sell_price, currency)}
                      </p>
                    </div>
                    {cart[p.id] ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="minus"
                          onClick={() => bump(p.id, -1)}
                          className="soft-press grid size-9 place-items-center rounded-full border border-border"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="w-5 text-center text-sm font-bold">{cart[p.id]}</span>
                        <button
                          type="button"
                          aria-label="plus"
                          onClick={() => bump(p.id, 1)}
                          className="soft-press grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={locked || !store.is_open}
                        onClick={() => bump(p.id, 1)}
                        className="soft-press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                      >
                        {t("add_to_order")}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
          {!products.length && (
            <p className="cozy-card p-6 text-center text-sm text-muted-foreground">
              {t("empty_cart")}
            </p>
          )}
        </section>

        <section className="cozy-card mt-10 p-5">
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

      {cartLines.length > 0 && !locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBasket className="size-4" />
              {t("your_order")} · {formatMoney(cartTotal, currency)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("your_name")}
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="soft-press flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-bold"
              >
                {t("save")}
              </button>
              <button
                type="button"
                disabled={submitMutation.isPending || !store.is_open}
                onClick={() => submitMutation.mutate()}
                className="soft-press flex-[2] rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
              >
                {submitMutation.isPending ? t("loading") : t("submit_order")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
