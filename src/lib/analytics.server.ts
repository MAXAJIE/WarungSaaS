import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCashier, type AuthedCtx } from "./warung.server";

export async function analyticsImpl(ctx: AuthedCtx, data: { days: number }) {
  const { store } = await requireCashier(ctx);
  const days = Math.min(90, Math.max(1, data.days || 7));
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id,total,cost_total,discount_total,created_at,approved_at,status")
    .eq("store_id", store.id)
    .in("status", ["approved", "preparing", "kitchen_done", "received", "completed"])
    .gte("created_at", since.toISOString());

  const list = orders ?? [];
  const orderIds = list.map((o) => o.id);

  let items: Array<{
    order_id: string;
    name_snapshot: string;
    unit_price: number | string;
    unit_cost: number | string;
    qty: number;
  }> = [];
  if (orderIds.length) {
    const { data: rows } = await supabaseAdmin
      .from("order_items")
      .select("order_id,name_snapshot,unit_price,unit_cost,qty")
      .in("order_id", orderIds);
    items = rows ?? [];
  }

  const byDayMap = new Map<string, { day: string; revenue: number; cost: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDayMap.set(key, { day: key, revenue: 0, cost: 0, orders: 0 });
  }
  for (const o of list) {
    const key = (o.approved_at ?? o.created_at).slice(0, 10);
    const row = byDayMap.get(key);
    if (!row) continue;
    row.revenue += Number(o.total);
    row.cost += Number(o.cost_total);
    row.orders += 1;
  }

  const productMap = new Map<
    string,
    { name: string; qty: number; revenue: number; cost: number }
  >();
  for (const it of items) {
    const cur = productMap.get(it.name_snapshot) ?? {
      name: it.name_snapshot,
      qty: 0,
      revenue: 0,
      cost: 0,
    };
    cur.qty += it.qty;
    cur.revenue += Number(it.unit_price) * it.qty;
    cur.cost += Number(it.unit_cost) * it.qty;
    productMap.set(it.name_snapshot, cur);
  }

  const revenue = list.reduce((s, o) => s + Number(o.total), 0);
  const cost = list.reduce((s, o) => s + Number(o.cost_total), 0);
  const discounts = list.reduce((s, o) => s + Number(o.discount_total), 0);

  return {
    currency: store.currency,
    totals: {
      revenue,
      cost,
      profit: revenue - cost,
      discounts,
      orders: list.length,
      avgOrder: list.length ? revenue / list.length : 0,
      margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    },
    byDay: Array.from(byDayMap.values()).map((d) => ({
      ...d,
      profit: d.revenue - d.cost,
    })),
    products: Array.from(productMap.values())
      .map((p) => ({ ...p, profit: p.revenue - p.cost }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12),
  };
}
