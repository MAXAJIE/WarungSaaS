/**
 * Pure canvas rendering for vouchers. Used both to preview a design while the
 * owner places the QR rectangle and to export PNGs for printing.
 *
 * No React here — just canvas + the `qrcode` package — so it can run from
 * plain click handlers without re-render churn.
 */
import QRCode from "qrcode";

export const VOUCHER_W = 1000;
export const VOUCHER_H = 560;

export type VoucherDesign = {
  artworkUrl?: string | null;
  qr_x: number;
  qr_y: number;
  qr_size: number;
  /** Voucher canvas size in px; defaults to VOUCHER_W x VOUCHER_H (1000x560). */
  width?: number;
  height?: number;
};

export type VoucherRenderData = {
  code: string;
  label?: string | null;
  rewardText?: string;
  terms?: string | null;
  expiresAt?: string | null;
  /**
   * Print the human-readable code on the ticket strip. Turn it off when the
   * artwork already carries the code, or when only the QR should be scannable.
   * The QR still encodes the code either way. Defaults to true.
   */
  showCode?: boolean;
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic warm colour from the code so every voucher without artwork still looks distinct. */
function fallbackHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

async function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: VoucherDesign,
  seed: string,
) {
  if (design.artworkUrl) {
    try {
      const img = await loadImage(design.artworkUrl);
      ctx.drawImage(img, 0, 0, w, h);
      return;
    } catch {
      // fall through to token fallback
    }
  }
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

/** Renders one voucher into a freshly created canvas at VOUCHER_W x VOUCHER_H. */
export async function renderVoucherCanvas(
  data: VoucherRenderData,
  design: VoucherDesign,
): Promise<HTMLCanvasElement> {
  const w = Math.max(100, Math.round(design.width ?? VOUCHER_W));
  const h = Math.max(60, Math.round(design.height ?? VOUCHER_H));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  await drawBackground(ctx, w, h, design, data.code);

  // Bottom ticket strip with code + reward, so it stays legible over any artwork.
  const stripH = h * 0.26;
  ctx.fillStyle = "rgba(15,15,20,0.62)";
  ctx.fillRect(0, h - stripH, w, stripH);

  const showCode = data.showCode !== false;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  if (showCode) {
    ctx.font = "700 40px sans-serif";
    ctx.fillText(data.code, 28, h - stripH / 2 - 14);
  }
  ctx.font = "500 20px sans-serif";
  ctx.globalAlpha = 0.9;
  const sub = [data.label, data.rewardText].filter(Boolean).join(" · ");
  // Without the code line the reward re-centres in the strip instead of
  // hanging off the bottom edge of an otherwise empty band.
  if (sub) ctx.fillText(sub, 28, h - stripH / 2 + (showCode ? 20 : 0));
  ctx.globalAlpha = 1;


  if (data.expiresAt) {
    ctx.font = "500 16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`exp. ${new Date(data.expiresAt).toLocaleDateString()}`, w - 20, h - 16);
    ctx.textAlign = "left";
  }

  // QR block, positioned by the fractional rectangle picked during design.
  const qrSize = Math.max(0.08, design.qr_size) * w;
  const qrX = design.qr_x * w - qrSize / 2;
  const qrY = design.qr_y * h - qrSize / 2;
  const pad = qrSize * 0.08;
  ctx.fillStyle = "#fff";
  roundRect(ctx, qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2, qrSize * 0.06);
  ctx.fill();
  try {
    const qrDataUrl = await QRCode.toDataURL(data.code, { margin: 0, width: 512 });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  } catch {
    // QR generation should never throw in practice; skip silently if it does.
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
 * Renders a whole batch onto one A4-ish printable sheet (3 columns, as many
 * rows as needed), so the owner can print a run of vouchers in one go.
 */
export async function downloadVoucherSheetPng(
  vouchers: VoucherRenderData[],
  design: VoucherDesign,
  filename = "voucher-batch.png",
) {
  const cols = 3;
  const cellW = Math.max(100, Math.round(design.width ?? VOUCHER_W));
  const cellH = Math.max(60, Math.round(design.height ?? VOUCHER_H));
  const gap = 40;
  const rows = Math.max(1, Math.ceil(vouchers.length / cols));
  const sheet = document.createElement("canvas");
  sheet.width = cols * cellW + gap * (cols + 1);
  sheet.height = rows * cellH + gap * (rows + 1);
  const ctx = sheet.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f4f4f2";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let i = 0; i < vouchers.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (cellW + gap);
    const y = gap + row * (cellH + gap);
    const cell = await renderVoucherCanvas(vouchers[i]!, design);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 12;
    ctx.drawImage(cell, x, y);
    ctx.restore();
  }

  const blob = await canvasToPngBlob(sheet);
  downloadBlob(blob, filename);
}
