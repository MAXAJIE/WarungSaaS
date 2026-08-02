import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMember, type AuthedCtx } from "./warung.server";

export type StaffRole = "cashier" | "kitchen" | "pickup";

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
  const { data: members } = await supabaseAdmin
    .from("store_members")
    .select("user_id, role, group_id")
    .eq("store_id", args.storeId)
    .in("role", args.roles);

  const groupIds = args.groupIds?.filter(Boolean) ?? [];
  const targets = (members ?? []).filter((m) => {
    if (args.exceptUserId && m.user_id === args.exceptUserId) return false;
    if (!groupIds.length) return true;
    if (m.role !== "kitchen") return true;
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
