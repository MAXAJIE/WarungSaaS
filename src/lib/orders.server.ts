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
  type StoreRole,
} from "./warung.server";
import { compartmentsForOrder, notifyStore } from "./notifications.server";

const ACTIVE = ["submitted", "approved", "preparing", "kitchen_done", "received"] as const;

/**
 * Kitchen staff only see tickets that contain something their compartment is
 * responsible for. A kitchen member with no compartment sees everything, so a
 * half-configured store never hides work.
 */
async function scopeToCompartment<T extends { id: string }>(
  orders: T[],
  groupId: string | null,
): Promise<T[]> {
  if (!groupId || !orders.length) return orders;
  const { data: rows } = await supabaseAdmin
    .from("order_items")
    .select("order_id, product_id")
    .in(
      "order_id",
      orders.map((o) => o.id),
    );
  const productIds = Array.from(
    new Set((rows ?? []).map((r) => r.product_id).filter((x): x is string => !!x)),
  );
  if (!productIds.length) return [];
  const { data: links } = await supabaseAdmin
    .from("product_compartments")
    .select("product_id, group_id")
    .in("product_id", productIds)
    .eq("group_id", groupId);
  const mine = new Set((links ?? []).map((l) => l.product_id));
  const allowed = new Set(
    (rows ?? []).filter((r) => r.product_id && mine.has(r.product_id)).map((r) => r.order_id),
  );
  return orders.filter((o) => allowed.has(o.id));
}

export async function listOrdersImpl(ctx: AuthedCtx) {
  const { store, member, roles } = await requireMember(ctx);
  await purgeExpired(store.id);

  const base = supabaseAdmin
    .from("orders")
    .select("*, items:order_items(*), voucher:vouchers(code,label), gift:gifts(name)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: true });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // The owner and the counter both need the full board; single-role staff get
  // only the slice of the day they can act on.
  if (!roles.includes("owner") && !roles.includes("cashier")) {
    if (roles.includes("kitchen")) {
      const { data } = await base.in("status", ["approved", "preparing", "kitchen_done"]);
      const scoped = await scopeToCompartment(data ?? [], member.group_id);
      return { role: member.role, roles, store, orders: scoped };
    }
    const { data } = await base.in("status", [
      "approved",
      "preparing",
      "kitchen_done",
      "received",
    ]);
    return { role: member.role, roles, store, orders: data ?? [] };
  }

  const { data } = await base
    .in("status", [...ACTIVE, "completed", "cancelled"])
    .gte("created_at", startOfDay.toISOString());
  return { role: member.role, roles, store, orders: data ?? [] };
}

export type CounterItemInput = {
  product_id: string;
  qty: number;
  /** Customisations the waiter picked for the guest. */
  options?: Array<{ option_id: string; value_id: string }>;
};

type CounterOptionJoin = {
  id: string;
  label: string;
  price_delta: number | string;
  option_id: string;
  product_options: { name: string; product_id: string } | null;
};

export async function createWalkInImpl(
  ctx: AuthedCtx,
  data: { customer_name: string; note?: string; items: CounterItemInput[] },
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

  // Add-on prices are resolved here, never trusted from the counter screen.
  const chosenValueIds = Array.from(
    new Set(data.items.flatMap((i) => (i.options ?? []).map((o) => o.value_id))),
  );
  const { data: optionValues } = chosenValueIds.length
    ? await supabaseAdmin
        .from("product_option_values")
        .select("id,label,price_delta,option_id,product_options(name,product_id)")
        .in("id", chosenValueIds)
    : { data: [] as CounterOptionJoin[] };

  const rows = data.items.flatMap((i) => {
    const p = (products ?? []).find((x) => x.id === i.product_id);
    if (!p) return [];
    const picked = (i.options ?? []).flatMap((sel) => {
      const v = ((optionValues ?? []) as CounterOptionJoin[]).find(
        (x) => x.id === sel.value_id && x.product_options?.product_id === p.id,
      );
      return v
        ? [{ name: v.product_options?.name ?? "", label: v.label, price_delta: Number(v.price_delta) }]
        : [];
    });
    const addOn = picked.reduce((sum, o) => sum + o.price_delta, 0);
    return [
      {
        order_id: order.id,
        product_id: p.id,
        name_snapshot: picked.length
          ? `${p.name} (${picked.map((o) => o.label).join(", ")})`
          : p.name,
        unit_price: Number(p.sell_price) + addOn,
        unit_cost: p.cost_price,
        qty: Math.max(1, i.qty),
        options: picked as never,
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
    actorRole: "cashier",
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
  // The pickup number the customer will be called by. Minted once, at payment.
  const { data: orderCode } = await supabaseAdmin.rpc("assign_order_code" as never, {
    p_order: order.id,
  } as never);

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
    actorRole: "cashier",
    action: "order.approved",
    detail: { order_no: numbered, order_code: orderCode ?? null, total: Number(order.total) },
  });

  // Only the compartments responsible for the items in this order are alerted.
  const groups = await compartmentsForOrder(order.id);
  await notifyStore({
    storeId: store.id,
    roles: ["kitchen", "pickup"],
    type: "order.approved",
    payload: {
      order_no: (numbered as number | null) ?? order.order_no ?? 0,
      order_code: (orderCode as string | null) ?? "",
    },
    groupIds: groups,
    targetUrl: "/dashboard",
    exceptUserId: ctx.userId,
  });
  return loadFullOrder(order.id);
}

/*
 * Who may push a ticket forward.
 *
 * The counter is deliberately absent from every row: a cashier approves
 * payment and nothing else. Cooking belongs to the kitchen, handing over
 * belongs to pickup, and only the customer can say they received their food.
 * The owner is included everywhere because the owner covers every station.
 */
const TRANSITIONS: Record<
  string,
  { from: string[]; to: string; roles: StoreRole[]; stamp?: string }
> = {
  start: { from: ["approved"], to: "preparing", roles: ["kitchen", "owner"] },
  kitchen_done: {
    from: ["preparing", "approved"],
    to: "kitchen_done",
    roles: ["pickup", "kitchen", "cashier", "owner"],
    stamp: "ready_at",
  },
  receive: { from: ["kitchen_done"], to: "received", roles: ["pickup", "owner"] },
  complete: {
    from: ["received", "kitchen_done"],
    to: "completed",
    roles: ["pickup", "owner"],
    stamp: "completed_at",
  },
};

export async function advanceOrderImpl(
  ctx: AuthedCtx,
  data: { orderId: string; action: keyof typeof TRANSITIONS },
) {
  const rule = TRANSITIONS[data.action];
  if (!rule) throw new Error("Unknown action.");
  const { store, member, roles } = await requireRole(ctx, rule.roles);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (!rule.from.includes(order.status)) throw new Error("This order is not at that step anymore.");

  // A cook can only touch a ticket their own compartment is on.
  if (!roles.includes("owner") && roles.includes("kitchen") && member.group_id) {
    const visible = await scopeToCompartment([{ id: order.id }], member.group_id);
    if (!visible.length) throw new Error("This order is not for your compartment.");
  }

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
    actorRole: (rule.roles.find((r) => roles.includes(r)) ?? member.role) as StoreRole,
    action: `order.${data.action}`,
    detail: { order_no: order.order_no, order_code: order.order_code ?? null },
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

/**
 * Event discount: the counter may knock an amount off a ticket that reached the
 * store's event spend, and must say why. Both numbers are validated here so the
 * browser can never invent a discount.
 */
export async function setSpecialDiscountImpl(
  ctx: AuthedCtx,
  data: { orderId: string; amount: number; reason: string },
) {
  const { store, member, roles } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status !== "submitted")
    throw new Error("A discount can only be added before payment is approved.");

  const threshold = Number((store as { event_spend?: number | string }).event_spend ?? 0);
  if (threshold <= 0) throw new Error("No event discount is running.");
  if (Number(order.subtotal) < threshold)
    throw new Error("This order has not reached the event spend yet.");

  const amount = Math.max(0, Math.min(Number(order.subtotal), Number(data.amount) || 0));
  const reason = (data.reason ?? "").trim().slice(0, 120);
  if (amount > 0 && !reason) throw new Error("Please give a reason for the discount.");

  await supabaseAdmin
    .from("orders")
    .update({ special_discount: amount, special_discount_reason: reason } as never)
    .eq("id", order.id);
  await recomputeOrder(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    actorRole: roles.includes("owner") ? "owner" : "cashier",
    action: "order.special_discount",
    detail: { amount, reason },
  });
  return loadFullOrder(order.id);
}

export async function cancelOrderImpl(ctx: AuthedCtx, data: { orderId: string; reason?: string }) {
  const { store, member, roles } = await requireCashier(ctx);
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
    actorRole: roles.includes("owner") ? "owner" : "cashier",
    action: "order.cancelled",
    detail: { reason: data.reason ?? "", order_code: order.order_code ?? null },
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
