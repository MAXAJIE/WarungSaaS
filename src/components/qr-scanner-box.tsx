import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Image as ImageIcon, KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Extracts the order token from a scanned URL or raw code. */
export function parseOrderCode(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const last = value.includes("/") ? (value.split(/[/?#]/).filter(Boolean).pop() ?? "") : value;
  const cleaned = last.trim();
  if (/^[a-zA-Z0-9-]{6,64}$/.test(cleaned)) return cleaned;
  return null;
}

export function QrScannerBox({ onScan }: { onScan: (code: string) => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<{ stop?: () => void; destroy?: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [decoding, setDecoding] = useState(false);

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    const s = scannerRef.current;
    if (s) {
      try {
        s.stop?.();
      } catch {
        /* noop */
      }
      try {
        s.destroy?.();
      } catch {
        /* noop */
      }
    }
    scannerRef.current = null;
    setRunning(false);
  }

  async function startCamera() {
    setError(null);
    try {
      const QrScanner = (await import("qr-scanner")).default;
      if (!videoRef.current) return;
      const scanner = new QrScanner(
        videoRef.current,
        (result: { data: string }) => {
          const code = parseOrderCode(result.data);
          if (!code) {
            setError(t("scan_invalid"));
            return;
          }
          void scanner.stop();
          setRunning(false);
          onScan(code);
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
        },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("scan_permission"));
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDecoding(true);
    setError(null);
    try {
      const QrScanner = (await import("qr-scanner")).default;
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      const raw = typeof result === "string" ? result : result.data;
      const code = parseOrderCode(raw);
      if (!code) {
        setError(t("scan_invalid"));
        return;
      }
      onScan(code);
    } catch {
      setError(t("scan_invalid"));
    } finally {
      setDecoding(false);
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = parseOrderCode(manual);
    if (!code) {
      setError(t("scan_invalid"));
      return;
    }
    setManual("");
    onScan(code);
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-card shadow-cozy">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!running && (
          <div className="absolute inset-0 grid place-items-center bg-card/95 p-6 text-center">
            <div>
              <div className="live-dot mx-auto mb-3 grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                <Camera className="size-8" />
              </div>
              <p className="text-lg font-semibold">{t("scan_title")}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                {t("scan_permission")}
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="soft-press mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lift"
              >
                <Camera className="size-4" /> {t("scan_start")}
              </button>
            </div>
          </div>
        )}
        {running && (
          <>
            <div className="pointer-events-none absolute inset-6">
              <div className="absolute left-0 top-0 size-8 rounded-tl-2xl border-l-4 border-t-4 border-primary" />
              <div className="absolute right-0 top-0 size-8 rounded-tr-2xl border-r-4 border-t-4 border-primary" />
              <div className="absolute bottom-0 left-0 size-8 rounded-bl-2xl border-b-4 border-l-4 border-primary" />
              <div className="absolute bottom-0 right-0 size-8 rounded-br-2xl border-b-4 border-r-4 border-primary" />
            </div>
            <button
              type="button"
              onClick={stopCamera}
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-card/90 shadow"
              aria-label={t("scan_stop")}
            >
              <CameraOff className="size-4" />
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={decoding}
        className="soft-press inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        <ImageIcon className="size-4" /> {decoding ? "…" : t("scan_upload")}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

      <form
        onSubmit={submitManual}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2"
      >
        <KeyRound className="size-4 text-muted-foreground" />
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={t("scan_manual_placeholder")}
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          className="soft-press rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          {t("scan_go")}
        </button>
      </form>
      <p className="text-center text-xs text-muted-foreground">{t("scan_manual")}</p>
    </div>
  );
}
