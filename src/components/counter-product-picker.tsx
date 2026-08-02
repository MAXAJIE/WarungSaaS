import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Minus, Plus, UtensilsCrossed, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { listProductOptions } from "@/lib/staff.functions";
import type { CounterItemInput } from "@/lib/orders.server";

export type PickerProduct = {
  id: string;
  name: string;
  sell_price: number | string;
  is_available: boolean;
  is_combo?: boolean;
  combo_items?: Array<{ product_id: string; qty: number }>;
  photo_url?: string | null;
};

export type CartEntry = {
  key: string;
  item: CounterItemInput;
  label: string;
  unitPrice: number;
};

type OptionValue = {
  id: string;
  label: string;
  price_delta: number | string;
  option_id: string;
};
type ProductOption = {
  id: string;
  name: string;
  is_required: boolean;
  max_select: number;
  values: OptionValue[];
};
type ChosenValue = { option_id: string; value_id: string; label: string; price_delta: number };
type QueueStep = { key: string; productId: string; name: string; isMain: boolean };

function useProductOptions(productId: string | null) {
  const fn = useServerFn(listProductOptions);
  return useQuery({
    queryKey: ["product-options", productId],
    queryFn: () => fn({ data: { product_id: productId! } }) as Promise<ProductOption[]>,
    enabled: !!productId,
  });
}

/** Square widget grid: photo/initial, name, price. Click opens the customise sheet. */
export function ProductPickerGrid({
  products,
  onPick,
}: {
  products: PickerProduct[];
  onPick: (p: PickerProduct) => void;
}) {
  const { t } = useI18n();
  const available = products.filter((p) => p.is_available);
  if (!available.length) {
    return (
      <EmptyState
        title={t("empty_products_title")}
        hint={t("empty_products_hint")}
        icon={<UtensilsCrossed className="size-5" />}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {available.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p)}
          className="soft-press flex aspect-square flex-col items-center justify-center gap-1.5 rounded-3xl border border-border bg-card p-3 text-center shadow-cozy transition-transform duration-150 hover:-translate-y-0.5"
        >
          {p.photo_url ? (
            <img src={p.photo_url} alt={p.name} className="size-12 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="line-clamp-2 text-xs font-semibold">{p.name}</span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {formatMoney(p.sell_price)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Customisation sheet: walks through the product's own options, then every
 * component of a combo that has options of its own, then asks quantity.
 */
export function ProductCustomizeSheet({
  open,
  product,
  products,
  onClose,
  onConfirm,
}: {
  open: boolean;
  product: PickerProduct | null;
  products: PickerProduct[];
  onClose: () => void;
  onConfirm: (entry: CartEntry) => void;
}) {
  const { t } = useI18n();
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<"options" | "qty">("options");
  const [selections, setSelections] = useState<Record<string, ChosenValue[]>>({});
  const [qty, setQty] = useState(1);

  const queue = useMemo<QueueStep[]>(() => {
    if (!product) return [];
    const steps: QueueStep[] = [
      { key: "main", productId: product.id, name: product.name, isMain: true },
    ];
    if (product.is_combo && product.combo_items?.length) {
      product.combo_items.forEach((ci, ciIdx) => {
        const child = products.find((p) => p.id === ci.product_id);
        for (let n = 0; n < Math.max(1, ci.qty); n++) {
          steps.push({
            key: `combo-${ciIdx}-${n}`,
            productId: ci.product_id,
            name: child?.name ?? ci.product_id,
            isMain: false,
          });
        }
      });
    }
    return steps;
  }, [product, products]);

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
    setSelections({});
    setQty(1);
    setPhase("options");
  }, [open, product?.id]);

  const current = queue[stepIdx] ?? null;
  const optionsQ = useProductOptions(open ? (current?.productId ?? null) : null);
  const options = (optionsQ.data ?? []) as ProductOption[];

  function goNext() {
    if (stepIdx + 1 >= queue.length) setPhase("qty");
    else setStepIdx((i) => i + 1);
  }

  // A component with no customisable options is skipped automatically.
  useEffect(() => {
    if (!open || phase !== "options" || !current) return;
    if (optionsQ.isSuccess && options.length === 0) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, current?.key, optionsQ.isSuccess, options.length]);

  function goBack() {
    if (phase === "qty") {
      setPhase("options");
      return;
    }
    if (stepIdx > 0) setStepIdx((i) => i - 1);
    else onClose();
  }

  function toggleValue(opt: ProductOption, value: OptionValue) {
    if (!current) return;
    const key = current.key;
    setSelections((sel) => {
      const list = sel[key] ?? [];
      const already = list.some((s) => s.option_id === opt.id && s.value_id === value.id);
      const withoutGroup = list.filter((s) => s.option_id !== opt.id);
      const chosen: ChosenValue = {
        option_id: opt.id,
        value_id: value.id,
        label: value.label,
        price_delta: Number(value.price_delta),
      };
      if (opt.max_select === 1) {
        return { ...sel, [key]: already ? withoutGroup : [...withoutGroup, chosen] };
      }
      if (already) {
        return {
          ...sel,
          [key]: list.filter((s) => !(s.option_id === opt.id && s.value_id === value.id)),
        };
      }
      const groupCount = list.filter((s) => s.option_id === opt.id).length;
      if (opt.max_select > 0 && groupCount >= opt.max_select) return sel;
      return { ...sel, [key]: [...list, chosen] };
    });
  }

  const requiredMet = current
    ? options.every(
        (opt) =>
          !opt.is_required || (selections[current.key] ?? []).some((s) => s.option_id === opt.id),
      )
    : true;

  function buildEntry(): CartEntry | null {
    if (!product) return null;
    const mainSel = selections["main"] ?? [];
    const comboSteps = queue.filter((q) => !q.isMain);
    const combo_parts = comboSteps.map((step) => ({
      product_id: step.productId,
      options: (selections[step.key] ?? []).map((s) => ({
        option_id: s.option_id,
        value_id: s.value_id,
      })),
    }));
    const labels = [
      ...mainSel.map((s) => s.label),
      ...comboSteps.flatMap((step) =>
        (selections[step.key] ?? []).map((s) => `${step.name}: ${s.label}`),
      ),
    ];
    const addOn =
      mainSel.reduce((s, v) => s + v.price_delta, 0) +
      comboSteps.reduce(
        (s, step) => s + (selections[step.key] ?? []).reduce((s2, v) => s2 + v.price_delta, 0),
        0,
      );
    const item: CounterItemInput = {
      product_id: product.id,
      qty,
      options: mainSel.map((s) => ({ option_id: s.option_id, value_id: s.value_id })),
      ...(combo_parts.length ? { combo_parts } : {}),
    };
    return {
      key: `${product.id}-${Date.now()}-${Math.random()}`,
      item,
      label: labels.length ? `${product.name} (${labels.join(", ")})` : product.name,
      unitPrice: Number(product.sell_price) + addOn,
    };
  }

  if (!product) return null;
  const isLast = stepIdx + 1 >= queue.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.name}
      subtitle={
        phase === "options" && current
          ? `${current.name} · ${t("step_of", { current: stepIdx + 1, total: queue.length })}`
          : t("quantity")
      }
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={goBack}
            className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
          >
            {t("back_step")}
          </button>
          {phase === "options" ? (
            <button
              type="button"
              disabled={!requiredMet}
              onClick={goNext}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {isLast ? t("quantity") : t("next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const entry = buildEntry();
                if (entry) onConfirm(entry);
                onClose();
              }}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              {t("add_to_ticket")}
            </button>
          )}
        </>
      }
    >
      {phase === "options" && current && (
        <div className="space-y-4">
          {product.is_combo && (
            <p className="text-xs text-muted-foreground">{t("combo_step_hint")}</p>
          )}
          {optionsQ.isLoading && <p className="text-sm text-muted-foreground">…</p>}
          {options.map((opt) => (
            <div key={opt.id}>
              <p className="mb-2 text-sm font-bold">
                {opt.name}
                {opt.is_required && (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                    {t("option_required")}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {opt.values.map((v) => {
                  const active = (selections[current.key] ?? []).some(
                    (s) => s.option_id === opt.id && s.value_id === v.id,
                  );
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleValue(opt, v)}
                      className={`soft-press rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card"
                      }`}
                    >
                      {v.label}
                      {Number(v.price_delta) !== 0 && ` (+${formatMoney(v.price_delta)})`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "qty" && (
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="soft-press grid size-10 place-items-center rounded-full border border-border"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center text-2xl font-bold">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="soft-press grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Running cart used both by the walk-in ticket and the "add missing items" flow. */
export function CartSummary({
  cart,
  currency,
  onRemove,
}: {
  cart: CartEntry[];
  currency?: string;
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  if (!cart.length) {
    return (
      <p className="cozy-card p-4 text-center text-sm text-muted-foreground">{t("ticket_empty")}</p>
    );
  }
  return (
    <div className="cozy-card divide-y divide-border p-2">
      {cart.map((c) => (
        <div key={c.key} className="flex items-center gap-3 px-2 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {c.item.qty}× {c.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMoney(c.unitPrice * c.item.qty, currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(c.key)}
            aria-label={t("remove_item")}
            className="soft-press grid size-8 place-items-center rounded-full border border-border text-destructive"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
