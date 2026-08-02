import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMember, type AuthedCtx } from "./warung.server";

export type StaffRole = "owner" | "cashier" | "kitchen" | "pickup";

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, string | number | boolean | null>;
  target_url: string | null;
  read: boolean;
  created_at: string;
};

/**
 * Fans a notification out to every staff member of a store that matches the
 * given roles. Group-scoped notifications only reach members of that
 * compartment (plus anyone with no compartment assigned, so nothing is lost).
 */
export async function notifyStore(args: {
  storeId: string;
  roles: StaffRole[];
  type: string;
  payload?: Record<string, string | number | boolean | null>;
  targetUrl?: string;
  groupIds?: string[] | null;
  exceptUserId?: string | null;
}) {
  // Match on the full role set, not just the primary role, so an owner who
  // also wears the kitchen hat still gets kitchen alerts.
  const { data: members } = await supabaseAdmin
    .from("store_members")
    .select("id, user_id, role, group_id")
    .eq("store_id", args.storeId);
  const { data: roleRows } = await supabaseAdmin
    .from("member_roles")
    .select("member_id, role")
    .eq("store_id", args.storeId);

  const rolesFor = (memberId: string, primary: string) =>
    new Set<string>([
      primary,
      ...(roleRows ?? []).filter((r) => r.member_id === memberId).map((r) => r.role),
    ]);

  const groupIds = args.groupIds?.filter(Boolean) ?? [];
  const targets = (members ?? []).filter((m) => {
    if (args.exceptUserId && m.user_id === args.exceptUserId) return false;
    const held = rolesFor(m.id, m.role);
    if (!args.roles.some((r) => held.has(r))) return false;
    if (!groupIds.length) return true;
    // Compartment scoping only narrows cooks; pickup always hears about a
    // ticket because pickup is responsible for every compartment.
    if (!held.has("kitchen") || held.has("pickup") || held.has("owner")) return true;
    return !m.group_id || groupIds.includes(m.group_id);
  });
  if (!targets.length) return;

  await supabaseAdmin.from("notifications").insert(
    targets.map((m) => ({
      user_id: m.user_id,
      store_id: args.storeId,
      type: args.type,
      payload: (args.payload ?? {}) as never,
      target_url: args.targetUrl ?? "/dashboard",
    })),
  );
}

/** Sends a notification to one specific person (role decisions, replies…). */
export async function notifyUser(args: {
  userId: string;
  storeId: string;
  type: string;
  payload?: Record<string, string | number | boolean | null>;
  targetUrl?: string;
}) {
  await supabaseAdmin.from("notifications").insert({
    user_id: args.userId,
    store_id: args.storeId,
    type: args.type,
    payload: (args.payload ?? {}) as never,
    target_url: args.targetUrl ?? "/dashboard",
  });
}

/** Compartments responsible for the products inside an order. */
export async function compartmentsForOrder(orderId: string) {
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  const ids = (items ?? []).map((i) => i.product_id).filter(Boolean) as string[];
  if (!ids.length) return [];
  const { data: links } = await supabaseAdmin
    .from("product_compartments")
    .select("group_id")
    .in("product_id", ids);
  return Array.from(new Set((links ?? []).map((l) => l.group_id)));
}

export async function listNotificationsImpl(ctx: AuthedCtx, data: { limit?: number }) {
  const { data: rows } = await ctx.supabase
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(data.limit ?? 30);
  return (rows ?? []) as unknown as NotificationRow[];
}

export async function markNotificationReadImpl(ctx: AuthedCtx, data: { id: string }) {
  await ctx.supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", data.id)
    .eq("user_id", ctx.userId);
  return { ok: true };
}

export async function markAllNotificationsReadImpl(ctx: AuthedCtx) {
  await requireMember(ctx);
  await ctx.supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", ctx.userId)
    .eq("read", false);
  return { ok: true };
}

export async function clearNotificationsImpl(ctx: AuthedCtx) {
  await ctx.supabase.from("notifications").delete().eq("user_id", ctx.userId).eq("read", true);
  return { ok: true };
}
