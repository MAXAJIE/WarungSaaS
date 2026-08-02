import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { useI18n } from "@/lib/i18n";
import type { PromoProduct } from "@/components/voucher-form";

export type GiftFormValue = {
  id?: string;
  product_id: string;
  item_qty: number;
  note: string;
  threshold: number;
  stock: number;
  min_items: number;
  required_product_id: string | null;
  required_qty: number;
  terms: string;
  is_active: boolean;
};

function blank(): GiftFormValue {
  return {
    product_id: "",
    item_qty: 1,
    note: "",
    threshold: 50,
    stock: 10,
    min_items: 0,
    required_product_id: null,
    required_qty: 1,
    terms: "",
    is_active: true,
  };
}

const inputCls =
  "w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function GiftForm({
  open,
  onClose,
  products,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  products: PromoProduct[];
  initial?: Partial<GiftFormValue> | null;
  onSubmit: (value: GiftFormValue) => Promise<unknown>;
  submitting?: boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<GiftFormValue>(blank());

  useEffect(() => {
    if (!open) return;
    setValue({ ...blank(), ...(initial ?? {}) });
  }, [open, initial]);

  function submit() {
    onSubmit(value).catch((e: Error) => toast.error(e.message));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={value.id ? t("edit_gift") : t("new_gift")}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="soft-press flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold"
          >
            {t("cancel")}
          </button>
          <button
            onClick={submit}
            disabled={!value.product_id || submitting}
            className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
          >
            {t("save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Section title={t("section_reward")}>
          <Field
            label={t("gift_product")}
            hint="Pick the menu item the customer receives for free."
          >
            <select
              value={value.product_id}
              onChange={(e) => setValue({ ...value, product_id: e.target.value })}
              className={inputCls}
            >
              <option value="">{t("pick_gift_product")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("item_qty")} hint="How many units of this product does the customer get?">
            <input
              type="number"
              min="1"
              placeholder="1"
              value={value.item_qty}
              onChange={(e) => setValue({ ...value, item_qty: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field
            label={t("description")}
            hint="A short note shown to staff, e.g. how to hand it over."
          >
            <input
              value={value.note}
              placeholder="e.g. Free with any combo"
              onChange={(e) => setValue({ ...value, note: e.target.value })}
              className={inputCls}
            />
          </Field>
        </Section>

        <Section title={t("section_trigger")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={t("gift_threshold")} hint="Minimum order total to unlock this gift.">
              <input
                type="number"
                min="0"
                placeholder="e.g. 50.00"
                value={value.threshold}
                onChange={(e) => setValue({ ...value, threshold: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label={t("stock")} hint="How many gifts are available. 0 = unlimited.">
              <input
                type="number"
                min="0"
                placeholder="0 = unlimited"
                value={value.stock}
                onChange={(e) => setValue({ ...value, stock: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        <Section title={t("section_terms")}>
          <Field label={t("min_items")} hint="Minimum number of items on the ticket.">
            <input
              type="number"
              min="0"
              placeholder="0 = no minimum"
              value={value.min_items}
              onChange={(e) => setValue({ ...value, min_items: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field
            label={t("required_product")}
            hint="Require a specific product to be in the order."
          >
            <select
              value={value.required_product_id ?? ""}
              onChange={(e) => setValue({ ...value, required_product_id: e.target.value || null })}
              className={inputCls}
            >
              <option value="">{t("none")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {value.required_product_id && (
            <Field label={t("required_qty")}>
              <input
                type="number"
                min="1"
                value={value.required_qty}
                onChange={(e) => setValue({ ...value, required_qty: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          )}
          <Field label={t("terms_note")} hint="Shown to the cashier, e.g. one per customer.">
            <textarea
              value={value.terms}
              onChange={(e) => setValue({ ...value, terms: e.target.value })}
              rows={2}
              placeholder="e.g. Dine-in only, one per customer"
              className={inputCls}
            />
          </Field>
        </Section>
      </div>
    </Modal>
  );
}
