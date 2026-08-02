export function formatMoney(value: number | string, currency = "MYR") {
  const n = typeof value === "string" ? Number(value) : value;
  const safe = Number.isFinite(n) ? n : 0;
  const symbol = currency === "MYR" ? "RM" : currency;
  return `${symbol} ${safe.toFixed(2)}`;
}

export function n(value: number | string | null | undefined) {
  const x = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(x) ? (x as number) : 0;
}

export function minutesLeft(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export function secondsLeft(iso: string | null | undefined) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

export function mmss(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
