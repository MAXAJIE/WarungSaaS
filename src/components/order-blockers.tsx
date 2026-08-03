import type { Blocker } from "@/lib/vouchers";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

/**
 * Explains, in plain language, exactly what a voucher still needs before an
 * order can be paid. Used by the cashier's payment-review popup: while any
 * blocker exists, Approve stays disabled and this panel says why.
 */
export function OrderBlockers({
  blockers,
  currency,
  productNames,
}: {
  blockers: Blocker[];
  currency?: string;
  /** product_id -> name, for the required-product / no-matching-item messages. */
  productNames?: Record<string, string>;
}) {
  const { t } = useI18n();
  if (!blockers.length) return null;

  const describe = (b: Blocker): string => {
    switch (b.kind) {
      case "inactive":
        return t("blocker_inactive");
      case "exhausted":
        return t("blocker_exhausted");
      case "min_spend":
        return t("blocker_min_spend", {
          need: formatMoney(b.need, currency),
          have: formatMoney(b.have, currency),
        });
      case "min_items":
        return t("blocker_min_items", { need: b.need, have: b.have });
      case "required_product":
        return t("blocker_required_product", {
          need: b.need,
          have: b.have,
          product: productNames?.[b.productId] ?? b.productId,
        });
      case "no_matching_item":
        return t("blocker_no_matching_item");
    }
  };

  return (
    <div className="space-y-1 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="font-bold">{t("voucher_blockers_title")}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {blockers.map((b, i) => (
          <li key={i}>{describe(b)}</li>
        ))}
      </ul>
      <p className="text-xs opacity-80">{t("blocker_hint")}</p>
    </div>
  );
}
