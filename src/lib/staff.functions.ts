import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createInviteImpl,
  createStoreImpl,
  deleteGiftImpl,
  deleteGroupImpl,
  deleteProductImpl,
  deleteVoucherImpl,
  joinWithInviteImpl,
  kickMemberImpl,
  listGroupsImpl,
  listLogsImpl,
  listPeopleImpl,
  listProductsImpl,
  peekInviteImpl,
  listPromosImpl,
  meImpl,
  reorderProductsImpl,
  revokeInviteImpl,
  setMemberGroupImpl,
  requestRoleChangeImpl,
  decideRoleRequestImpl,
  updateProfileImpl,
  updateStoreImpl,
  upsertGiftImpl,
  upsertGroupImpl,
  uploadProductPhotoImpl,
  upsertProductImpl,
  upsertVoucherImpl,
  type ProductInput,
  type StaffRole,
} from "./staff.server";


export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => meImpl(context));

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { display_name?: string; preferred_lang?: string }) => d)
  .handler(async ({ context, data }) => updateProfileImpl(context, data));

export const createStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; slug: string; tagline?: string }) => d)
  .handler(async ({ context, data }) => createStoreImpl(context, data));

export const updateStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      name?: string;
      tagline?: string;
      gift_threshold?: number;
      avg_prep_minutes?: number;
      disclaimer?: string;
      is_open?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => updateStoreImpl(context, data));

export const listPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listPeopleImpl(context));

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { role: StaffRole }) => d)
  .handler(async ({ context, data }) => createInviteImpl(context, data));

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => revokeInviteImpl(context, data));

export const kickMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string }) => d)
  .handler(async ({ context, data }) => kickMemberImpl(context, data));

export const peekInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ context, data }) => peekInviteImpl(context, data));

export const joinWithInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; role?: StaffRole }) => d)
  .handler(async ({ context, data }) => joinWithInviteImpl(context, data));

export const uploadProductPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { base64: string; ext?: string }) => d)
  .handler(async ({ context, data }) => uploadProductPhotoImpl(context, data));

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listProductsImpl(context));

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ProductInput) => d)
  .handler(async ({ context, data }) => upsertProductImpl(context, data));

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => deleteProductImpl(context, data));

export const listPromos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listPromosImpl(context));

export const upsertVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      code: string;
      label?: string;
      kind: "percent" | "fixed";
      value: number;
      min_spend?: number;
      is_active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => upsertVoucherImpl(context, data));

export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => deleteVoucherImpl(context, data));

export const upsertGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      note?: string;
      threshold: number;
      stock?: number;
      is_active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => upsertGiftImpl(context, data));

export const deleteGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => deleteGiftImpl(context, data));

export const listLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => d)
  .handler(async ({ context, data }) => listLogsImpl(context, data));

export const reorderProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => d)
  .handler(async ({ context, data }) => reorderProductsImpl(context, data));

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listGroupsImpl(context));

export const upsertGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; color?: string | null; sort_order?: number }) => d)
  .handler(async ({ context, data }) => upsertGroupImpl(context, data));

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => deleteGroupImpl(context, data));

export const setMemberGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; group_id: string | null }) => d)
  .handler(async ({ context, data }) => setMemberGroupImpl(context, data));


export const requestRoleChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requested_role: StaffRole; note?: string }) => d)
  .handler(async ({ context, data }) => requestRoleChangeImpl(context, data));

export const decideRoleRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => d)
  .handler(async ({ context, data }) => decideRoleRequestImpl(context, data));
