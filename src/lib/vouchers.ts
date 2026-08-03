/**
 * Shared voucher engine.
 *
 * Pure functions only: the same maths runs on the counter screen (preview) and
 * inside the server functions (source of truth), so a cashier never sees a
 * different total from the one that gets charged.
 */

export type VoucherReward =
  "order_percent" | "order_fixed" | "nth_item_percent" | "buy_x_get_y" | "item_percent";

/** The slice of a voucher row the maths needs. */
export type VoucherRule = {
  id: string;
  code: string;
  label: string;
  reward: VoucherReward;
  /** Percent (0-100) for percent rewards, currency amount for fixed ones. */
  value: number;
  /** Product the reward is tied to, for item / BOGO rewards. */
  reward_product_id: string | null;
  /** Which repeat of a product is discounted, e.g. 2 = "second cup". */
  nth_item: number;
  buy_qty: number;
  get_qty: number;
  stackable: boolean;
  /** 0 = uncapped. */
  max_discount: number;
  min_spend: number;
  min_items: number;
  required_product_id: string | null;
  required_qty: number;
  usage_limit: number;
  used_count: number;
  is_active: boolean;
  terms: string;
};

export type OrderLine = {
  product_id: string | null;
  qty: number;
  unit_price: number;
};

export type Blocker =
  | { kind: "inactive" }
  | { kind: "exhausted" }
  | { kind: "min_spend"; need: number; have: number }
  | { kind: "min_items"; need: number; have: number }
  | { kind: "required_product"; productId: string; need: number; have: number }
  | { kind: "no_matching_item"; productId: string | null };

const money = (n: number) => Math.round(n * 100) / 100;

function unitsOf(lines: OrderLine[], productId: string | null): number {
  if (!productId) return lines.reduce((s, l) => s + l.qty, 0);
  return lines.filter((l) => l.product_id === productId).reduce((s, l) => s + l.qty, 0);
}

/** Cheapest-first unit prices for the product the reward targets. */
function unitPrices(lines: OrderLine[], productId: string | null): number[] {
  const out: number[] = [];
  for (const l of lines) {
    if (productId && l.product_id !== productId) continue;
    for (let i = 0; i < l.qty; i++) out.push(l.unit_price);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Everything about the voucher that is not satisfied yet. An empty array means
 * the code may be redeemed as-is.
 */
export function voucherBlockers(v: VoucherRule, lines: OrderLine[]): Blocker[] {
  const out: Blocker[] = [];
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  if (!v.is_active) out.push({ kind: "inactive" });
  // Vouchers never expire: a code is only ever held back by its own terms,
  // its usage cap, or being switched off.
  if (v.usage_limit > 0 && v.used_count >= v.usage_limit) out.push({ kind: "exhausted" });
  if (v.min_spend > 0 && subtotal < v.min_spend)
    out.push({ kind: "min_spend", need: v.min_spend, have: money(subtotal) });
  if (v.min_items > 0 && itemCount < v.min_items)
    out.push({ kind: "min_items", need: v.min_items, have: itemCount });
  if (v.required_product_id) {
    const have = unitsOf(lines, v.required_product_id);
    const need = Math.max(1, v.required_qty);
    if (have < need)
      out.push({ kind: "required_product", productId: v.required_product_id, need, have });
  }

  if (v.reward === "nth_item_percent" || v.reward === "item_percent") {
    if (!unitPrices(lines, v.reward_product_id).length)
      out.push({ kind: "no_matching_item", productId: v.reward_product_id });
  }
  if (v.reward === "buy_x_get_y") {
    const have = unitsOf(lines, v.reward_product_id);
    const need = Math.max(1, v.buy_qty) + Math.max(1, v.get_qty);
    if (have < need) out.push({ kind: "no_matching_item", productId: v.reward_product_id });
  }
  return out;
}

/** Currency taken off the ticket by one voucher, ignoring its own terms. */
export function voucherDiscount(v: VoucherRule, lines: OrderLine[]): number {
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
  let discount = 0;

  switch (v.reward) {
    case "order_percent":
      discount = (subtotal * v.value) / 100;
      break;
    case "order_fixed":
      discount = Math.min(subtotal, v.value);
      break;
    case "item_percent": {
      const prices = unitPrices(lines, v.reward_product_id);
      // Applies to every matching unit, e.g. "20% off all iced coffee".
      discount = prices.reduce((s, p) => s + (p * v.value) / 100, 0);
      break;
    }
    case "nth_item_percent": {
      const prices = unitPrices(lines, v.reward_product_id);
      const step = Math.max(2, v.nth_item);
      // Every Nth unit is discounted: the 2nd, 4th, ... cup at value% off.
      let sum = 0;
      for (let i = step - 1; i < prices.length; i += step) sum += (prices[i]! * v.value) / 100;
      discount = sum;
      break;
    }
    case "buy_x_get_y": {
      const prices = unitPrices(lines, v.reward_product_id);
      const buy = Math.max(1, v.buy_qty);
      const get = Math.max(1, v.get_qty);
      const bundles = Math.floor(prices.length / (buy + get));
      // The free units are the cheapest ones, which is the fair reading.
      let sum = 0;
      for (let i = 0; i < bundles * get && i < prices.length; i++) sum += prices[i]!;
      discount = sum;
      break;
    }
  }

  if (v.max_discount > 0) discount = Math.min(discount, v.max_discount);
  return money(Math.max(0, Math.min(subtotal, discount)));
}

/**
 * Total discount for a stack of vouchers. Non-stackable codes never combine:
 * the single best one wins.
 */
export function stackDiscount(
  vouchers: VoucherRule[],
  lines: OrderLine[],
): { total: number; perVoucher: Array<{ id: string; amount: number }> } {
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const priced = vouchers.map((v) => ({ id: v.id, amount: voucherDiscount(v, lines), v }));
  const stackables = priced.filter((p) => p.v.stackable);
  const exclusives = priced.filter((p) => !p.v.stackable);

  let chosen = stackables;
  if (exclusives.length) {
    const best = exclusives.reduce((a, b) => (b.amount > a.amount ? b : a));
    chosen = [...stackables, best];
  }
  const total = money(
    Math.min(
      subtotal,
      chosen.reduce((s, p) => s + p.amount, 0),
    ),
  );
  return { total, perVoucher: chosen.map((p) => ({ id: p.id, amount: p.amount })) };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Readable, ambiguity-free code such as `RAYA-7KQF2M`. */
export function generateVoucherCode(prefix = "", len = 6): string {
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(len))
      : Uint8Array.from({ length: len }, () => Math.floor(Math.random() * 256));
  let body = "";
  for (let i = 0; i < len; i++) body += ALPHABET[bytes[i]! % ALPHABET.length];
  const clean = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return clean ? `${clean}-${body}` : body;
}

/** Human sentence for a reward, used on cards, print sheets and the counter. */
export function rewardSummary(
  row: {
    reward: VoucherReward | string;
    value: number | string;
    nth_item?: number | string | null;
    buy_qty?: number | string | null;
    get_qty?: number | string | null;
  },
  currency = "",
): string {
  // Numeric columns can arrive as strings from PostgREST, so normalise first.
  const v = {
    reward: row.reward as VoucherReward,
    value: Number(row.value) || 0,
    nth_item: Number(row.nth_item ?? 2) || 2,
    buy_qty: Number(row.buy_qty ?? 1) || 1,
    get_qty: Number(row.get_qty ?? 1) || 1,
  };
  switch (v.reward) {
    case "order_percent":
      return `${v.value}% off the order`;
    case "order_fixed":
      return `${currency}${v.value} off the order`;
    case "item_percent":
      return `${v.value}% off the item`;
    case "nth_item_percent":
      return `${v.value}% off every ${ordinal(Math.max(2, v.nth_item))} item`;
    case "buy_x_get_y":
      return `Buy ${Math.max(1, v.buy_qty)} get ${Math.max(1, v.get_qty)} free`;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
