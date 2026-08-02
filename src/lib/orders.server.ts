import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  QR_TTL_MINUTES,
  logAction,
  loadFullOrder,
  purgeExpired,
  randomToken,
  recomputeOrder,
  requireCashier,
  requireMember,
  requireRole,
  type AuthedCtx,
} from "./warung.server";
import { compartmentsForOrder, notifyStore } from "./notifications.server";

const ACTIVE = ["submitted", "approved", "preparing", "kitchen_done", "received"] as const;

export async function listOrdersImpl(ctx: AuthedCtx) {
  const { store, member } = await requireMember(ctx);
  await purgeExpired(store.id);

  const base = supabaseAdmin
    .from("orders")
    .select("*, items:order_items(*), voucher:vouchers(code,label), gift:gifts(name)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: true });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  if (member.role === "kitchen") {
    const { data } = await base.in("status", ["approved", "preparing", "kitchen_done"]);
    return { role: member.role, store, orders: data ?? [] };
  }
  if (member.role === "pickup") {
    const { data } = await base.in("status", [
      "approved",
      "preparing",
      "kitchen_done",
      "received",
    ]);
    return { role: member.role, store, orders: data ?? [] };
  }
  const { data } = await base
    .in("status", [...ACTIVE, "completed", "cancelled"])
    .gte("created_at", startOfDay.toISOString());
  return { role: member.role, store, orders: data ?? [] };
}

export async function createWalkInImpl(
  ctx: AuthedCtx,
  data: { customer_name: string; note?: string; items: { product_id: string; qty: number }[] },
) {
  const { store, member } = await requireCashier(ctx);
  if (!data.items.length) throw new Error("Add at least one item.");

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", store.id)
    .in(
      "id",
      data.items.map((i) => i.product_id),
    );

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      store_id: store.id,
      customer_name: data.customer_name || "Walk-in",
      note: data.note ?? "",
      status: "submitted",
      source: "counter",
      guest_token: randomToken(),
      qr_token: randomToken(),
      qr_expires_at: new Date(Date.now() + QR_TTL_MINUTES * 60_000).toISOString(),
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const rows = data.items.flatMap((i) => {
    const p = (products ?? []).find((x) => x.id === i.product_id);
    if (!p) return [];
    return [
      {
        order_id: order.id,
        product_id: p.id,
        name_snapshot: p.name,
        unit_price: p.sell_price,
        unit_cost: p.cost_price,
        qty: Math.max(1, i.qty),
      },
    ];
  });
  await supabaseAdmin.from("order_items").insert(rows);
  await recomputeOrder(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "order.counter_created",
    detail: { customer: data.customer_name },
  });
  return loadFullOrder(order.id);
}

export async function findOrderByCodeImpl(ctx: AuthedCtx, data: { code: string }) {
  const { store } = await requireCashier(ctx);
  await purgeExpired(store.id);
  const raw = data.code.trim();
  const token = raw.includes("/") ? (raw.split("/").pop() ?? raw) : raw;
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*, items:order_items(*), voucher:vouchers(code,label), gift:gifts(name)")
    .eq("store_id", store.id)
    .eq("qr_token", token)
    .maybeSingle();
  if (!order) throw new Error("EXPIRED_OR_UNKNOWN");
  if (order.qr_expires_at && new Date(order.qr_expires_at).getTime() < Date.now() && order.status === "submitted") {
    throw new Error("EXPIRED_OR_UNKNOWN");
  }
  return order;
}

export async function applyVoucherImpl(ctx: AuthedCtx, data: { orderId: string; code: string }) {
  const { store, member } = await requireCashier(ctx);
  const code = data.code.trim().toUpperCase().split("/").pop() ?? "";
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status !== "submitted") throw new Error("Discounts can only be added before payment approval.");

  const { data: voucher } = await supabaseAdmin
    .from("vouchers")
    .select("*")
    .eq("store_id", store.id)
    .eq("code", code)
    .maybeSingle();

  if (!voucher || !voucher.is_active) return { ok: false, reason: "invalid" as const };
  if (voucher.used_by_order && voucher.used_by_order !== order.id)
    return { ok: false, reason: "used" as const };
  if (Number(order.subtotal) < Number(voucher.min_spend))
    return { ok: false, reason: "min_spend" as const, min: Number(voucher.min_spend) };

  await supabaseAdmin.from("orders").update({ voucher_id: voucher.id }).eq("id", order.id);
  const updated = await recomputeOrder(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "voucher.applied",
    detail: { code: voucher.code },
  });
  return { ok: true as const, order: updated, voucher };
}

export async function setGiftImpl(ctx: AuthedCtx, data: { orderId: string; giftId: string | null }) {
  const { store, member } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");

  if (data.giftId) {
    const { data: gift } = await supabaseAdmin
      .from("gifts")
      .select("*")
      .eq("id", data.giftId)
      .eq("store_id", store.id)
      .maybeSingle();
    if (!gift || !gift.is_active) throw new Error("Gift unavailable.");
    if (Number(order.total) < Number(gift.threshold))
      throw new Error("Order total is below the gift threshold.");
  }
  await supabaseAdmin.from("orders").update({ gift_id: data.giftId }).eq("id", order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "gift.set",
    detail: { giftId: data.giftId },
  });
  return loadFullOrder(order.id);
}

export async function approveOrderImpl(ctx: AuthedCtx, data: { orderId: string }) {
  const { store, member } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status !== "submitted") throw new Error("Only unpaid submitted orders can be approved.");

  const { data: numbered } = await supabaseAdmin.rpc("assign_order_no", { p_order: order.id });

  if (order.voucher_id) {
    await supabaseAdmin
      .from("vouchers")
      .update({ used_by_order: order.id, used_at: new Date().toISOString() })
      .eq("id", order.voucher_id)
      .is("used_by_order", null);
  }
  if (order.gift_id) {
    const { data: gift } = await supabaseAdmin
      .from("gifts")
      .select("stock")
      .eq("id", order.gift_id)
      .maybeSingle();
    if (gift && gift.stock > 0) {
      await supabaseAdmin
        .from("gifts")
        .update({ stock: gift.stock - 1 })
        .eq("id", order.gift_id);
    }
  }

  // Paid units count against inventory. Only the totals the owner stocked are
  // tracked; untracked products (stock_total null) are left alone.
  const { data: paidItems } = await supabaseAdmin
    .from("order_items")
    .select("product_id, qty")
    .eq("order_id", order.id);
  for (const item of paidItems ?? []) {
    if (!item.product_id) continue;
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("stock_total, stock_sold")
      .eq("id", item.product_id)
      .maybeSingle();
    if (!product || product.stock_total === null) continue;
    await supabaseAdmin
      .from("products")
      .update({ stock_sold: Number(product.stock_sold ?? 0) + item.qty })
      .eq("id", item.product_id);
  }

  await supabaseAdmin
    .from("orders")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      qr_token: null,
      qr_expires_at: null,
    })
    .eq("id", order.id);

  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "order.approved",
    detail: { order_no: numbered, total: Number(order.total) },
  });

  // Only the compartments responsible for the items in this order are alerted.
  const groups = await compartmentsForOrder(order.id);
  await notifyStore({
    storeId: store.id,
    roles: ["kitchen", "pickup"],
    type: "order.approved",
    payload: { order_no: (numbered as number | null) ?? order.order_no ?? 0 },
    groupIds: groups,
    targetUrl: "/dashboard",
    exceptUserId: ctx.userId,
  });
  return loadFullOrder(order.id);
}

const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; roles: Array<"cashier" | "kitchen" | "pickup">; stamp?: string }
> = {
  start: { from: ["approved"], to: "preparing", roles: ["kitchen", "cashier"] },
  kitchen_done: { from: ["preparing", "approved"], to: "kitchen_done", roles: ["kitchen", "cashier"], stamp: "ready_at" },
  receive: { from: ["kitchen_done"], to: "received", roles: ["pickup", "cashier"] },
  complete: { from: ["received", "kitchen_done"], to: "completed", roles: ["pickup", "cashier"], stamp: "completed_at" },
};

export async function advanceOrderImpl(
  ctx: AuthedCtx,
  data: { orderId: string; action: keyof typeof TRANSITIONS },
) {
  const rule = TRANSITIONS[data.action];
  if (!rule) throw new Error("Unknown action.");
  const { store, member } = await requireRole(ctx, rule.roles);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (!rule.from.includes(order.status)) throw new Error("This order is not at that step anymore.");

  const stamp = rule.stamp ? { [rule.stamp]: new Date().toISOString() } : {};
  await supabaseAdmin
    .from("orders")
    .update({ status: rule.to as "preparing", ...stamp })
    .eq("id", order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: `order.${data.action}`,
    detail: { order_no: order.order_no },
  });

  if (rule.to === "kitchen_done") {
    await notifyStore({
      storeId: store.id,
      roles: ["pickup", "cashier"],
      type: "order.kitchen_done",
      payload: { order_no: order.order_no ?? 0 },
      targetUrl: "/dashboard",
      exceptUserId: ctx.userId,
    });
  } else if (rule.to === "received" || rule.to === "completed") {
    await notifyStore({
      storeId: store.id,
      roles: ["cashier"],
      type: "order.received",
      payload: { order_no: order.order_no ?? 0 },
      targetUrl: "/dashboard",
      exceptUserId: ctx.userId,
    });
  }
  return loadFullOrder(order.id);
}

export async function cancelOrderImpl(ctx: AuthedCtx, data: { orderId: string; reason?: string }) {
  const { store, member } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status === "submitted") {
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
  } else {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", qr_token: null, qr_expires_at: null })
      .eq("id", order.id);
  }
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "order.cancelled",
    detail: { reason: data.reason ?? "" },
  });

  await notifyStore({
    storeId: store.id,
    roles: ["kitchen", "pickup"],
    type: "order.cancelled",
    payload: { order_no: order.order_no ?? 0 },
    targetUrl: "/dashboard",
    exceptUserId: ctx.userId,
  });
  return { ok: true };
}
