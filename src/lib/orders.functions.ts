import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  advanceOrderImpl,
  amendOrderItemsImpl,
  applyVoucherImpl,
  approveOrderImpl,
  cancelOrderImpl,
  createWalkInImpl,
  findOrderByCodeImpl,
  listOrdersImpl,
  orderBlockersImpl,
  removeVoucherImpl,
  setGiftImpl,
  setSpecialDiscountImpl,
  type CounterItemInput,
} from "./orders.server";
import { analyticsImpl } from "./analytics.server";

export const removeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; voucherId: string }) => d)
  .handler(async ({ context, data }) => removeVoucherImpl(context, data));

export const getOrderBlockers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ context, data }) => orderBlockersImpl(context, data));

export const amendOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { orderId: string; add?: CounterItemInput[]; removeItemIds?: string[]; note?: string }) =>
      d,
  )
  .handler(async ({ context, data }) => amendOrderItemsImpl(context, data));

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listOrdersImpl(context));

export const createWalkInOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_name: string; note?: string; items: CounterItemInput[] }) => d)
  .handler(async ({ context, data }) => createWalkInImpl(context, data));

export const findOrderByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ context, data }) => findOrderByCodeImpl(context, data));

export const applyVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; code: string }) => d)
  .handler(async ({ context, data }) => applyVoucherImpl(context, data));

export const setOrderGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; giftId: string | null }) => d)
  .handler(async ({ context, data }) => setGiftImpl(context, data));

export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ context, data }) => approveOrderImpl(context, data));

export const advanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { orderId: string; action: "start" | "kitchen_done" | "receive" | "complete" }) => d,
  )
  .handler(async ({ context, data }) => advanceOrderImpl(context, data));

export const setSpecialDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; amount: number; reason: string }) => d)
  .handler(async ({ context, data }) => setSpecialDiscountImpl(context, data));

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; reason?: string }) => d)
  .handler(async ({ context, data }) => cancelOrderImpl(context, data));

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days: number }) => d)
  .handler(async ({ context, data }) => analyticsImpl(context, data));
