/**
 * Pure canvas rendering for vouchers. Used both to preview a design while the
 * owner arranges the elements and to export PNGs for printing.
 *
 * No React here — just canvas + the `qrcode` package — so it can run from
 * plain click handlers without re-render churn.
 *
 * Every drawn part comes from the `VoucherLayout`: nothing is hardcoded, so
 * what the owner arranges in the editor is exactly what the PNG contains.
 */
import QRCode from "qrcode";
import {
  normalizeLayout,
  resolveCardSize,
  VOUCHER_H,
  VOUCHER_W,
  type VoucherElement,
  type VoucherLayout,
} from "@/lib/voucher-design";

export { VOUCHER_W, VOUCHER_H };

export type VoucherDesign = {
  artworkUrl?: string | null;
  /** Anything shaped like a layout; it is normalised before use. */
  layout: VoucherLayout | unknown;
};

export type VoucherRenderData = {
  code: string;
  label?: string | null;
  rewardText?: string;
  terms?: string | null;
  expiresAt?: string | null;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Deterministic warm colour from the code so every voucher without artwork still looks distinct. */
function fallbackHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/**
 * Resolves the artwork once so both its pixels and its natural size are
 * available: the natural size is what a `0` width/height box falls back to.
 */
async function loadArtwork(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawFallbackBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: string,
) {
  const hue = fallbackHue(seed);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsl(${hue} 70% 45%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360} 70% 35%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#fff";
  for (let i = -h; i < w; i += 46) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.lineTo(i + h - 18, h);
    ctx.lineTo(i - 18, 0);
    ctx.fill();
  }
  ctx.restore();
}

/** Centre-anchored text with a soft shadow so it stays legible over any artwork. */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  el: VoucherElement,
  w: number,
  h: number,
  weight: number,
) {
  const fontPx = Math.max(6, el.size * h);
  ctx.save();
  ctx.font = `${weight} ${fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = fontPx * 0.35;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, el.x * w, el.y * h, w * 0.96);
  ctx.restore();
}

/**
 * Renders one voucher into a freshly created canvas.
 *
 * Size comes from the layout: `0` on width/height means the artwork's own
 * pixel size is used verbatim, so uploads are never cropped.
 */
export async function renderVoucherCanvas(
  data: VoucherRenderData,
  design: VoucherDesign,
): Promise<HTMLCanvasElement> {
  const layout = normalizeLayout(design.layout);
  const art = await loadArtwork(design.artworkUrl);
  const natural = art ? { width: art.naturalWidth, height: art.naturalHeight } : null;
  const { width: w, height: h } = resolveCardSize(layout, natural);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (art) ctx.drawImage(art, 0, 0, w, h);
  else drawFallbackBackground(ctx, w, h, data.code);

  const el = layout.elements;

  // Ticket strip first: it is the backdrop the text elements sit on.
  if (el.strip.enabled) {
    const bandH = Math.max(1, el.strip.size * h);
    ctx.fillStyle = "rgba(15,15,20,0.62)";
    ctx.fillRect(0, el.strip.y * h - bandH / 2, w, bandH);
  }

  if (el.code.enabled && data.code) drawText(ctx, data.code, el.code, w, h, 700);
  if (el.label.enabled && data.label) drawText(ctx, data.label, el.label, w, h, 600);
  if (el.reward.enabled && data.rewardText) drawText(ctx, data.rewardText, el.reward, w, h, 500);
  if (el.terms.enabled && data.terms) drawText(ctx, data.terms, el.terms, w, h, 500);
  if (el.expiry.enabled && data.expiresAt) {
    drawText(
      ctx,
      `exp. ${new Date(data.expiresAt).toLocaleDateString()}`,
      el.expiry,
      w,
      h,
      500,
    );
  }

  if (el.qr.enabled) {
    const qrSize = Math.max(8, el.qr.size * w);
    const qrX = el.qr.x * w - qrSize / 2;
    const qrY = el.qr.y * h - qrSize / 2;
    const pad = qrSize * 0.08;
    ctx.fillStyle = "#fff";
    roundRect(ctx, qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2, qrSize * 0.06);
    ctx.fill();
    try {
      // Render the QR at least as dense as it will be drawn, so it stays crisp.
      const px = Math.min(2048, Math.max(256, Math.ceil(qrSize)));
      const qrDataUrl = await QRCode.toDataURL(data.code || "SAMPLE", { margin: 0, width: px });
      const qrImg = await loadImage(qrDataUrl);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch {
      // QR generation should never throw in practice; skip silently if it does.
    }
  }

  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Renders and downloads a single voucher as a PNG. */
export async function downloadVoucherPng(data: VoucherRenderData, design: VoucherDesign) {
  const canvas = await renderVoucherCanvas(data, design);
  const blob = await canvasToPngBlob(canvas);
  downloadBlob(blob, `voucher-${data.code}.png`);
}

/**
 * Renders a whole batch onto one printable sheet (3 columns, as many rows as
 * needed), so the owner can print a run of vouchers in one go. Every cell uses
 * the size the first card resolved to, which keeps the grid even.
 */
export async function downloadVoucherSheetPng(
  vouchers: VoucherRenderData[],
  design: VoucherDesign,
  filename = "voucher-batch.png",
) {
  if (!vouchers.length) return;
  const cols = 3;
  const gap = 40;
  const cells: HTMLCanvasElement[] = [];
  for (const v of vouchers) cells.push(await renderVoucherCanvas(v, design));

  const cellW = cells[0]!.width;
  const cellH = cells[0]!.height;
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const sheet = document.createElement("canvas");
  sheet.width = cols * cellW + gap * (cols + 1);
  sheet.height = rows * cellH + gap * (rows + 1);
  const ctx = sheet.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f4f4f2";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let i = 0; i < cells.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (cellW + gap);
    const y = gap + row * (cellH + gap);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 12;
    ctx.drawImage(cells[i]!, x, y, cellW, cellH);
    ctx.restore();
  }

  const blob = await canvasToPngBlob(sheet);
  downloadBlob(blob, filename);
}
