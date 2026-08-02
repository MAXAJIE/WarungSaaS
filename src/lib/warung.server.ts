import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AuthedCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type Membership = {
  member: {
    id: string;
    store_id: string;
    user_id: string;
    role: "cashier" | "kitchen" | "pickup";
    display_name: string;
    group_id: string | null;
  };
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
  return { member, store } as Membership;
}

export async function requireMember(ctx: AuthedCtx): Promise<Membership> {
  const m = await getMembership(ctx);
  if (!m) throw new Error("You are not part of any store yet.");
  return m;
}

export async function requireCashier(ctx: AuthedCtx): Promise<Membership> {
  const m = await requireMember(ctx);
  if (m.member.role !== "cashier") throw new Error("Only the owner/cashier can do this.");
  return m;
}

export async function requireRole(
  ctx: AuthedCtx,
  roles: Array<"cashier" | "kitchen" | "pickup">,
): Promise<Membership> {
  const m = await requireMember(ctx);
  if (!roles.includes(m.member.role)) throw new Error("Your role cannot do this.");
  return m;
}

export async function logAction(args: {
  storeId: string;
  actorId?: string | null;
  actorLabel: string;
  orderId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("activity_logs").insert({
    store_id: args.storeId,
    actor_id: args.actorId ?? null,
    actor_label: args.actorLabel,
    order_id: args.orderId ?? null,
    action: args.action,
    detail: (args.detail ?? {}) as never,
  });
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

export async function signPhoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from("product-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function signPhotos<T extends { photo_url: string | null }>(
  rows: T[],
): Promise<Array<T & { photo_signed_url: string | null }>> {
  return Promise.all(
    rows.map(async (r) => ({ ...r, photo_signed_url: await signPhoto(r.photo_url) })),
  );
}

/** Recalculates subtotal/discount/total/cost from items + voucher. */
export async function recomputeOrder(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*, voucher:vouchers(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.unit_price) * i.qty, 0);
  const costTotal = (items ?? []).reduce((s, i) => s + Number(i.unit_cost) * i.qty, 0);

  let discount = 0;
  const voucher = (order as { voucher?: { kind: string; value: number | string } | null }).voucher;
  if (voucher) {
    discount =
      voucher.kind === "percent"
        ? (subtotal * Number(voucher.value)) / 100
        : Math.min(subtotal, Number(voucher.value));
  }
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
    .select("*, items:order_items(*), voucher:vouchers(code,label,kind,value), gift:gifts(name)")
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
