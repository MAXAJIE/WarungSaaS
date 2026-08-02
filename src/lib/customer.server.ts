import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  QR_TTL_MINUTES,
  logAction,
  purgeExpired,
  randomToken,
  recomputeOrder,
  signPhotos,
} from "./warung.server";
import { notifyStore } from "./notifications.server";

export type CartOptionInput = { option_id: string; value_id: string };
export type CartItemInput = {
  product_id: string;
  qty: number;
  /** Customisations the customer picked. Each one may add to the unit price. */
  options?: CartOptionInput[];
};

type OptionValueJoin = {
  id: string;
  label: string;
  price_delta: number | string;
  option_id: string;
  product_options: { name: string; product_id: string } | null;
};

async function findStoreBySlug(slug: string) {
  const { data: store } = await supabaseAdmin
    .from("stores")
    .select(
      "id,name,slug,tagline,currency,is_open,avg_prep_minutes,disclaimer,gift_threshold,order_code_template",
    )
    .eq("slug", (slug ?? "").trim().toLowerCase())
    .maybeSingle();
  return store ?? null;
}

async function storeBySlug(slug: string) {
  const store = await findStoreBySlug(slug);
  if (!store) throw new Error("Store not found.");
  return store;
}

export async function getMenuImpl(data: { slug: string }) {
  const store = await findStoreBySlug(data.slug);
  if (!store) return { store: null, products: [] };
  const { data: products } = await supabaseAdmin
    .from("products")
    .select(
      "id,name,name_zh,name_ms,description,category,sell_price,photo_url,is_available,stock_total,stock_sold,is_combo",
    )
    .eq("store_id", store.id)
    .eq("is_available", true)
    .order("sort_order")
    .order("created_at");
  const withPhotos = await signPhotos(
    (products ?? []).map((p) => ({ ...p, photo_url: p.photo_url })),
  );
  // Remaining = total stocked - units already sold. The owner only ever edits
  // the total, so topping it up immediately lifts the remaining count here too.
  const [{ data: comboRows }] = await Promise.all([
    supabaseAdmin.from("combo_items").select("combo_id,product_id,qty"),
  ]);
  const productIds = withPhotos.map((p) => p.id);
  const safeIds = productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"];
  const { data: optionRows } = await supabaseAdmin
    .from("product_options")
    .select("id,product_id,name,is_required,max_select,sort_order")
    .in("product_id", safeIds)
    .order("sort_order");
  const optionIds = (optionRows ?? []).map((o) => o.id);
  const { data: valueRows } = await supabaseAdmin
    .from("product_option_values")
    .select("id,option_id,label,price_delta,sort_order")
    .in("option_id", optionIds.length ? optionIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order");

  const byId = new Map(withPhotos.map((p) => [p.id, p]));
  const menu = withPhotos.map((p) => {
    const total = p.stock_total === null || p.stock_total === undefined ? null : Number(p.stock_total);
    const remaining = total === null ? null : Math.max(0, total - Number(p.stock_sold ?? 0));
    const combo_parts = (comboRows ?? [])
      .filter((c) => c.combo_id === p.id)
      .flatMap((c) => {
        const sub = byId.get(c.product_id);
        return sub ? [{ name: sub.name, qty: c.qty }] : [];
      });
    const options = (optionRows ?? [])
      .filter((o) => o.product_id === p.id)
      .map((o) => ({
        id: o.id,
        name: o.name,
        is_required: o.is_required,
        max_select: o.max_select,
        values: (valueRows ?? [])
          .filter((v) => v.option_id === o.id)
          .map((v) => ({ id: v.id, label: v.label, price_delta: Number(v.price_delta) })),
      }))
      .filter((o) => o.values.length > 0);
    return { ...p, remaining, sold_out: remaining === 0, combo_parts, options };
  });
  return { store, products: menu };
}


function publicOrderShape(order: {
  id: string;
  order_no: number | null;
  order_code?: string | null;
  customer_name: string;
  note: string;
  status: string;
  subtotal: number | string;
  discount_total: number | string;
  total: number | string;
  guest_token: string;
  qr_token: string | null;
  qr_expires_at: string | null;
  created_at: string;
  approved_at: string | null;
  ready_at?: string | null;
  items?: Array<{
    id: string;
    name_snapshot: string;
    unit_price: number | string;
    qty: number;
    options?: unknown;
  }>;
}) {
  return {
    id: order.id,
    order_no: order.order_no,
    /** The pickup number the counter will call out. Minted at payment. */
    order_code: order.order_code ?? null,
    customer_name: order.customer_name,
    note: order.note,
    status: order.status,
    subtotal: Number(order.subtotal),
    discount_total: Number(order.discount_total),
    total: Number(order.total),
    guest_token: order.guest_token,
    qr_token: order.qr_token,
    qr_expires_at: order.qr_expires_at,
    created_at: order.created_at,
    approved_at: order.approved_at,
    ready_at: order.ready_at ?? null,
    items: (order.items ?? []).map((i) => ({
      id: i.id,
      name: i.name_snapshot,
      unit_price: Number(i.unit_price),
      qty: i.qty,
      options: (Array.isArray(i.options) ? i.options : []) as Array<{
        name: string;
        label: string;
        price_delta: number;
      }>,
    })),
  };
}

async function loadGuestOrder(token: string) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("guest_token", token)
    .maybeSingle();
  return data;
}

export async function saveCartImpl(data: {
  slug: string;
  guestToken?: string | null;
  note?: string;
  items: CartItemInput[];
}) {
  const store = await storeBySlug(data.slug);
  if (!store.is_open) throw new Error("STORE_CLOSED");
  await purgeExpired(store.id);
  if (!data.items.length) throw new Error("Please choose at least one item.");

  let order = data.guestToken ? await loadGuestOrder(data.guestToken) : null;
  if (order && !["cart", "submitted"].includes(order.status)) {
    throw new Error("LOCKED");
  }

  if (!order) {
    const { data: created, error } = await supabaseAdmin
      .from("orders")
      .insert({
        store_id: store.id,
        // Customers do not name their own order: the pickup number does that.
        customer_name: "Guest",
        note: (data.note ?? "").slice(0, 200),
        status: "cart",
        source: "customer",
        guest_token: randomToken(),
      })
      .select("*, items:order_items(*)")
      .single();
    if (error) throw new Error(error.message);
    order = created;
  } else {
    await supabaseAdmin
      .from("orders")
      .update({
        customer_name: "Guest",
        note: (data.note ?? "").slice(0, 200),
        status: "cart",
        qr_token: null,
        qr_expires_at: null,
      })
      .eq("id", order.id);
  }

  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id,name,sell_price,cost_price,is_available")
    .eq("store_id", store.id)
    .in(
      "id",
      data.items.map((i) => i.product_id),
    );

  // Add-on prices are resolved server-side; the browser never decides what a
  // customisation costs.
  const chosenValueIds = Array.from(
    new Set(data.items.flatMap((i) => (i.options ?? []).map((o) => o.value_id))),
  );
  const { data: optionValues } = chosenValueIds.length
    ? await supabaseAdmin
        .from("product_option_values")
        .select("id,label,price_delta,option_id,product_options(name,product_id)")
        .in("id", chosenValueIds)
    : { data: [] as OptionValueJoin[] };

  await supabaseAdmin.from("order_items").delete().eq("order_id", order!.id);
  const rows = data.items.flatMap((i) => {
    const p = (products ?? []).find((x) => x.id === i.product_id && x.is_available);
    if (!p) return [];
    const picked = (i.options ?? []).flatMap((sel) => {
      const v = ((optionValues ?? []) as OptionValueJoin[]).find(
        (x) => x.id === sel.value_id && x.product_options?.product_id === p.id,
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
    const addOn = picked.reduce((sum, o) => sum + o.price_delta, 0);
    return [
      {
        order_id: order!.id,
        product_id: p.id,
        name_snapshot: picked.length
          ? `${p.name} (${picked.map((o) => o.label).join(", ")})`
          : p.name,
        unit_price: Number(p.sell_price) + addOn,
        unit_cost: p.cost_price,
        qty: Math.min(50, Math.max(1, Math.round(i.qty))),
        options: picked as never,
      },
    ];
  });
  if (!rows.length) throw new Error("Those items are no longer available.");
  await supabaseAdmin.from("order_items").insert(rows);
  await recomputeOrder(order!.id);

  const fresh = await loadGuestOrder(order!.guest_token);
  return publicOrderShape(fresh as never);
}

export async function submitOrderImpl(data: { guestToken: string }) {
  const order = await loadGuestOrder(data.guestToken);
  if (!order) throw new Error("GONE");
  if (!["cart", "submitted"].includes(order.status)) throw new Error("LOCKED");

  const qrToken = randomToken();
  const expires = new Date(Date.now() + QR_TTL_MINUTES * 60_000).toISOString();
  await supabaseAdmin
    .from("orders")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      qr_token: qrToken,
      qr_expires_at: expires,
    })
    .eq("id", order.id);

  await logAction({
    storeId: order.store_id,
    actorLabel: order.customer_name || "Guest",
    orderId: order.id,
    action: "order.submitted",
    detail: { total: Number(order.total) },
  });

  // The cashier is the only role that can approve payment, so only they are pinged.
  await notifyStore({
    storeId: order.store_id,
    roles: ["cashier"],
    type: "order.new",
    payload: { who: order.customer_name || "Guest", total: Number(order.total) },
    targetUrl: "/dashboard",
  });

  const fresh = await loadGuestOrder(data.guestToken);
  return publicOrderShape(fresh as never);
}

export async function getGuestOrderImpl(data: { guestToken: string }) {
  const order = await loadGuestOrder(data.guestToken);
  if (!order) return { gone: true as const };
  if (
    ["cart", "submitted"].includes(order.status) &&
    order.qr_expires_at &&
    new Date(order.qr_expires_at).getTime() < Date.now()
  ) {
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    return { gone: true as const };
  }

  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("name,slug,avg_prep_minutes,currency")
    .eq("id", order.store_id)
    .maybeSingle();

  const { data: aheadOrders } = await supabaseAdmin
    .from("orders")
    .select("id, items:order_items(qty)")
    .eq("store_id", order.store_id)
    .in("status", ["approved", "preparing", "kitchen_done"])
    .lt("created_at", order.created_at);

  const ahead = (aheadOrders ?? []).length;
  // avg_prep_minutes is the owner's "minutes per cup" figure and stays private.
  // Customers only see the resulting approximation for the cups ahead of them.
  const perUnit = Number(store?.avg_prep_minutes ?? 8);
  const cupsAhead = (aheadOrders ?? []).reduce(
    (sum, o) => sum + ((o.items ?? []) as Array<{ qty: number }>).reduce((a, i) => a + i.qty, 0),
    0,
  );
  const myCups = ((order.items ?? []) as Array<{ qty: number }>).reduce((a, i) => a + i.qty, 0);

  return {
    gone: false as const,
    order: publicOrderShape(order as never),
    store: store ? { name: store.name, slug: store.slug, currency: store.currency } : null,
    queueAhead: ahead,
    cupsAhead,
    estimateMinutes: Math.max(1, Math.round((cupsAhead + Math.max(1, myCups)) * perUnit)),
  };
}

/**
 * "I've got my food." Receiving belongs to the customer alone, and the ticket
 * closes the moment they confirm it.
 */
export async function confirmReceiptImpl(data: { guestToken: string }) {
  const order = await loadGuestOrder(data.guestToken);
  if (!order) throw new Error("GONE");
  if (!["kitchen_done", "received"].includes(order.status)) throw new Error("NOT_READY");
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("orders")
    .update({ status: "completed", received_at: now, completed_at: now } as never)
    .eq("id", order.id);
  await logAction({
    storeId: order.store_id,
    actorLabel: order.customer_name || "Guest",
    orderId: order.id,
    action: "order.received",
    detail: { order_code: (order as { order_code?: string | null }).order_code ?? null },
  });
  await notifyStore({
    storeId: order.store_id,
    roles: ["cashier", "pickup"],
    type: "order.received",
    payload: { order_no: order.order_no ?? 0 },
    targetUrl: "/dashboard",
  });
  const fresh = await loadGuestOrder(data.guestToken);
  return publicOrderShape(fresh as never);
}

export async function cancelGuestOrderImpl(data: { guestToken: string }) {
  const order = await loadGuestOrder(data.guestToken);
  if (!order) return { ok: true };
  if (!["cart", "submitted"].includes(order.status)) throw new Error("LOCKED");
  await supabaseAdmin.from("orders").delete().eq("id", order.id);
  return { ok: true };
}
