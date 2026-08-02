import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ value, size = 240 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#4a2c18", light: "#fffdf8" },
      errorCorrectionLevel: "M",
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) return <p className="text-sm text-destructive">QR could not be drawn.</p>;
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="rounded-2xl border border-border bg-card p-2 shadow-cozy"
    />
  );
}
