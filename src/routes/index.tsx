import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  ChefHat,
  HandCoins,
  LineChart,
  QrCode,
  ScanLine,
  Smartphone,
  Soup,
  Store,
  Utensils,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Warung — QR ordering & kitchen flow for stalls" },
      {
        name: "description",
        content:
          "Run your stall with one cozy app: counter orders, QR self-ordering, kitchen board, pickup handover, vouchers, gifts and profit reports in MYR.",
      },
      { property: "og:title", content: "Warung — QR ordering & kitchen flow for stalls" },
      {
        property: "og:description",
        content:
          "Counter, kitchen, pickup and customer screens in English, 中文 and Melayu. Built for Malaysian stalls and cafés.",
      },
    ],
  }),
  component: Landing,
});

/** Fades a section up into place the first time it enters the viewport. */
function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="grain min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <span className="inline-flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Soup className="size-5" />
          </span>
          {t("app_name")}
        </span>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher compact />
          </div>
          <Link
            to={signedIn ? "/dashboard" : "/auth"}
            className="soft-press rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lift"
          >
            {signedIn ? t("nav_orders") : t("sign_in")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24">
        <section className="pt-8 text-center sm:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground">
            <QrCode className="size-3.5" /> MYR · English · 中文 · Melayu
          </p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            {t("tagline")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            One tidy app for the whole stall: the counter takes payment, the kitchen cooks, pickup
            hands over, and customers order from their own phone with a QR code.
          </p>

          <div className="mx-auto mt-8 max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = slug
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "");
                if (clean) navigate({ to: "/s/$slug", params: { slug: clean } });
              }}
              className="flex items-center gap-2 rounded-full border border-border bg-card p-2 shadow-cozy"
            >
              <Store className="ml-3 size-4 shrink-0 text-muted-foreground" />
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="your-stall-name"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                aria-label={t("store_slug")}
              />
              <button
                type="submit"
                className="soft-press inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                {t("menu")} <ArrowRight className="size-4" />
              </button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">{t("store_slug_hint")}</p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="soft-press rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lift transition-transform hover:-translate-y-0.5"
            >
              {t("sign_up")}
            </Link>
            <Link
              to="/order"
              className="soft-press rounded-full border border-border bg-card px-6 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5"
            >
              {t("continue_as_guest")}
            </Link>
          </div>
        </section>

        <Reveal>
          <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Store,
                title: t("role_cashier"),
                body: "Take walk-in orders, scan the customer QR, apply vouchers and gifts, then approve payment.",
              },
              {
                icon: Utensils,
                title: t("role_kitchen"),
                body: "A big live board of approved orders — start cooking, mark done, nothing else in the way.",
              },
              {
                icon: ScanLine,
                title: t("role_pickup"),
                body: "See what's ready, confirm items received, and hand the bag to the right customer.",
              },
              {
                icon: QrCode,
                title: t("track_order"),
                body: "Customers browse the menu, submit an order, show a 15-minute QR, then watch their queue.",
              },
            ].map((c) => (
              <article
                key={c.title}
                className="cozy-card p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <c.icon className="size-5" />
                </span>
                <h2 className="mt-4 font-display text-lg font-bold">{c.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              </article>
            ))}
          </section>
        </Reveal>

        <Reveal>
          <section className="mt-16">
            <h2 className="text-center font-display text-3xl font-bold">How it works</h2>
            <p className="mx-auto mt-2 max-w-lg text-center text-sm text-muted-foreground">
              Three steps from an empty table to a handed-over bag.
            </p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Smartphone,
                  step: "01",
                  title: "Customer scans & orders",
                  body: "Your stall gets a public menu link and QR. Guests pick items on their own phone — no app install, no account.",
                },
                {
                  icon: HandCoins,
                  step: "02",
                  title: "Counter approves payment",
                  body: "The cashier scans the 15-minute order QR, applies vouchers or gifts, collects cash or e-wallet, then approves.",
                },
                {
                  icon: ChefHat,
                  step: "03",
                  title: "Kitchen cooks, pickup hands over",
                  body: "Approved orders appear on the kitchen board. When cooking is done, pickup confirms the handover and the queue clears.",
                },
              ].map((s2) => (
                <li
                  key={s2.step}
                  className="cozy-card p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                      <s2.icon className="size-5" />
                    </span>
                    <span className="font-display text-2xl font-bold text-muted-foreground/50">
                      {s2.step}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold">{s2.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s2.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        <Reveal>
          <section className="mt-16 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: BadgePercent,
                title: "Vouchers & lucky-draw gifts",
                body: "Percent or fixed discounts with your own codes, plus optional gift draws to bring regulars back.",
              },
              {
                icon: LineChart,
                title: "Profit, not just sales",
                body: "Track cost price per item so every report shows real margin in MYR — daily, weekly and per product.",
              },
              {
                icon: Utensils,
                title: "Roles that stay simple",
                body: "Cashier, kitchen and pickup each see only their own screen, in English, 中文 or Melayu.",
              },
            ].map((c) => (
              <article
                key={c.title}
                className="cozy-card p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <span className="grid size-10 place-items-center rounded-2xl bg-accent text-accent-foreground">
                  <c.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{c.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              </article>
            ))}
          </section>
        </Reveal>

        <Reveal>
          <section className="mt-16">
            <h2 className="text-center font-display text-3xl font-bold">Questions</h2>
            <div className="mx-auto mt-6 max-w-2xl divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
              {[
                {
                  q: "Do my customers need to install anything?",
                  a: "No. They scan the QR, the menu opens in their browser, and the order QR lives on the same page.",
                },
                {
                  q: "Can I still take walk-in orders at the counter?",
                  a: "Yes. The cashier screen can build an order from scratch, exactly like a normal POS.",
                },
                {
                  q: "What happens if the kitchen device sleeps?",
                  a: "Boards refresh live, and shared devices sign out automatically after 20 idle minutes for safety.",
                },
                {
                  q: "How do I add my crew?",
                  a: "Create the store as owner, then invite kitchen and pickup staff with a one-time code from the People page.",
                },
              ].map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {f.q}
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="cozy-card mt-14 flex flex-col items-center gap-4 p-8 text-center">
            <h2 className="font-display text-2xl font-bold">{t("create_store")}</h2>
            <p className="max-w-lg text-sm text-muted-foreground">
              Sign up as the owner, then invite your kitchen and pickup crew with a one-time code.
              Vouchers, lucky-draw gifts and daily profit reports are built in.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth"
                className="soft-press rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lift"
              >
                {t("sign_up")}
              </Link>
              {/* Customers who arrive without scanning start here. */}
              <Link
                to="/order"
                className="soft-press rounded-full border border-border bg-card px-6 py-3 text-sm font-bold"
              >
                {t("landing_scan")}
              </Link>
            </div>
          </section>
        </Reveal>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Soup className="size-4" />
            </span>
            {t("app_name")}
          </span>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground">
              {t("sign_in")}
            </Link>
            <span className="sm:hidden">
              <LanguageSwitcher compact />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
