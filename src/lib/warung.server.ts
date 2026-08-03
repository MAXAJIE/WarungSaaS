import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { stackDiscount, voucherBlockers, type OrderLine, type VoucherRule } from "./vouchers";

/**
 * Tables and columns added by the versatile-voucher migration are not part of
 * the generated `Database` types yet, so those reads go through a deliberately
 * loose view of the same admin client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function looseDb(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export type AuthedCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/** Every hat a person can wear. Only the owner may hold more than one. */
export type StoreRole = "owner" | "cashier" | "kitchen" | "pickup";

/** Roles the owner can hand out on the People page. */
export const ASSIGNABLE_ROLES: StoreRole[] = ["owner", "cashier", "kitchen", "pickup"];

const ROLE_RANK: Record<StoreRole, number> = { owner: 0, cashier: 1, kitchen: 2, pickup: 3 };

/** Most-privileged first, so `roles[0]` is always the primary hat. */
export function sortRoles(roles: StoreRole[]): StoreRole[] {
  return Array.from(new Set(roles)).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
}

export type Membership = {
  member: {
    id: string;
    store_id: string;
    user_id: string;
    role: StoreRole;
    display_name: string;
    group_id: string | null;
  };
  /** Full role set, primary first. Never empty. */
  roles: StoreRole[];
  store: Database["public"]["Tables"]["stores"]["Row"];
};

export const QR_TTL_MINUTES = 15;

export async function getMembership(ctx: AuthedCtx): Promise<Membership | null> {
  const { data: member } = await ctx.supabase
    .from("store_members")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!member) return null;
  const { data: store } = await ctx.supabase
    .from("stores")
    .select("*")
    .eq("id", member.store_id)
    .maybeSingle();
  if (!store) return null;

  const { data: extra } = await ctx.supabase
    .from("member_roles")
    .select("role")
    .eq("member_id", member.id);

  // The primary role on store_members is always part of the set, so a member
  // whose member_roles rows are missing still behaves exactly as before.
  const roles = sortRoles([
    ...((extra ?? []).map((r) => r.role) as StoreRole[]),
    member.role as StoreRole,
  ]);

  return { member, roles, store } as Membership;
}

export async function requireMember(ctx: AuthedCtx): Promise<Membership> {
  const m = await getMembership(ctx);
  if (!m) throw new Error("You are not part of any store yet.");
  return m;
}

/** Counter duty: taking payment. The owner always counts as a cashier too. */
export async function requireCashier(ctx: AuthedCtx): Promise<Membership> {
  const m = await requireMember(ctx);
  if (!m.roles.includes("cashier") && !m.roles.includes("owner"))
    throw new Error("Only the counter can do this.");
  return m;
}

/** Anything that changes the shape of the business: products, people, promos. */
export async function requireOwner(ctx: AuthedCtx): Promise<Membership> {
  const m = await requireMember(ctx);
  if (!m.roles.includes("owner")) throw new Error("Only the owner can do this.");
  return m;
}

export async function requireRole(ctx: AuthedCtx, roles: StoreRole[]): Promise<Membership> {
  const m = await requireMember(ctx);
  if (!roles.some((r) => m.roles.includes(r))) throw new Error("Your role cannot do this.");
  return m;
}

export async function logAction(args: {
  storeId: string;
  actorId?: string | null;
  actorLabel: string;
  /** Which hat the person was wearing. Drives the per-role log views. */
  actorRole?: StoreRole | null;
  orderId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("activity_logs").insert({
    store_id: args.storeId,
    actor_id: args.actorId ?? null,
    actor_label: args.actorLabel,
    actor_role: args.actorRole ?? null,
    order_id: args.orderId ?? null,
    action: args.action,
    detail: (args.detail ?? {}) as never,
  } as never);
}

export function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Product photos live in a PUBLIC bucket, so the URL is stable and cacheable
 * instead of a signed link that expires mid-service. Values that are already
 * absolute URLs are passed straight through.
 */
export function productPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabaseAdmin.storage.from("product-photos").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export async function signPhoto(path: string | null | undefined): Promise<string | null> {
  return productPhotoUrl(path);
}

export async function signPhotos<T extends { photo_url: string | null }>(
  rows: T[],
): Promise<Array<T & { photo_signed_url: string | null }>> {
  return Promise.all(
    rows.map(async (r) => ({ ...r, photo_signed_url: await signPhoto(r.photo_url) })),
  );
}

/** Every voucher attached to a ticket, old single column included. */
export async function orderVouchers(orderId: string): Promise<VoucherRule[]> {
  const { data: links } = await looseDb()
    .from("order_vouchers")
    .select("voucher_id")
    .eq("order_id", orderId);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("voucher_id")
    .eq("id", orderId)
    .maybeSingle();

  const ids = Array.from(
    new Set([
      ...((links ?? []) as Array<{ voucher_id: string }>).map((l) => l.voucher_id),
      ...(order?.voucher_id ? [order.voucher_id] : []),
    ]),
  );
  if (!ids.length) return [];
  const { data: rows } = await supabaseAdmin.from("vouchers").select("*").in("id", ids);
  return ((rows ?? []) as unknown as VoucherRow[]).map(toRule);
}

/** Raw voucher row shape after the versatile-voucher migration. */
type VoucherRow = Record<string, unknown> & { id: string; code: string };

export function toRule(row: VoucherRow): VoucherRule {
  const num = (k: string, fallback = 0) => Number(row[k] ?? fallback) || fallback;
  return {
    id: row.id,
    code: row.code,
    label: String(row["label"] ?? ""),
    reward: (row["reward"] as VoucherRule["reward"]) ?? "order_percent",
    value: num("value"),
    reward_product_id: (row["reward_product_id"] as string | null) ?? null,
    nth_item: num("nth_item", 2),
    buy_qty: num("buy_qty", 1),
    get_qty: num("get_qty", 1),
    stackable: Boolean(row["stackable"]),
    max_discount: num("max_discount"),
    min_spend: num("min_spend"),
    min_items: num("min_items"),
    required_product_id: (row["required_product_id"] as string | null) ?? null,
    required_qty: num("required_qty", 1),
    usage_limit: num("usage_limit", 1),
    used_count: num("used_count"),
    is_active: row["is_active"] !== false,
    terms: String(row["terms"] ?? ""),
  };
}

export async function orderLines(orderId: string): Promise<OrderLine[]> {
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("product_id, qty, unit_price")
    .eq("order_id", orderId);
  return (items ?? []).map((i) => ({
    product_id: i.product_id,
    qty: i.qty,
    unit_price: Number(i.unit_price),
  }));
}

/** Unmet terms per attached voucher. Empty object = the ticket may be paid. */
export async function orderVoucherBlockers(orderId: string) {
  const [vouchers, lines] = await Promise.all([orderVouchers(orderId), orderLines(orderId)]);
  return vouchers
    .map((v) => ({ code: v.code, label: v.label, blockers: voucherBlockers(v, lines) }))
    .filter((r) => r.blockers.length > 0);
}

/** Recalculates subtotal/discount/total/cost from items + every voucher. */
export async function recomputeOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
  const costTotal = (items ?? []).reduce((s, i) => s + Number(i.unit_cost) * i.qty, 0);

  const lines: OrderLine[] = (items ?? []).map((i) => ({
    product_id: i.product_id,
    qty: i.qty,
    unit_price: Number(i.unit_price),
  }));
  const vouchers = await orderVouchers(orderId);
  let discount = stackDiscount(vouchers, lines).total;

  // An event discount is a manual, reason-tagged reduction the counter may add
  // once the ticket clears the store's event spend threshold.
  const special = Math.max(
    0,
    Number((order as { special_discount?: number | string }).special_discount ?? 0),
  );
  discount = Math.min(subtotal, discount + special);
  const total = Math.max(0, subtotal - discount);

  const { data: updated } = await supabaseAdmin
    .from("orders")
    .update({
      subtotal: Number(subtotal.toFixed(2)),
      discount_total: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
      cost_total: Number(costTotal.toFixed(2)),
    })
    .eq("id", orderId)
    .select("*")
    .single();

  return updated;
}

export async function loadFullOrder(orderId: string) {
  const { data } = await supabaseAdmin
    .from("orders")
    .select(
      "*, items:order_items(*), voucher:vouchers(code,label,kind,value), gift:gifts(name), vouchers:order_vouchers(voucher:vouchers(*))",
    )
    .eq("id", orderId)
    .maybeSingle();
  return data;
}

export async function purgeExpired(storeId?: string) {
  const query = supabaseAdmin
    .from("orders")
    .delete()
    .in("status", ["cart", "submitted"])
    .lt("qr_expires_at", new Date().toISOString());
  if (storeId) query.eq("store_id", storeId);
  await query;

  const staleCutoff = new Date(Date.now() - QR_TTL_MINUTES * 60_000).toISOString();
  const stale = supabaseAdmin
    .from("orders")
    .delete()
    .eq("status", "cart")
    .is("qr_expires_at", null)
    .lt("updated_at", staleCutoff);
  if (storeId) stale.eq("store_id", storeId);
  await stale;
}
