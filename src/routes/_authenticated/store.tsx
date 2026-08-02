import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, ExternalLink, Save, Store as StoreIcon } from "lucide-react";
import { StaffShell, useStoreGuard } from "@/components/staff-shell";
import { updateStore } from "@/lib/staff.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "Store settings — Warung" },
      {
        name: "description",
        content:
          "Configure your stall: name, tagline, opening state, prep minutes per cup, gift threshold and customer disclaimer.",
      },
      { property: "og:title", content: "Store settings — Warung" },
      { property: "og:description", content: "Configure your stall details and ordering rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

const inputClass =
  "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors focus:border-primary";

function StorePage() {
  const { t } = useI18n();
  const { me } = useStoreGuard();
  const qc = useQueryClient();
  const saveStore = useServerFn(updateStore);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [prep, setPrep] = useState(8);
  const [threshold, setThreshold] = useState(0);
  const [disclaimer, setDisclaimer] = useState("");
  const [open, setOpen] = useState(true);
  const [template, setTemplate] = useState("{STALL}-{SEQ}");
  const [eventSpend, setEventSpend] = useState(0);

  const store = me.data?.store;
  const roles = (me.data?.roles?.length
    ? me.data.roles
    : me.data?.member
      ? [me.data.member.role]
      : []) as string[];
  // Store settings belong to the owner, whatever other hats they also wear.
  const isOwner = roles.includes("owner");

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? "");
    setTagline(store.tagline ?? "");
    setPrep(Number(store.avg_prep_minutes ?? 8));
    setThreshold(Number(store.gift_threshold ?? 0));
    setDisclaimer(store.disclaimer ?? "");
    setOpen(!!store.is_open);
    setTemplate(store.order_code_template ?? "{STALL}-{SEQ}");
    setEventSpend(Number((store as { event_spend?: number }).event_spend ?? 0));
  }, [store]);

  const storeMutation = useMutation({
    mutationFn: async () =>
      saveStore({
        data: {
          name,
          tagline,
          avg_prep_minutes: prep,
          gift_threshold: threshold,
          disclaimer,
          is_open: open,
          order_code_template: template,
          event_spend: eventSpend,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("save"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <StaffShell title={t("nav_store")} roles={roles as never} storeName={store?.name ?? null}>
      <div className="mx-auto max-w-2xl space-y-6 py-2">
        <section className="cozy-card p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <StoreIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold">{t("store_settings")}</h1>
              {store?.slug && (
                <a
                  href={`/s/${store.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  /s/{store.slug} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>

          {!isOwner ? (
            <p className="mt-5 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
              {t("owner_only")}
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("store_name")}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">{t("tagline")}</span>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Clock className="size-3.5" /> {t("prep_per_unit")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={prep}
                    onChange={(e) => setPrep(Number(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("prep_per_unit_hint")}
                  </span>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("gift_threshold")} (RM)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("order_code_template")}
                  </span>
                  <input
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("order_code_template_hint")}
                  </span>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("event_spend")} (RM)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventSpend}
                    onChange={(e) => setEventSpend(Number(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("event_spend_hint")}
                  </span>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("disclaimer_title")}
                </span>
                <textarea
                  value={disclaimer}
                  onChange={(e) => setDisclaimer(e.target.value)}
                  rows={3}
                  className={`mt-1 ${inputClass}`}
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => setOpen(e.target.checked)}
                  className="size-4"
                />
                {open ? t("store_open") : t("store_closed")}
              </label>

              <button
                type="button"
                disabled={storeMutation.isPending}
                onClick={() => storeMutation.mutate()}
                className="soft-press inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
              >
                <Save className="size-4" /> {t("save")}
              </button>
            </div>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
