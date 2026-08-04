import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Lightweight centred dialog used for product / voucher / gift forms and
 * confirmations. Closes on Escape and on backdrop click.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-xl";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm duration-200 animate-in fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[88svh] w-full ${width} flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-lift duration-200 animate-in fade-in slide-in-from-bottom-4 sm:rounded-3xl`}
      >
        <div className="flex items-start gap-3 border-b border-border/70 bg-muted/40 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="soft-press grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>

        {footer && (
          <div className="flex gap-2 border-t border-border/70 bg-muted/30 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`soft-press flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift ${
            destructive ? "bg-destructive" : "bg-primary"
          }`}
        >
          {confirmLabel ?? t("confirm")}
        </button>
      </div>
    </Modal>
  );
}
