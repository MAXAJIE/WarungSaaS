import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, GripVertical } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { renderVoucherCanvas, type VoucherRenderData } from "@/components/voucher-canvas";
import {
  ELEMENT_SIZE_RANGE,
  normalizeLayout,
  resolveCardSize,
  VOUCHER_ELEMENT_IDS,
  type VoucherElementId,
  type VoucherLayout,
} from "@/lib/voucher-design";

/** Placement happens in order: the QR first, then the promo code, then the rest. */
type Step = "qr" | "code" | "all";

const STEP_ELEMENTS: Record<Step, VoucherElementId[]> = {
  qr: ["qr"],
  code: ["code"],
  all: VOUCHER_ELEMENT_IDS,
};

/** How wide a text handle is drawn, as a fraction of the card. Text is centred. */
const TEXT_HANDLE_W = 0.44;

function useNaturalSize(url: string | null) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!url) {
      setSize(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => !cancelled && setSize(null);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return size;
}

/**
 * WYSIWYG placement editor.
 *
 * The backdrop is the real exported PNG, re-rendered through the same
 * `renderVoucherCanvas` the download uses, so there is no second layout
 * implementation that can drift. On top of it sits one drag handle per enabled
 * element; dragging a handle only writes x/y, sizes come from the number boxes
 * so a fat finger can never resize by accident.
 */
export function VoucherLayoutEditor({
  layout,
  onChange,
  artworkUrl,
  sample,
}: {
  layout: VoucherLayout;
  onChange: (next: VoucherLayout) => void;
  artworkUrl: string | null;
  sample: VoucherRenderData;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("qr");
  const [active, setActive] = useState<VoucherElementId>("qr");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const natural = useNaturalSize(artworkUrl);

  const card = useMemo(
    () => resolveCardSize(normalizeLayout(layout), natural),
    [layout, natural],
  );

  // Re-render the real canvas on every change, one frame behind the drag so a
  // long drag never queues dozens of QR encodes.
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      renderVoucherCanvas(sample, { artworkUrl, layout })
        .then((canvas) => {
          if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png"));
        })
        .catch(() => {});
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [layout, artworkUrl, sample]);

  const patch = useCallback(
    (id: VoucherElementId, next: Partial<VoucherLayout["elements"][VoucherElementId]>) => {
      onChange({
        ...layout,
        elements: { ...layout.elements, [id]: { ...layout.elements[id], ...next } },
      });
    },
    [layout, onChange],
  );

  const movable = STEP_ELEMENTS[step];

  function startDrag(id: VoucherElementId, e: React.PointerEvent) {
    if (!movable.includes(id)) return;
    e.preventDefault();
    e.stopPropagation();
    setActive(id);
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      patch(id, { x, y });
    };
    move(e.nativeEvent);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Handle footprint as fractions of the card, matching what the renderer draws. */
  function handleBox(id: VoucherElementId) {
    const el = layout.elements[id];
    if (id === "qr") return { w: el.size, h: (el.size * card.width) / card.height };
    if (id === "strip") return { w: 1, h: el.size };
    return { w: TEXT_HANDLE_W, h: Math.max(el.size * 1.4, 0.05) };
  }

  return (
    <div className="space-y-3">
      {/* Step rail: QR first, promo code second, everything else last. */}
      <div className="flex flex-wrap items-center gap-2">
        {(["qr", "code", "all"] as Step[]).map((s, i) => {
          const done = (["qr", "code", "all"] as Step[]).indexOf(step) > i;
          return (
            <span
              key={s}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-secondary text-secondary-foreground"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {done && <Check className="size-3" />}
              {t(`vstep_${s}`)}
            </span>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          ref={frameRef}
          className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-border bg-muted"
          style={{ aspectRatio: `${card.width} / ${card.height}`, touchAction: "none" }}
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              className="pointer-events-none absolute inset-0 size-full select-none"
            />
          )}
          {VOUCHER_ELEMENT_IDS.filter((id) => layout.elements[id].enabled).map((id) => {
            const el = layout.elements[id];
            const box = handleBox(id);
            const draggable = movable.includes(id);
            return (
              <button
                key={id}
                type="button"
                onPointerDown={(e) => startDrag(id, e)}
                aria-label={t(`vel_${id}`)}
                className={`absolute rounded-lg border-2 transition-colors ${
                  draggable
                    ? active === id
                      ? "cursor-move border-primary bg-primary/10"
                      : "cursor-move border-primary/50 bg-primary/5"
                    : "pointer-events-none border-dashed border-border/60"
                }`}
                style={{
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                  left: `${(el.x - box.w / 2) * 100}%`,
                  top: `${(el.y - box.h / 2) * 100}%`,
                }}
              >
                {draggable && (
                  <GripVertical className="absolute -right-1 -top-1 size-3.5 text-primary" />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">{t("design_drag_hint")}</p>
      </div>

      {step !== "all" && (
        <button
          type="button"
          onClick={() => {
            const next: Step = step === "qr" ? "code" : "all";
            setStep(next);
            setActive(next === "code" ? "code" : "label");
          }}
          className="soft-press w-full rounded-2xl bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground"
        >
          {step === "qr" ? t("confirm_qr_spot") : t("confirm_code_spot")}
        </button>
      )}

      {/* One row per element: show/hide, plus the size that actually drives the render. */}
      <div className="space-y-2">
        {VOUCHER_ELEMENT_IDS.map((id) => {
          const el = layout.elements[id];
          const range = ELEMENT_SIZE_RANGE[id];
          return (
            <div
              key={id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2"
            >
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={el.enabled}
                  onChange={(e) => patch(id, { enabled: e.target.checked })}
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="truncate text-sm font-semibold">{t(`vel_${id}`)}</span>
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">
                  {t("size")}
                </span>
                <input
                  type="number"
                  min={Math.round(range.min * 100)}
                  max={Math.round(range.max * 100)}
                  step={1}
                  disabled={!el.enabled}
                  value={Math.round(el.size * 100)}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    if (!Number.isFinite(pct)) return;
                    patch(id, {
                      size: Math.min(range.max, Math.max(range.min, pct / 100)),
                    });
                  }}
                  className="w-16 rounded-xl border border-border bg-background px-2 py-1 text-right text-sm outline-none focus:border-primary disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground">%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
