import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { StaffShell, useStoreGuard, type StoreRole } from "@/components/staff-shell";
import { EmptyState } from "@/components/empty-state";
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
  const roles = (me.data?.roles ?? []) as StoreRole[];
  const isOwner = roles.includes("owner");
  // Everyone reads their own trail; the owner can widen it to the whole team
  // and narrow it back down to a single role.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [roleFilter, setRoleFilter] = useState<StoreRole | "all">("all");
  const logs = useQuery({
    queryKey: ["logs", scope, roleFilter],
    queryFn: () => fn({ data: { limit: 150, scope, role: roleFilter } }),
    enabled: hasStore,
  });
  const rows = logs.data?.logs ?? [];

  return (
    <StaffShell
      title={t("nav_logs")}
      roles={roles}
      storeName={me.data?.store?.name ?? null}
    >
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="font-display text-xl font-bold">{t("nav_logs")}</h1>
        {isOwner && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              {(["mine", "all"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  className={`soft-press flex-1 rounded-2xl px-3 py-2 text-sm font-bold ${
                    scope === k ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {k === "mine" ? t("logs_mine") : t("logs_everyone")}
                </button>
              ))}
            </div>
            {scope === "all" && (
              <div className="flex flex-wrap gap-2">
                {(["all", "owner", "cashier", "kitchen", "pickup"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`soft-press rounded-full px-3 py-1.5 text-xs font-semibold ${
                      roleFilter === r
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {r === "all" ? t("logs_everyone") : t(`role_${r}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {logs.isLoading && <p className="mt-4 text-sm text-muted-foreground">{t("loading")}</p>}
        <ul className="mt-4 space-y-2">
          {rows.map((l) => (
            <li key={l.id} className="cozy-card flex items-start gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <ScrollText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.action}</p>
                <p className="text-xs text-muted-foreground">
                  {l.actor_label || "—"}
                  {l.actor_role ? ` · ${t(`role_${l.actor_role}`)}` : ""} ·{" "}
                  {new Date(l.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {!logs.isLoading && !rows.length && (
          <div className="mt-4">
            <EmptyState title={t("empty_logs_title")} hint={t("empty_logs_hint")} />
          </div>
        )}
      </div>
    </StaffShell>
  );
}
