import { createServerFn } from "@tanstack/react-start";
import {
  cancelGuestOrderImpl,
  getGuestOrderImpl,
  getMenuImpl,
  listStoresImpl,
  saveCartImpl,
  submitOrderImpl,
  confirmReceiptImpl,
  type CartItemInput,
} from "./customer.server";

export const listStores = createServerFn({ method: "GET" }).handler(async () => listStoresImpl());

export const getMenu = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => getMenuImpl(data));

export const saveCart = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { slug: string; guestToken?: string | null; note?: string; items: CartItemInput[] }) => d,
  )
  .handler(async ({ data }) => saveCartImpl(data));

export const submitOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { guestToken: string }) => d)
  .handler(async ({ data }) => submitOrderImpl(data));

export const getGuestOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { guestToken: string }) => d)
  .handler(async ({ data }) => getGuestOrderImpl(data));

export const cancelGuestOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { guestToken: string }) => d)
  .handler(async ({ data }) => cancelGuestOrderImpl(data));

export const confirmReceipt = createServerFn({ method: "POST" })
  .inputValidator((d: { guestToken: string }) => d)
  .handler(async ({ data }) => confirmReceiptImpl(data));
