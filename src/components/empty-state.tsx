import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Nothing here yet. An empty list is a dead end unless it also tells the person
 * what to do next, so every empty state carries one action.
 */
export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
  to,
  icon,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="cozy-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
        {icon ?? <Sparkles className="size-5" />}
      </span>
      <div className="space-y-1">
        <p className="font-display text-base font-bold">{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actionLabel && to && (
        <Link
          to={to}
          className="soft-press rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !to && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="soft-press rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
