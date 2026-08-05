import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine, Soup, Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { listStores } from "@/lib/customer.functions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Modal } from "@/components/modal";
import { QrScannerBox } from "@/components/qr-scanner-box";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Order — scan a stall QR" },
      {
        name: "description",
        content:
          "Scan the QR at your table or stall to open its menu, build an order and pick it up when called.",
      },
      { property: "og:title", content: "Order — scan a stall QR" },
      {
        property: "og:description",
        content: "Scan the stall QR to browse the menu and order from your phone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomerLanding,
});

/** A stall the phone has opened before, remembered locally for a faster return. */
type RecentStall = { slug: string; name: string; at: number };

export const RECENT_KEY = "warung.recent";

function CustomerLanding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [scanOpen, setScanOpen] = useState(false);
  const [recent, setRecent] = useState<RecentStall[]>([]);
  const fetchStalls = useServerFn(listStores);
  const stalls = useQuery({ queryKey: ["stalls"], queryFn: () => fetchStalls({}) });
  const all = stalls.data?.stalls ?? [];
  // "Recommended" is strictly owner-controlled: only stalls whose owner gave
  // themselves a recommended position show up here, highest position first.
  // No silent fallback to "the first few stalls" — an owner who wants to be in
  // this row sets it in their own store settings.
  const recommended = [...all]
    .filter((s) => s.featured_rank > 0)
    .sort((a, b) => b.featured_rank - a.featured_rank)
    .slice(0, 6);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as RecentStall[]);
    } catch {
      /* a corrupt list simply shows as "no stalls yet" */
    }
  }, []);

  const steps = [t("landing_step_1"), t("landing_step_2"), t("landing_step_3")];

  return (
    <div className="grain min-h-screen bg-background pb-16">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <span className="inline-flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <Soup className="size-5" />
          </span>
          <span className="font-display text-xl font-bold">{t("my_order")}</span>
        </span>
        <LanguageSwitcher compact />
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4">
        <section className="cozy-card p-6 text-center">
          <h1 className="font-display text-3xl font-bold leading-tight">{t("landing_title")}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{t("landing_sub")}</p>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="soft-press mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lift"
          >
            <ScanLine className="size-4" /> {t("landing_scan")}
          </button>
        </section>

        <section className="cozy-card p-5">
          <h2 className="font-display text-lg font-bold">{t("landing_recommended")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("landing_recommended_hint")}</p>
          {recommended.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t("landing_no_recommended")}
                hint={t("landing_no_recommended_hint")}
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recommended.map((s) => (
                <Link
                  key={s.slug}
                  to="/s/$slug"
                  params={{ slug: s.slug }}
                  className="group relative aspect-square overflow-hidden rounded-3xl border border-border bg-muted shadow-cozy transition-transform duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1"
                >
                  {s.cover_url ? (
                    <img
                      src={s.cover_url}
                      alt=""
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-to-br from-primary/25 to-secondary" />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-3">
                    {s.logo_url ? (
                      <img
                        src={s.logo_url}
                        alt=""
                        className="size-9 shrink-0 rounded-xl border border-white/40 object-cover"
                      />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/20 text-white">
                        <Store className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white drop-shadow">
                        {s.name}
                      </span>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">
                        {s.is_open ? t("stall_open_badge") : t("stall_closed_badge")}
                      </span>
                    </span>
                  </span>
                  {/* Description slides up on hover (and is always shown to keyboard focus). */}
                  <span className="pointer-events-none absolute inset-0 flex translate-y-3 items-center justify-center bg-black/65 p-3 text-center text-xs font-semibold text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    {s.tagline || t("landing_recommended_hint")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="cozy-card p-5">
          <h2 className="font-display text-lg font-bold">{t("landing_all_stalls")}</h2>
          {all.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={t("landing_no_stalls")} hint={t("landing_no_stalls_hint")} />
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {all.map((s) => (
                <li key={s.slug}>
                  <Link
                    to="/s/$slug"
                    params={{ slug: s.slug }}
                    className="soft-press flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
                  >
                    {s.logo_url ? (
                      <img src={s.logo_url} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <Store className="size-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{s.name}</span>
                      {s.tagline && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.tagline}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        s.is_open
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.is_open ? t("stall_open_badge") : t("stall_closed_badge")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section className="cozy-card p-5">
            <h2 className="font-display text-lg font-bold">{t("landing_recent")}</h2>
            <ul className="mt-4 space-y-2">
              {recent.map((r) => (
                <li key={r.slug}>
                  <Link
                    to="/s/$slug"
                    params={{ slug: r.slug }}
                    className="soft-press flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
                  >
                    <Store className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.name || r.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="cozy-card p-5">
          <h2 className="font-display text-lg font-bold">{t("landing_how")}</h2>
          <ol className="mt-3 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title={t("landing_scan")}>
        <QrScannerBox
          onScan={(code) => {
            setScanOpen(false);
            navigate({ to: "/s/$slug", params: { slug: code } });
          }}
        />
      </Modal>
    </div>
  );
}
