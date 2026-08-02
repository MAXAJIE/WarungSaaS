import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScanLine, Soup, Store } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
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
          <h2 className="font-display text-lg font-bold">{t("landing_recent")}</h2>
          {recent.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={t("landing_no_recent")} hint={t("landing_no_recent_hint")} />
            </div>
          ) : (
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
          )}
        </section>

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
