/**
 * Voucher layout model.
 *
 * Every printable part of a voucher — the QR, the promo code text, the label,
 * the reward sentence, the terms line and the dark ticket strip — is one
 * element with its own on/off switch, centre position and size. Positions and
 * sizes are stored as 0..1 fractions of the card, so the same layout renders
 * identically at any export resolution.
 *
 * Pure module: no React, no canvas, no DOM. It is imported by the renderer,
 * the editor and the server, so it must stay dependency-free.
 */

export type VoucherElementId = "strip" | "qr" | "code" | "label" | "reward" | "terms" | "expiry";

/** Order used by the editor's element list and by the renderer (back to front). */
export const VOUCHER_ELEMENT_IDS: VoucherElementId[] = [
  "strip",
  "qr",
  "code",
  "label",
  "reward",
  "terms",
  "expiry",
];

export type VoucherElement = {
  /** Unticked elements are not drawn at all. */
  enabled: boolean;
  /** Centre of the element, as a 0..1 fraction of card width / height. */
  x: number;
  y: number;
  /**
   * `qr`    — width as a fraction of card width.
   * `strip` — band height as a fraction of card height.
   * text    — font size as a fraction of card height.
   */
  size: number;
};

export type VoucherLayout = {
  /**
   * Export size in px. **0 means "do not override"**: the artwork's own pixel
   * size is used, so uploaded images are never cropped or squashed. Setting
   * only one of the two derives the other from the artwork's aspect ratio.
   */
  width_px: number;
  height_px: number;
  elements: Record<VoucherElementId, VoucherElement>;
};

/** Fallback card size when there is no artwork to take the size from. */
export const VOUCHER_W = 1000;
export const VOUCHER_H = 560;

/** Size bounds per element kind, used by both the editor inputs and the renderer. */
export const ELEMENT_SIZE_RANGE: Record<VoucherElementId, { min: number; max: number }> = {
  strip: { min: 0.04, max: 1 },
  qr: { min: 0.03, max: 0.95 },
  code: { min: 0.01, max: 0.4 },
  label: { min: 0.01, max: 0.4 },
  reward: { min: 0.01, max: 0.4 },
  terms: { min: 0.01, max: 0.4 },
  expiry: { min: 0.01, max: 0.4 },
};

export const DEFAULT_LAYOUT: VoucherLayout = {
  width_px: 0,
  height_px: 0,
  elements: {
    strip: { enabled: true, x: 0.5, y: 0.87, size: 0.26 },
    qr: { enabled: true, x: 0.78, y: 0.5, size: 0.32 },
    code: { enabled: true, x: 0.28, y: 0.82, size: 0.072 },
    label: { enabled: true, x: 0.28, y: 0.9, size: 0.04 },
    reward: { enabled: true, x: 0.28, y: 0.955, size: 0.036 },
    terms: { enabled: false, x: 0.5, y: 0.07, size: 0.03 },
    expiry: { enabled: false, x: 0.85, y: 0.965, size: 0.028 },
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function num(raw: unknown, fallback: number): number {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function normalizeElement(id: VoucherElementId, raw: unknown): VoucherElement {
  const base = DEFAULT_LAYOUT.elements[id];
  const src = (raw ?? {}) as Partial<Record<keyof VoucherElement, unknown>>;
  const range = ELEMENT_SIZE_RANGE[id];
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : base.enabled,
    x: clamp(num(src.x, base.x), 0, 1),
    y: clamp(num(src.y, base.y), 0, 1),
    size: clamp(num(src.size, base.size), range.min, range.max),
  };
}

/**
 * Coerces anything stored in the `design` JSON column into a complete layout.
 * Missing keys fall back to the defaults, so rows written before this feature
 * existed still render, and a hand-edited JSON blob can never crash the canvas.
 */
export function normalizeLayout(raw: unknown): VoucherLayout {
  const src = (raw ?? {}) as Record<string, unknown>;
  const elements = {} as Record<VoucherElementId, VoucherElement>;
  const rawElements = (src["elements"] ?? {}) as Record<string, unknown>;
  for (const id of VOUCHER_ELEMENT_IDS) elements[id] = normalizeElement(id, rawElements[id]);

  // Legacy rows carry flat qr_x / qr_y / qr_size columns instead of a layout.
  if (!src["elements"]) {
    const qr = elements.qr;
    elements.qr = {
      ...qr,
      x: clamp(num(src["qr_x"], qr.x), 0, 1),
      y: clamp(num(src["qr_y"], qr.y), 0, 1),
      size: clamp(num(src["qr_size"], qr.size), ELEMENT_SIZE_RANGE.qr.min, ELEMENT_SIZE_RANGE.qr.max),
    };
  }

  return {
    // Negative values are meaningless; 0 stays 0 because 0 means "use artwork size".
    width_px: Math.max(0, Math.round(num(src["width_px"], 0))),
    height_px: Math.max(0, Math.round(num(src["height_px"], 0))),
    elements,
  };
}

/**
 * Final pixel size of the exported card.
 *
 * `0` on either axis means "take it from the artwork". When only one axis is
 * given, the other keeps the artwork's aspect ratio — which is why nothing is
 * ever cropped: the artwork defines the template, the boxes only override it.
 */
export function resolveCardSize(
  layout: VoucherLayout,
  natural?: { width: number; height: number } | null,
): { width: number; height: number } {
  const natW = natural && natural.width > 0 ? natural.width : VOUCHER_W;
  const natH = natural && natural.height > 0 ? natural.height : VOUCHER_H;
  const wantW = layout.width_px > 0;
  const wantH = layout.height_px > 0;

  let width: number;
  let height: number;
  if (wantW && wantH) {
    width = layout.width_px;
    height = layout.height_px;
  } else if (wantW) {
    width = layout.width_px;
    height = Math.round((layout.width_px * natH) / natW);
  } else if (wantH) {
    height = layout.height_px;
    width = Math.round((layout.height_px * natW) / natH);
  } else {
    width = natW;
    height = natH;
  }
  // Guard rails only: a 1 px or 20000 px canvas is a broken export, not a design.
  return {
    width: clamp(Math.round(width), 32, 8000),
    height: clamp(Math.round(height), 32, 8000),
  };
}
