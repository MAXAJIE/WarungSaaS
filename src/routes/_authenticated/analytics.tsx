import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loading, StaffShell, useStoreGuard } from "@/components/staff-shell";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { getAnalytics } from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

type Data = {
  currency: string;
  totals: {
    revenue: number;
    cost: number;
    profit: number;
    discounts: number;
    orders: number;
    avgOrder: number;
    margin: number;
  };
  byDay: Array<{ day: string; revenue: number; cost: number; profit: number; orders: number }>;
  products: Array<{ name: string; qty: number; revenue: number; profit: number }>;
};

function AnalyticsPage() {
  const { t } = useI18n();
  const { me, hasStore } = useStoreGuard();
  const [days, setDays] = useState(7);
  const fn = useServerFn(getAnalytics);
  const q = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => fn({ data: { days } }),
    enabled: hasStore,
  });

  const data = q.data as Data | undefined;
  const peak = Math.max(1, ...(data?.byDay ?? []).map((d) => d.revenue));

  return (
    <StaffShell
      title={t("nav_analytics")}
      role={me.data?.member?.role ?? null}
      storeName={me.data?.store?.name ?? null}
    >
      <div className="mb-4 flex gap-2">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`soft-press rounded-full px-4 py-2 text-sm font-bold ${
              days === d ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {d === 1 ? t("range_today") : `${d}d`}
          </button>
        ))}
      </div>

      {q.isLoading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t("revenue"), value: formatMoney(data.totals.revenue, data.currency) },
              { label: t("profit"), value: formatMoney(data.totals.profit, data.currency) },
              { label: t("orders_count"), value: String(data.totals.orders) },
              { label: t("avg_order"), value: formatMoney(data.totals.avgOrder, data.currency) },
            ].map((c) => (
              <div key={c.label} className="cozy-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="mt-1 font-display text-2xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="cozy-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold">{t("by_day")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("margin")}: {data.totals.margin.toFixed(1)}%
              </p>
            </div>
            <div className="mt-4 flex h-44 items-end gap-2">
              {data.byDay.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-36 w-full items-end gap-0.5">
                    <div
                      className="w-1/2 rounded-t-lg bg-primary/30"
                      style={{ height: `${(d.revenue / peak) * 100}%` }}
                      title={`${t("revenue")} ${formatMoney(d.revenue, data.currency)}`}
                    />
                    <div
                      className="w-1/2 rounded-t-lg bg-primary"
                      style={{ height: `${(Math.max(0, d.profit) / peak) * 100}%` }}
                      title={`${t("profit")} ${formatMoney(d.profit, data.currency)}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cozy-card p-5">
            <h2 className="font-display text-lg font-bold">{t("top_products")}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">{t("product_name")}</th>
                  <th className="pb-2 text-right">{t("qty")}</th>
                  <th className="pb-2 text-right">{t("revenue")}</th>
                  <th className="pb-2 text-right">{t("profit")}</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-right">{p.qty}</td>
                    <td className="py-2 text-right">{formatMoney(p.revenue, data.currency)}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatMoney(p.profit, data.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.products.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("no_orders")}</p>
            )}
          </div>
        </div>
      )}
    </StaffShell>
  );
}
