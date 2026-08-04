import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  QR_TTL_MINUTES,
  logAction,
  loadFullOrder,
  looseDb,
  orderLines,
  orderVoucherBlockers,
  orderVouchers,
  purgeExpired,
  randomToken,
  recomputeOrder,
  requireCashier,
  requireMember,
  requireRole,
  toRule,
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
    const { data } = await base.in("status", ["approved", "preparing", "kitchen_done", "received"]);
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
  /**
   * For a combo: the customisations chosen for each product inside it, so a
   * "set A" can still be "no ice, extra rice" per component.
   */
  combo_parts?: Array<{
    product_id: string;
    options?: Array<{ option_id: string; value_id: string }>;
  }>;
};

type CounterOptionJoin = {
  id: string;
  label: string;
  price_delta: number | string;
  option_id: string;
  product_options: { name: string; product_id: string } | null;
};

/**
 * Turns counter picks into order_item rows. Prices always come from the
 * database, never from the browser, and combo component choices are priced the
 * same way as top-level ones.
 */
export async function buildItemRows(storeId: string, orderId: string, items: CounterItemInput[]) {
  const productIds = Array.from(
    new Set([
      ...items.map((i) => i.product_id),
      ...items.flatMap((i) => (i.combo_parts ?? []).map((c) => c.product_id)),
    ]),
  );
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("store_id", storeId)
    .in("id", productIds);

  const chosenValueIds = Array.from(
    new Set(
      items.flatMap((i) => [
        ...(i.options ?? []).map((o) => o.value_id),
        ...(i.combo_parts ?? []).flatMap((c) => (c.options ?? []).map((o) => o.value_id)),
      ]),
    ),
  );
  const { data: optionValues } = chosenValueIds.length
    ? await supabaseAdmin
        .from("product_option_values")
        .select("id,label,price_delta,option_id,product_options(name,product_id)")
        .in("id", chosenValueIds)
    : { data: [] as CounterOptionJoin[] };

  const pick = (productId: string, sel: Array<{ value_id: string }> | undefined) =>
    (sel ?? []).flatMap((s) => {
      const v = ((optionValues ?? []) as CounterOptionJoin[]).find(
        (x) => x.id === s.value_id && x.product_options?.product_id === productId,
      );
      return v
        ? [
            {
              name: v.product_options?.name ?? "",
              label: v.label,
              price_delta: Number(v.price_delta),
            },
          ]
        : [];
    });

  return items.flatMap((i) => {
    const p = (products ?? []).find((x) => x.id === i.product_id);
    if (!p) return [];
    const picked = pick(p.id, i.options);

    const parts = (i.combo_parts ?? []).flatMap((c) => {
      const child = (products ?? []).find((x) => x.id === c.product_id);
      if (!child) return [];
      const chosen = pick(child.id, c.options);
      return [{ product_id: child.id, name: child.name, options: chosen }];
    });

    const addOn =
      picked.reduce((sum, o) => sum + o.price_delta, 0) +
      parts.reduce((sum, part) => sum + part.options.reduce((s, o) => s + o.price_delta, 0), 0);

    const labels = [
      ...picked.map((o) => o.label),
      ...parts.flatMap((part) => part.options.map((o) => `${part.name}: ${o.label}`)),
    ];

    return [
      {
        order_id: orderId,
        product_id: p.id,
        name_snapshot: labels.length ? `${p.name} (${labels.join(", ")})` : p.name,
        unit_price: Number(p.sell_price) + addOn,
        unit_cost: p.cost_price,
        qty: Math.max(1, i.qty),
        options: picked as never,
        combo_parts: parts as never,
      },
    ];
  });
}

export async function createWalkInImpl(
  ctx: AuthedCtx,
  data: { customer_name: string; note?: string; items: CounterItemInput[] },
) {
  const { store, member } = await requireCashier(ctx);
  if (!data.items.length) throw new Error("Add at least one item.");

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

  const rows = await buildItemRows(store.id, order.id, data.items);
  if (!rows.length) throw new Error("None of those items are on the menu.");
  await looseDb().from("order_items").insert(rows);
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
  if (
    order.qr_expires_at &&
    new Date(order.qr_expires_at).getTime() < Date.now() &&
    order.status === "submitted"
  ) {
    throw new Error("EXPIRED_OR_UNKNOWN");
  }
  return order;
}

/**
 * Attaches a scanned voucher to a ticket. Codes that cannot ever apply are
 * rejected outright; codes whose *terms* are not met yet are attached anyway
 * and reported as blockers, so the counter can offer the guest the missing item
 * instead of silently dropping the promo.
 */
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
  if (order.status !== "submitted")
    throw new Error("Discounts can only be added before payment approval.");

  const { data: voucherRow } = await supabaseAdmin
    .from("vouchers")
    .select("*")
    .eq("store_id", store.id)
    .eq("code", code)
    .maybeSingle();

  if (!voucherRow || !voucherRow.is_active) return { ok: false, reason: "invalid" as const };
  const rule = toRule(
    voucherRow as unknown as Record<string, unknown> & { id: string; code: string },
  );
  if (rule.usage_limit > 0 && rule.used_count >= rule.usage_limit)
    return { ok: false, reason: "used" as const };
  // Vouchers do not expire. A freshly minted code is always applicable as far
  // as the calendar is concerned; only its terms and usage cap can hold it back.

  const attached = await orderVouchers(order.id);
  if (attached.some((v) => v.id === rule.id))
    return { ok: false, reason: "already_applied" as const };
  // A non-stackable code refuses to sit next to another one.
  if (attached.length && (!rule.stackable || attached.some((v) => !v.stackable)))
    return { ok: false, reason: "not_stackable" as const };

  await looseDb().from("order_vouchers").insert({ order_id: order.id, voucher_id: rule.id });
  if (!order.voucher_id)
    await supabaseAdmin.from("orders").update({ voucher_id: rule.id }).eq("id", order.id);

  await recomputeOrder(order.id);
  // The counter popup re-renders straight from this row, so it must carry the
  // full relations (items, vouchers, gift) — a bare row makes `items` undefined.
  const updated = await loadFullOrder(order.id);
  const blockers = await orderVoucherBlockers(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "voucher.applied",
    detail: { code: rule.code },
  });
  return { ok: true as const, order: updated, voucher: voucherRow, blockers };
}

/** Detaches a scanned code again, e.g. the guest changed their mind. */
export async function removeVoucherImpl(
  ctx: AuthedCtx,
  data: { orderId: string; voucherId: string },
) {
  const { store, member } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status !== "submitted")
    throw new Error("Discounts can only be changed before payment approval.");

  await looseDb()
    .from("order_vouchers")
    .delete()
    .eq("order_id", order.id)
    .eq("voucher_id", data.voucherId);
  if (order.voucher_id === data.voucherId) {
    const rest = await orderVouchers(order.id);
    await supabaseAdmin
      .from("orders")
      .update({ voucher_id: rest.find((v) => v.id !== data.voucherId)?.id ?? null })
      .eq("id", order.id);
  }
  await recomputeOrder(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    action: "voucher.removed",
    detail: { voucherId: data.voucherId },
  });
  return loadFullOrder(order.id);
}

/** Why the ticket cannot be approved yet, if anything. */
export async function orderBlockersImpl(ctx: AuthedCtx, data: { orderId: string }) {
  const { store } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  return { blockers: await orderVoucherBlockers(order.id) };
}

/**
 * Counter amendment: the guest agrees to add the item a promo needs (or drop a
 * line), so the ticket is edited before payment. The edit is stamped so the
 * guest's phone can show that their order changed.
 */
export async function amendOrderItemsImpl(
  ctx: AuthedCtx,
  data: {
    orderId: string;
    add?: CounterItemInput[];
    removeItemIds?: string[];
    note?: string;
  },
) {
  const { store, member } = await requireCashier(ctx);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", data.orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status !== "submitted")
    throw new Error("An order can only be changed before payment is approved.");

  if (data.removeItemIds?.length) {
    await supabaseAdmin
      .from("order_items")
      .delete()
      .eq("order_id", order.id)
      .in("id", data.removeItemIds);
  }
  if (data.add?.length) {
    const rows = await buildItemRows(store.id, order.id, data.add);
    if (rows.length) await supabaseAdmin.from("order_items").insert(rows as never);
  }

  const { count } = await supabaseAdmin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id);
  if (!count) throw new Error("An order must keep at least one item.");

  await looseDb()
    .from("orders")
    .update({ edited_at: new Date().toISOString(), edited_note: (data.note ?? "").slice(0, 160) })
    .eq("id", order.id);
  await recomputeOrder(order.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    orderId: order.id,
    actorRole: "cashier",
    action: "order.amended",
    detail: { added: data.add?.length ?? 0, removed: data.removeItemIds?.length ?? 0 },
  });
  return loadFullOrder(order.id);
}

export async function setGiftImpl(
  ctx: AuthedCtx,
  data: { orderId: string; giftId: string | null },
) {
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

    // Gift terms mirror voucher terms: item count and a required product.
    const g = gift as unknown as Record<string, unknown>;
    const lines = await orderLines(order.id);
    const itemCount = lines.reduce((s, l) => s + l.qty, 0);
    const minItems = Number(g["min_items"] ?? 0);
    if (minItems > 0 && itemCount < minItems)
      throw new Error(`This gift needs at least ${minItems} items on the ticket.`);
    const requiredProduct = g["required_product_id"] as string | null;
    if (requiredProduct) {
      const need = Math.max(1, Number(g["required_qty"] ?? 1));
      const have = lines
        .filter((l) => l.product_id === requiredProduct)
        .reduce((s, l) => s + l.qty, 0);
      if (have < need) throw new Error("This gift needs a specific product on the ticket.");
    }
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
  if (order.status !== "submitted")
    throw new Error("Only unpaid submitted orders can be approved.");

  // A promo whose terms are not met blocks payment. The counter must either
  // add what the promo needs or drop the code first.
  const blockers = await orderVoucherBlockers(order.id);
  if (blockers.length) {
    const err = new Error(`VOUCHER_TERMS_UNMET:${JSON.stringify(blockers)}`);
    throw err;
  }

  const { data: numbered } = await supabaseAdmin.rpc("assign_order_no", { p_order: order.id });
  // The pickup number the customer will be called by. Minted once, at payment.
  const { data: orderCode } = await supabaseAdmin.rpc(
    "assign_order_code" as never,
    {
      p_order: order.id,
    } as never,
  );

  // Every attached code counts one redemption against its usage limit.
  for (const v of await orderVouchers(order.id)) {
    await looseDb()
      .from("vouchers")
      .update({
        used_count: v.used_count + 1,
        used_by_order: order.id,
        used_at: new Date().toISOString(),
        is_active: v.usage_limit > 0 && v.used_count + 1 >= v.usage_limit ? false : true,
      })
      .eq("id", v.id);
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

  // An event discount is a manual, reason-tagged deduction: the counter may
  // give it on any ticket, so there is no spend threshold to clear.
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
