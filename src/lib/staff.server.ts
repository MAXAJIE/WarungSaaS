import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getMembership,
  logAction,
  randomCode,
  randomToken,
  requireCashier,
  requireMember,
  requireOwner,
  signPhoto,
  signPhotos,
  sortRoles,
  ASSIGNABLE_ROLES,
  type AuthedCtx,
  type StoreRole,
} from "./warung.server";
import { notifyStore, notifyUser } from "./notifications.server";

export type StaffRole = StoreRole;

export type RoleRequest = {
  id: string;
  store_id: string;
  user_id: string;
  member_id: string | null;
  from_role: string;
  requested_role: string;
  status: string;
  note: string;
  created_at: string;
};

export async function meImpl(ctx: AuthedCtx) {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("*")
    .eq("id", ctx.userId)
    .maybeSingle();
  const membership = await getMembership(ctx);
  let group: { id: string; name: string } | null = null;
  let roleRequest: RoleRequest | null = null;
  if (membership) {
    if (membership.member.group_id) {
      const { data: g } = await ctx.supabase
        .from("kitchen_groups")
        .select("id,name")
        .eq("id", membership.member.group_id)
        .maybeSingle();
      group = g ?? null;
    }
    const { data: rr } = await ctx.supabase
      .from("role_requests")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    roleRequest = (rr as RoleRequest | null) ?? null;
  }
  return {
    profile: profile ?? { id: ctx.userId, display_name: "", preferred_lang: "en" },
    member: membership?.member ?? null,
    /** Every hat this person wears; the sidebar groups its links by these. */
    roles: membership?.roles ?? [],
    store: membership?.store ?? null,
    group,
    roleRequest,
  };
}

export async function updateProfileImpl(
  ctx: AuthedCtx,
  data: { display_name?: string; preferred_lang?: string },
) {
  await ctx.supabase
    .from("profiles")
    .upsert({ id: ctx.userId, ...data }, { onConflict: "id" });
  if (data.display_name) {
    await supabaseAdmin
      .from("store_members")
      .update({ display_name: data.display_name })
      .eq("user_id", ctx.userId);
  }
  return { ok: true };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createStoreImpl(
  ctx: AuthedCtx,
  data: { name: string; slug: string; tagline?: string },
) {
  const existing = await getMembership(ctx);
  if (existing) throw new Error("You already belong to a store.");
  const slug = slugify(data.slug || data.name);
  if (!slug) throw new Error("Please pick a valid store link.");

  const { data: dupe } = await supabaseAdmin
    .from("stores")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (dupe) {
    // A previous attempt may have created the store but failed before the
    // membership row landed. Recover that store instead of blocking the owner.
    if (dupe.owner_id === ctx.userId) {
      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("display_name")
        .eq("id", ctx.userId)
        .maybeSingle();
      await supabaseAdmin.from("store_members").upsert(
        {
          store_id: dupe.id,
          user_id: ctx.userId,
          role: "cashier",
          display_name: profile?.display_name ?? "Owner",
        },
        { onConflict: "user_id" },
      );
      return dupe;
    }
    throw new Error("That store link is already taken. Try another one.");
  }


  // Owner id is derived from the verified bearer token, never from request data.
  // The insert runs through the service-role client because the caller has no
  // store membership yet, so the members-only SELECT policy on `stores` would
  // otherwise hide the freshly created row from the `.select()` returning clause.
  const { data: store, error } = await supabaseAdmin
    .from("stores")
    .insert({
      owner_id: ctx.userId,
      name: data.name.trim(),
      slug,
      tagline: data.tagline ?? "",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();

  await supabaseAdmin.from("store_members").insert({
    store_id: store.id,
    user_id: ctx.userId,
    role: "cashier",
    display_name: profile?.display_name ?? "Owner",
  });

  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: profile?.display_name ?? "Owner",
    action: "store.created",
    detail: { name: store.name },
  });
  return store;
}

export async function updateStoreImpl(
  ctx: AuthedCtx,
  data: {
    name?: string;
    tagline?: string;
    gift_threshold?: number;
    avg_prep_minutes?: number;
    disclaimer?: string;
    is_open?: boolean;
    /** Pickup-number template, e.g. "{STALL}-{SEQ}". */
    order_code_template?: string;
    /** Spend that unlocks the counter's event discount. 0 disables it. */
    event_spend?: number;
  },
) {
  const { store, member } = await requireOwner(ctx);
  if (data.order_code_template !== undefined)
    data.order_code_template = normaliseOrderTemplate(data.order_code_template);
  const { data: updated, error } = await supabaseAdmin
    .from("stores")
    .update(data as never)
    .eq("id", store.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "store.updated",
    detail: data,
  });
  return updated;
}

/** Tokens the owner may use when composing a pickup number. */
export const ORDER_CODE_TOKENS = ["{STALL}", "{DATE}", "{TIME}", "{SEQ}"] as const;

/**
 * A pickup number must stay short enough to shout across a counter: two or
 * three compartments, and the running sequence is mandatory so no two tickets
 * ever collide.
 */
export function normaliseOrderTemplate(raw: string) {
  const template = raw.trim().toUpperCase();
  if (!template) throw new Error("Give your order numbers a format.");
  const parts = template.split("-").filter(Boolean);
  if (parts.length < 2 || parts.length > 3)
    throw new Error("Use between 2 and 3 parts, separated by dashes.");
  const unknown = template
    .match(/\{[A-Z]+\}/g)
    ?.filter((t) => !ORDER_CODE_TOKENS.includes(t as (typeof ORDER_CODE_TOKENS)[number]));
  if (unknown?.length) throw new Error(`Unknown tag ${unknown[0]}.`);
  if (!template.includes("{SEQ}")) throw new Error("Include {SEQ} so every number is unique.");
  return template;
}

export async function listPeopleImpl(ctx: AuthedCtx) {
  const { store, roles } = await requireMember(ctx);
  const { data: members } = await ctx.supabase
    .from("store_members")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at");
  type Invite = {
    id: string;
    code: string;
    role: StaffRole;
    expires_at: string;
    created_at: string;
  };
  let invites: Invite[] = [];
  if (roles.includes("owner")) {
    const { data } = await ctx.supabase
      .from("store_invites")
      .select("*")
      .eq("store_id", store.id)
      .is("used_by", null)
      .order("created_at", { ascending: false });
    invites = (data ?? []) as Invite[];
  }
  const { data: groups } = await ctx.supabase
    .from("kitchen_groups")
    .select("*")
    .eq("store_id", store.id)
    .order("sort_order")
    .order("created_at");
  const { data: requests } = await ctx.supabase
    .from("role_requests")
    .select("*")
    .eq("store_id", store.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const { data: extraRoles } = await ctx.supabase
    .from("member_roles")
    .select("member_id,role")
    .eq("store_id", store.id);
  const withRoles = (members ?? []).map((m) => ({
    ...m,
    roles: sortRoles([
      ...((extraRoles ?? [])
        .filter((r) => r.member_id === m.id)
        .map((r) => r.role) as StoreRole[]),
      m.role as StoreRole,
    ]),
  }));
  return {
    members: withRoles,
    invites,
    groups: groups ?? [],
    requests: (requests ?? []) as RoleRequest[],
    ownerId: store.owner_id,
    myRoles: roles,
    assignableRoles: ASSIGNABLE_ROLES,
  };
}

export async function createInviteImpl(ctx: AuthedCtx, data: { role: StaffRole }) {
  const { store, member } = await requireOwner(ctx);
  const code = `${data.role.slice(0, 3).toUpperCase()}-${randomCode(6)}`;
  const { data: invite, error } = await ctx.supabase
    .from("store_invites")
    .insert({ store_id: store.id, code, role: data.role, created_by: ctx.userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "invite.created",
    detail: { role: data.role },
  });
  return invite;
}

export async function revokeInviteImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store } = await requireOwner(ctx);
  await ctx.supabase.from("store_invites").delete().eq("id", data.id).eq("store_id", store.id);
  return { ok: true };
}

export async function kickMemberImpl(ctx: AuthedCtx, data: { memberId: string }) {
  const { store, member } = await requireOwner(ctx);
  const { data: target } = await ctx.supabase
    .from("store_members")
    .select("*")
    .eq("id", data.memberId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!target) throw new Error("Person not found in your store.");
  if (target.user_id === store.owner_id) throw new Error("The owner cannot be removed.");
  const { error } = await ctx.supabase.from("store_members").delete().eq("id", data.memberId);
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "member.removed",
    detail: { person: target.display_name, role: target.role },
  });
  return { ok: true };
}

/** Reads an invite without consuming it, so the UI can show the role picker. */
export async function peekInviteImpl(_ctx: AuthedCtx, data: { code: string }) {
  const code = data.code.trim().toUpperCase();
  const { data: invite } = await supabaseAdmin
    .from("store_invites")
    .select("id,role,store_id,expires_at")
    .eq("code", code)
    .is("used_by", null)
    .maybeSingle();
  if (!invite) throw new Error("Invalid or already used invite code.");
  if (new Date(invite.expires_at).getTime() < Date.now())
    throw new Error("This invite code has expired.");
  const { data: store } = await supabaseAdmin
    .from("stores")
    .select("name,slug")
    .eq("id", invite.store_id)
    .maybeSingle();
  return { code, role: invite.role as StaffRole, storeName: store?.name ?? "", slug: store?.slug ?? "" };
}

export async function joinWithInviteImpl(ctx: AuthedCtx, data: { code: string; role?: StaffRole }) {
  const existing = await getMembership(ctx);
  if (existing) throw new Error("You already belong to a store.");
  const code = data.code.trim().toUpperCase();

  const { data: invite } = await supabaseAdmin
    .from("store_invites")
    .select("*")
    .eq("code", code)
    .is("used_by", null)
    .maybeSingle();
  if (!invite) throw new Error("Invalid or already used invite code.");
  if (new Date(invite.expires_at).getTime() < Date.now())
    throw new Error("This invite code has expired.");
  // The owner decides the role; the picker only confirms it.
  if (data.role && data.role !== invite.role)
    throw new Error("That role is not the one your owner invited you for.");

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("store_members").insert({
    store_id: invite.store_id,
    user_id: ctx.userId,
    role: invite.role,
    display_name: profile?.display_name ?? "Staff",
  });
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("store_invites")
    .update({ used_by: ctx.userId, used_at: new Date().toISOString() })
    .eq("id", invite.id);
  await logAction({
    storeId: invite.store_id,
    actorId: ctx.userId,
    actorLabel: profile?.display_name ?? "Staff",
    action: "member.joined",
    detail: { role: invite.role },
  });
  await notifyStore({
    storeId: invite.store_id,
    roles: ["cashier"],
    type: "member.joined",
    payload: { who: profile?.display_name ?? "Staff", role: invite.role },
    targetUrl: "/people",
    exceptUserId: ctx.userId,
  });
  return { ok: true, role: invite.role };
}

/* ---------------- products ---------------- */

export async function listProductsImpl(ctx: AuthedCtx) {
  const { store } = await requireMember(ctx);
  const [{ data }, { data: combo }, { data: links }] = await Promise.all([
    ctx.supabase
      .from("products")
      .select("*")
      .eq("store_id", store.id)
      .order("sort_order")
      .order("created_at"),
    ctx.supabase.from("combo_items").select("combo_id,product_id,qty"),
    ctx.supabase.from("product_compartments").select("product_id,group_id"),
  ]);
  const rows = await signPhotos(data ?? []);
  return rows.map((r) => ({
    ...r,
    combo_items: (combo ?? []).filter((c) => c.combo_id === (r as { id: string }).id),
    // A product can be prepared by several compartments at once.
    group_ids: (links ?? [])
      .filter((l) => l.product_id === (r as { id: string }).id)
      .map((l) => l.group_id),
  }));
}

export type ComboItemInput = { product_id: string; qty: number };

export type ProductInput = {
  id?: string;
  name: string;
  name_zh?: string;
  name_ms?: string;
  description?: string;
  category?: string;
  cost_price: number;
  sell_price: number;
  photo_url?: string | null;
  is_available?: boolean;
  sort_order?: number;
  group_id?: string | null;
  /** Every compartment responsible for preparing this item. */
  group_ids?: string[];
  is_combo?: boolean;
  combo_items?: ComboItemInput[];
  /** Lifetime inventory the owner has stocked. null = untracked. */
  stock_total?: number | null;
};

export async function upsertProductImpl(ctx: AuthedCtx, data: ProductInput) {
  const { store, member } = await requireOwner(ctx);
  const { combo_items: comboItems, group_ids: groupIds, ...rest } = data;
  // The legacy single column keeps the first compartment so older reads still work.
  const payload = {
    ...rest,
    group_id: groupIds ? (groupIds[0] ?? null) : (rest.group_id ?? null),
    store_id: store.id,
  };
  const { data: saved, error } = data.id
    ? await ctx.supabase
        .from("products")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", store.id)
        .select("*")
        .single()
    : await ctx.supabase.from("products").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  if (groupIds && saved) {
    await ctx.supabase.from("product_compartments").delete().eq("product_id", saved.id);
    const rows = Array.from(new Set(groupIds.filter(Boolean))).map((group_id) => ({
      product_id: saved.id,
      group_id,
    }));
    if (rows.length) {
      const { error: pcError } = await ctx.supabase.from("product_compartments").insert(rows);
      if (pcError) throw new Error(pcError.message);
    }
  }
  if (data.is_combo && comboItems && saved) {
    await ctx.supabase.from("combo_items").delete().eq("combo_id", saved.id);
    const rows = comboItems
      .filter((c) => c.product_id && c.product_id !== saved.id && c.qty > 0)
      .map((c) => ({ combo_id: saved.id, product_id: c.product_id, qty: c.qty }));
    if (rows.length) {
      const { error: ciError } = await ctx.supabase.from("combo_items").insert(rows);
      if (ciError) throw new Error(ciError.message);
    }
  }
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: data.id ? "product.updated" : "product.created",
    detail: { name: data.name },
  });
  return saved;
}

export async function reorderProductsImpl(ctx: AuthedCtx, data: { ids: string[] }) {
  const { store } = await requireOwner(ctx);
  await Promise.all(
    data.ids.map((id, index) =>
      ctx.supabase
        .from("products")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("store_id", store.id),
    ),
  );
  return { ok: true };
}

/* ---------------- kitchen groups ---------------- */

export async function listGroupsImpl(ctx: AuthedCtx) {
  const { store } = await requireMember(ctx);
  const { data } = await ctx.supabase
    .from("kitchen_groups")
    .select("*")
    .eq("store_id", store.id)
    .order("sort_order")
    .order("created_at");
  return data ?? [];
}

export async function upsertGroupImpl(
  ctx: AuthedCtx,
  data: { id?: string; name: string; color?: string | null; sort_order?: number },
) {
  const { store, member } = await requireOwner(ctx);
  const payload = { ...data, name: data.name.trim(), store_id: store.id };
  const { data: saved, error } = data.id
    ? await ctx.supabase
        .from("kitchen_groups")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", store.id)
        .select("*")
        .single()
    : await ctx.supabase.from("kitchen_groups").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: data.id ? "group.updated" : "group.created",
    detail: { name: payload.name },
  });
  return saved;
}

export async function deleteGroupImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store } = await requireOwner(ctx);
  await ctx.supabase.from("kitchen_groups").delete().eq("id", data.id).eq("store_id", store.id);
  return { ok: true };
}

export async function setMemberGroupImpl(
  ctx: AuthedCtx,
  data: { memberId: string; group_id: string | null },
) {
  const { store, member } = await requireCashier(ctx);
  // Row-level security lets a member edit only their own row, so moving
  // somebody else between compartments runs through the admin client after the
  // caller has been checked and the target confirmed to be in the same store.
  const { data: target } = await supabaseAdmin
    .from("store_members")
    .select("id,store_id")
    .eq("id", data.memberId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!target) throw new Error("Person not found in your store.");
  if (data.group_id) {
    const { data: group } = await supabaseAdmin
      .from("kitchen_groups")
      .select("id")
      .eq("id", data.group_id)
      .eq("store_id", store.id)
      .maybeSingle();
    if (!group) throw new Error("That compartment does not exist.");
  }
  const { error } = await supabaseAdmin
    .from("store_members")
    .update({ group_id: data.group_id })
    .eq("id", data.memberId)
    .eq("store_id", store.id);
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "member.group_set",
    detail: { memberId: data.memberId, group_id: data.group_id },
  });
  return { ok: true };
}


/**
 * The owner is the only person who can hand out hats, and everyone except the
 * owner wears exactly one. Pickup duty always rides along with the owner set so
 * a handover never gets stuck.
 */
export async function setMemberRolesImpl(
  ctx: AuthedCtx,
  data: { memberId: string; roles: StoreRole[] },
) {
  const { store, member } = await requireOwner(ctx);
  const { data: target } = await ctx.supabase
    .from("store_members")
    .select("*")
    .eq("id", data.memberId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!target) throw new Error("Person not found in your store.");

  let roles = sortRoles(data.roles.filter((r) => ASSIGNABLE_ROLES.includes(r)));
  if (!roles.length) throw new Error("Pick at least one role.");
  if (target.user_id === store.owner_id && !roles.includes("owner")) roles = sortRoles(["owner", ...roles]);
  // Only the owner may wear several hats at once.
  if (!roles.includes("owner") && roles.length > 1)
    throw new Error("Only the owner can hold more than one role.");

  const primary = roles[0]!;
  const { error } = await ctx.supabase
    .from("store_members")
    .update({ role: primary })
    .eq("id", data.memberId)
    .eq("store_id", store.id);
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("member_roles").delete().eq("member_id", data.memberId);
  const extra = roles.slice(1).map((role) => ({
    store_id: store.id,
    member_id: data.memberId,
    user_id: target.user_id,
    role,
  }));
  if (extra.length) {
    const { error: mrError } = await supabaseAdmin.from("member_roles").insert(extra as never);
    if (mrError) throw new Error(mrError.message);
  }

  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    actorRole: "owner",
    action: "member.roles_set",
    detail: { person: target.display_name, roles },
  });
  return { ok: true, roles };
}

/* ---------------- product customisations ---------------- */

export type ProductOptionInput = {
  id?: string;
  product_id: string;
  name: string;
  is_required?: boolean;
  max_select?: number;
  sort_order?: number;
  values: Array<{ id?: string; label: string; price_delta: number; sort_order?: number }>;
};

export async function listProductOptionsImpl(ctx: AuthedCtx, data: { product_id: string }) {
  const { store } = await requireMember(ctx);
  const { data: options } = await ctx.supabase
    .from("product_options")
    .select("*")
    .eq("store_id", store.id)
    .eq("product_id", data.product_id)
    .order("sort_order");
  const ids = (options ?? []).map((o) => o.id);
  const { data: values } = ids.length
    ? await ctx.supabase
        .from("product_option_values")
        .select("*")
        .in("option_id", ids)
        .order("sort_order")
    : { data: [] };
  return (options ?? []).map((o) => ({
    ...o,
    values: (values ?? []).filter((v) => v.option_id === o.id),
  }));
}

export async function upsertProductOptionImpl(ctx: AuthedCtx, data: ProductOptionInput) {
  const { store, member } = await requireOwner(ctx);
  const payload = {
    store_id: store.id,
    product_id: data.product_id,
    name: data.name.trim(),
    is_required: data.is_required ?? false,
    max_select: Math.max(1, Math.round(data.max_select ?? 1)),
    sort_order: data.sort_order ?? 0,
  };
  const { data: saved, error } = data.id
    ? await ctx.supabase
        .from("product_options")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", store.id)
        .select("*")
        .single()
    : await ctx.supabase.from("product_options").insert(payload).select("*").single();
  if (error) throw new Error(error.message);

  await ctx.supabase.from("product_option_values").delete().eq("option_id", saved.id);
  const rows = data.values
    .filter((v) => v.label.trim())
    .map((v, index) => ({
      option_id: saved.id,
      label: v.label.trim(),
      price_delta: Number(v.price_delta) || 0,
      sort_order: v.sort_order ?? index,
    }));
  if (rows.length) {
    const { error: vError } = await ctx.supabase.from("product_option_values").insert(rows);
    if (vError) throw new Error(vError.message);
  }
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    actorRole: "owner",
    action: data.id ? "product_option.updated" : "product_option.created",
    detail: { name: payload.name },
  });
  return saved;
}

export async function deleteProductOptionImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store } = await requireOwner(ctx);
  await ctx.supabase.from("product_options").delete().eq("id", data.id).eq("store_id", store.id);
  return { ok: true };
}

export async function deleteProductImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store, member } = await requireOwner(ctx);
  await ctx.supabase.from("products").delete().eq("id", data.id).eq("store_id", store.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "product.deleted",
    detail: { id: data.id },
  });
  return { ok: true };
}

/** Stores a product photo in the public bucket and returns its storage path. */
export async function uploadProductPhotoImpl(
  ctx: AuthedCtx,
  data: { base64: string; ext?: string },
) {
  const { store } = await requireOwner(ctx);
  const raw = data.base64.includes(",") ? data.base64.split(",")[1]! : data.base64;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
  const ext = (data.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${store.id}/${randomToken()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("product-photos")
    .upload(path, bytes, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: false });
  if (error) throw new Error(error.message);
  return { path, signedUrl: await signPhoto(path) };
}

/* ---------------- vouchers & gifts ---------------- */

export async function listPromosImpl(ctx: AuthedCtx) {
  const { store } = await requireMember(ctx);
  const [{ data: vouchers }, { data: gifts }] = await Promise.all([
    ctx.supabase
      .from("vouchers")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false }),
    ctx.supabase
      .from("gifts")
      .select("*")
      .eq("store_id", store.id)
      .order("threshold"),
  ]);
  return { vouchers: vouchers ?? [], gifts: gifts ?? [], store };
}

export async function upsertVoucherImpl(
  ctx: AuthedCtx,
  data: {
    id?: string;
    code: string;
    label?: string;
    kind: "percent" | "fixed";
    value: number;
    min_spend?: number;
    is_active?: boolean;
  },
) {
  const { store, member } = await requireOwner(ctx);
  const payload = { ...data, code: data.code.trim().toUpperCase(), store_id: store.id };
  const { data: saved, error } = data.id
    ? await ctx.supabase
        .from("vouchers")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", store.id)
        .select("*")
        .single()
    : await ctx.supabase.from("vouchers").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: data.id ? "voucher.updated" : "voucher.created",
    detail: { code: payload.code },
  });
  return saved;
}

export async function deleteVoucherImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store } = await requireOwner(ctx);
  await ctx.supabase.from("vouchers").delete().eq("id", data.id).eq("store_id", store.id);
  return { ok: true };
}

export async function upsertGiftImpl(
  ctx: AuthedCtx,
  data: {
    id?: string;
    name: string;
    note?: string;
    threshold: number;
    stock?: number;
    is_active?: boolean;
  },
) {
  const { store, member } = await requireOwner(ctx);
  const payload = { ...data, store_id: store.id };
  const { data: saved, error } = data.id
    ? await ctx.supabase
        .from("gifts")
        .update(payload)
        .eq("id", data.id)
        .eq("store_id", store.id)
        .select("*")
        .single()
    : await ctx.supabase.from("gifts").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: data.id ? "gift.updated" : "gift.created",
    detail: { name: data.name },
  });
  return saved;
}

export async function deleteGiftImpl(ctx: AuthedCtx, data: { id: string }) {
  const { store } = await requireOwner(ctx);
  await ctx.supabase.from("gifts").delete().eq("id", data.id).eq("store_id", store.id);
  return { ok: true };
}

/**
 * Everyone can read the shop's history, but the default view is your own
 * trail. Only the owner may widen it to the whole team.
 */
export async function listLogsImpl(
  ctx: AuthedCtx,
  data: { limit?: number; scope?: "mine" | "all"; role?: StoreRole | "all" },
) {
  const { store, roles } = await requireMember(ctx);
  const isOwner = roles.includes("owner");
  const scope = isOwner ? (data.scope ?? "all") : "mine";
  let query = ctx.supabase
    .from("activity_logs")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(500, data.limit ?? 100));
  if (scope === "mine") query = query.eq("actor_id", ctx.userId);
  if (isOwner && data.role && data.role !== "all") query = query.eq("actor_role", data.role);
  const { data: logs } = await query;
  return { logs: logs ?? [], scope, canSeeEveryone: isOwner };
}


/* ---------------- role change requests ---------------- */

/** Staff cannot change their own role; they ask, the owner decides. */
export async function requestRoleChangeImpl(
  ctx: AuthedCtx,
  data: { requested_role: StaffRole; note?: string },
) {
  const { store, member } = await requireMember(ctx);
  if (member.role === data.requested_role) throw new Error("That is already your role.");
  if (member.user_id === store.owner_id) throw new Error("The owner already holds every permission.");
  const { data: pending } = await ctx.supabase
    .from("role_requests")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) throw new Error("You already have a request waiting for approval.");
  const { data: saved, error } = await ctx.supabase
    .from("role_requests")
    .insert({
      store_id: store.id,
      user_id: ctx.userId,
      member_id: member.id,
      from_role: member.role,
      requested_role: data.requested_role,
      note: (data.note ?? "").slice(0, 200),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: "role.requested",
    detail: { from: member.role, to: data.requested_role },
  });
  await notifyStore({
    storeId: store.id,
    roles: ["cashier"],
    type: "role.requested",
    payload: { who: member.display_name, to: data.requested_role },
    targetUrl: "/people",
    exceptUserId: ctx.userId,
  });
  return saved as RoleRequest;
}

export async function decideRoleRequestImpl(
  ctx: AuthedCtx,
  data: { id: string; approve: boolean },
) {
  const { store, member } = await requireCashier(ctx);
  const { data: req } = await ctx.supabase
    .from("role_requests")
    .select("*")
    .eq("id", data.id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  if (req.status !== "pending") throw new Error("This request was already decided.");

  if (data.approve) {
    const { error } = await ctx.supabase
      .from("store_members")
      .update({ role: req.requested_role as StaffRole })
      .eq("user_id", req.user_id)
      .eq("store_id", store.id);
    if (error) throw new Error(error.message);
  }
  await ctx.supabase
    .from("role_requests")
    .update({
      status: data.approve ? "approved" : "rejected",
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  await logAction({
    storeId: store.id,
    actorId: ctx.userId,
    actorLabel: member.display_name,
    action: data.approve ? "role.approved" : "role.rejected",
    detail: { to: req.requested_role },
  });
  await notifyUser({
    userId: req.user_id,
    storeId: store.id,
    type: data.approve ? "role.approved" : "role.rejected",
    payload: { to: req.requested_role },
    targetUrl: "/profile",
  });
  return { ok: true };
}
