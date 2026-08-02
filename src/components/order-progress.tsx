import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Ordered lifecycle every order walks through, cart excluded. */
export const ORDER_STEPS = [
  "submitted",
  "approved",
  "preparing",
  "kitchen_done",
  "received",
  "completed",
] as const;

export type OrderStep = (typeof ORDER_STEPS)[number];

const STEP_LABEL: Record<OrderStep, string> = {
  submitted: "step_submitted",
  approved: "step_paid",
  preparing: "step_preparing",
  kitchen_done: "step_ready",
  received: "step_received",
  completed: "step_completed",
};

export function OrderProgress({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (status === "cancelled") {
    return (
      <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
        {t("status_cancelled")}
      </p>
    );
  }
  const index = ORDER_STEPS.indexOf(status as OrderStep);
  const current = index < 0 ? 0 : index;

  return (
    <div className="w-full">
    <ol className="flex w-full items-start gap-0" aria-label={t("order_progress")}>
      {ORDER_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={`h-1 flex-1 rounded-full ${i === 0 ? "bg-transparent" : done || active ? "bg-primary" : "bg-muted"}`}
              />
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-300 ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-card text-primary shadow-lift"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="size-3" />
                ) : (
                  <span className="text-[10px] font-bold">{i + 1}</span>
                )}
              </span>
              <span
                className={`h-1 flex-1 rounded-full ${i === ORDER_STEPS.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-muted"}`}
              />
            </div>
            {!compact && (
              // Six labels never fit side by side on a phone, so below `sm`
              // only the current step is named, underneath the rail.
              <span
                className={`hidden w-full break-words px-0.5 text-center text-[10px] font-semibold leading-tight sm:block ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {t(STEP_LABEL[step])}
              </span>
            )}
          </li>
        );
      })}
    </ol>
      {!compact && (
        <p className="mt-1.5 text-center text-[11px] font-semibold text-primary sm:hidden">
          {t(STEP_LABEL[ORDER_STEPS[current]!])}
        </p>
      )}
    </div>
  );
}
