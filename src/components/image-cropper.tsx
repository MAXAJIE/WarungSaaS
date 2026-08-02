import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { useI18n } from "@/lib/i18n";

const MAX_FRAME_W = 288; // on-screen crop frame width, in px
const DEFAULT_OUTPUT = 800; // exported width, in px, for square callers

/**
 * Generic cropper. Callers pass an `aspect` (width / height) so the crop
 * frame — and the exported canvas — matches whatever shape the artwork needs
 * (square product photos, wide voucher artwork, etc). Returns a JPEG data URL
 * of exactly outputWidth x round(outputWidth / aspect) pixels.
 */
export function ImageCropper({
  file,
  onCancel,
  onCropped,
  aspect = 1,
  outputWidth = DEFAULT_OUTPUT,
  title,
  hint,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (dataUrl: string) => void;
  aspect?: number;
  outputWidth?: number;
  title?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const frameW = MAX_FRAME_W;
  const frameH = Math.round(MAX_FRAME_W / aspect);
  const outputHeight = Math.round(outputWidth / aspect);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src || !size) {
    return (
      <Modal open onClose={onCancel} title={title ?? t("crop_photo")}>
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </Modal>
    );
  }

  // Cover the frame in both axes: the smaller-relative side drives the scale.
  const baseScale = Math.max(frameW / size.w, frameH / size.h);
  const scale = baseScale * zoom;
  const drawnW = size.w * scale;
  const drawnH = size.h * scale;
  const maxX = Math.max(0, (drawnW - frameW) / 2);
  const maxY = Math.max(0, (drawnH - frameH) / 2);
  const clamped = {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = outputWidth / frameW;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outputWidth, outputHeight);
      const left = (frameW - drawnW) / 2 + clamped.x;
      const top = (frameH - drawnH) / 2 + clamped.y;
      ctx.drawImage(img, left * k, top * k, drawnW * k, drawnH * k);
      onCropped(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.src = src!;
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={title ?? t("crop_photo")}
      subtitle={hint ?? t("crop_hint")}
      footer={
        <>
          <button
            onClick={onCancel}
            className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
          >
            {t("cancel")}
          </button>
          <button
            onClick={confirm}
            className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift"
          >
            {t("save")}
          </button>
        </>
      }
    >
      <div className="flex w-full flex-col items-center gap-4">
        <div
          className="relative w-full max-w-[288px] overflow-hidden rounded-2xl border border-border bg-muted"
          style={{ aspectRatio: `${frameW} / ${frameH}`, touchAction: "none" }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX - clamped.x, y: e.clientY - clamped.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
          }}
          onPointerUp={() => {
            drag.current = null;
            setOffset(clamped);
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={{
              width: `${(drawnW / frameW) * 100}%`,
              height: `${(drawnH / frameH) * 100}%`,
              left: `${(((frameW - drawnW) / 2 + clamped.x) / frameW) * 100}%`,
              top: `${(((frameH - drawnH) / 2 + clamped.y) / frameH) * 100}%`,
              maxWidth: "none",
            }}
          />
        </div>
        <label className="flex w-full items-center gap-3 text-xs font-semibold text-muted-foreground">
          {t("zoom")}
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
      </div>
    </Modal>
  );
}
