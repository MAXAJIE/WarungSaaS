import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, QrCode, ScanLine, Soup, Store, Utensils } from "lucide-react";
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
        </section>

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
            <article key={c.title} className="cozy-card p-5">
              <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <c.icon className="size-5" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold">{c.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </article>
          ))}
        </section>

        <section className="cozy-card mt-14 flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="font-display text-2xl font-bold">{t("create_store")}</h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            Sign up as the owner, then invite your kitchen and pickup crew with a one-time code.
            Vouchers, lucky-draw gifts and daily profit reports are built in.
          </p>
          <Link
            to="/auth"
            className="soft-press rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lift"
          >
            {t("sign_up")}
          </Link>
        </section>
      </main>
    </div>
  );
}
