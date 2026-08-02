import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText } from "lucide-react";
import { StaffShell, useStoreGuard } from "@/components/staff-shell";
import { listLogs } from "@/lib/staff.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Activity log — Warung staff" },
      {
        name: "description",
        content:
          "See every counter, kitchen and pickup action in your stall: approvals, cooking, handovers and cancellations.",
      },
      { property: "og:title", content: "Activity log — Warung staff" },
      {
        property: "og:description",
        content: "A running history of who did what in your stall today.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const { t } = useI18n();
  const { me, hasStore } = useStoreGuard();
  const fn = useServerFn(listLogs);
  const logs = useQuery({
    queryKey: ["logs"],
    queryFn: () => fn({ data: { limit: 150 } }),
    enabled: hasStore,
  });

  return (
    <StaffShell
      title={t("nav_logs")}
      role={me.data?.member?.role ?? null}
      storeName={me.data?.store?.name ?? null}
    >
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="font-display text-xl font-bold">{t("nav_logs")}</h1>
        {logs.isLoading && <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>}
        <ul className="mt-4 space-y-2">
          {(logs.data ?? []).map((l) => (
            <li key={l.id} className="cozy-card flex items-start gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <ScrollText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.action}</p>
                <p className="text-xs text-muted-foreground">
                  {l.actor_label || "—"} · {new Date(l.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {!logs.isLoading && !(logs.data ?? []).length && (
          <p className="cozy-card mt-4 p-6 text-center text-sm text-muted-foreground">
            {t("none")}
          </p>
        )}
      </div>
    </StaffShell>
  );
}
