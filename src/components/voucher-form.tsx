import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2, Upload } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { useI18n } from "@/lib/i18n";
import { rewardSummary, type VoucherReward } from "@/lib/vouchers";
import { VoucherLayoutEditor } from "@/components/voucher-layout-editor";
import { DEFAULT_LAYOUT, normalizeLayout, type VoucherLayout } from "@/lib/voucher-design";

export type PromoProduct = {
  id: string;
  name: string;
  sell_price: number | string;
  is_combo?: boolean;
};

export type VoucherTemplateRow = {
  id: string;
  name: string;
  artwork_path: string | null;
  qr_x: number | string;
  qr_y: number | string;
  qr_size: number | string;
  defaults: Record<string, unknown> | null;
  design?: Record<string, unknown> | null;
};

export type VoucherFormValue = {
  id?: string;
  code: string;
  label: string;
  quantity: number;
  code_prefix: string;
  reward: VoucherReward;
  value: number;
  reward_product_id: string | null;
  nth_item: number;
  buy_qty: number;
  get_qty: number;
  stackable: boolean;
  max_discount: number;
  min_spend: number;
  min_items: number;
  required_product_id: string | null;
  required_qty: number;
  usage_limit: number;
  terms: string;
  template_id: string | null;
  artwork_path: string | null;
  /**
   * Full layout document: which elements print, where they sit and how big
   * they are, plus the export size (0 = keep the artwork's own pixels).
   */
  layout: VoucherLayout;
  is_active: boolean;
};

const REWARD_KINDS: VoucherReward[] = [
  "order_percent",
  "order_fixed",
  "nth_item_percent",
  "buy_x_get_y",
  "item_percent",
];

function blank(): VoucherFormValue {
  return {
    code: "",
    label: "",
    quantity: 1,
    code_prefix: "",
    reward: "order_percent",
    value: 10,
    reward_product_id: null,
    nth_item: 2,
    buy_qty: 1,
    get_qty: 1,
    stackable: false,
    max_discount: 0,
    min_spend: 0,
    min_items: 0,
    required_product_id: null,
    required_qty: 1,
    usage_limit: 1,
    terms: "",
    template_id: null,
    artwork_path: null,
    layout: structuredClone(DEFAULT_LAYOUT),
    is_active: true,
  };
}

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

const inputCls =
  "w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary";

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

function ProductPicker({
  value,
  onChange,
  products,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  products: PromoProduct[];
  placeholder: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls}
    >
      <option value="">{placeholder}</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function VoucherForm({
  open,
  onClose,
  products,
  templates,
  initial,
  applyTemplateId,
  onSubmit,
  onSaveTemplate,
  onDeleteTemplate,
  onUploadArtwork,
  artworkUrls,
  currency,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  products: PromoProduct[];
  templates: VoucherTemplateRow[];
  initial?: Partial<VoucherFormValue> | null;
  applyTemplateId?: string | null;
  onSubmit: (value: VoucherFormValue) => Promise<unknown>;
  onSaveTemplate: (name: string, value: VoucherFormValue) => Promise<unknown>;
  onDeleteTemplate: (id: string) => Promise<unknown>;
  onUploadArtwork: (dataUrl: string) => Promise<{ path: string; url: string | null }>;
  artworkUrls: Record<string, string>;
  /** Store currency, used only to word the sample reward line in the preview. */
  currency?: string;
  submitting?: boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<VoucherFormValue>(blank());
  const [localArtworkPreview, setLocalArtworkPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<VoucherTemplateRow | null>(
    null,
  );
  const isEdit = !!value.id;
  const isBatchCreate = !isEdit && value.quantity > 1;

  useEffect(() => {
    if (!open) return;
    const seed = { ...blank(), ...(initial ?? {}) };
    setValue({ ...seed, layout: normalizeLayout(seed.layout) });
    setLocalArtworkPreview(null);
    setTemplateName("");
    if (applyTemplateId) {
      const tpl = templates.find((tp) => tp.id === applyTemplateId);
      if (tpl) applyTemplate(tpl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, applyTemplateId]);

  function applyTemplate(tpl: VoucherTemplateRow) {
    const defaults = (tpl.defaults ?? {}) as Partial<VoucherFormValue>;
    setValue((v) => ({
      ...v,
      ...defaults,
      template_id: tpl.id,
      artwork_path: tpl.artwork_path,
      // Prefer the template's layout document; fall back to its legacy flat
      // QR columns so templates saved before this feature still place the QR.
      layout: normalizeLayout(
        tpl.design && Object.keys(tpl.design).length
          ? tpl.design
          : { qr_x: tpl.qr_x, qr_y: tpl.qr_y, qr_size: tpl.qr_size },
      ),
    }));
    setLocalArtworkPreview(tpl.artwork_path ? (artworkUrls[tpl.artwork_path] ?? null) : null);
  }

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const rewardNeedsProduct = value.reward !== "order_percent" && value.reward !== "order_fixed";

  /**
   * Artwork is uploaded exactly as chosen — no crop step, no forced aspect.
   * The image becomes the template; the width/height boxes below are the only
   * way to change the exported size, and 0 keeps the original pixels.
   */
  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("image_too_large"));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that image."));
        reader.readAsDataURL(file);
      });
      const res = await onUploadArtwork(dataUrl);
      setValue((v) => ({ ...v, artwork_path: res.path }));
      setLocalArtworkPreview(res.url ?? dataUrl);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const previewUrl =
    localArtworkPreview ??
    (value.artwork_path ? (artworkUrls[value.artwork_path] ?? null) : null);

  function submit() {
    onSubmit(value).catch((e: Error) => toast.error(e.message));
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      toast.error(t("template_name"));
      return;
    }
    try {
      await onSaveTemplate(templateName.trim(), value);
      setTemplateName("");
      toast.success(t("save"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? t("edit_voucher") : t("new_voucher")}
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
              disabled={submitting || (value.quantity === 1 && !value.code && !isEdit && false)}
              className="soft-press flex-1 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
            >
              {isBatchCreate ? t("mint_batch") : t("save")}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {templates.length > 0 && !isEdit && (
            <Section title={t("templates")}>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1 py-1 text-xs font-semibold"
                  >
                    <button type="button" onClick={() => applyTemplate(tpl)} className="soft-press">
                      {tpl.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTemplate(tpl)}
                      className="soft-press grid size-6 place-items-center rounded-full text-destructive"
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title={t("section_reward")}>
            <Field label={t("reward_kind")} hint="What does this voucher give the customer?">
              <select
                value={value.reward}
                onChange={(e) => setValue({ ...value, reward: e.target.value as VoucherReward })}
                className={inputCls}
              >
                {REWARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`reward_${k}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label={
                value.reward === "order_fixed" ? t("reward_value_fixed") : t("reward_value_percent")
              }
              hint={
                value.reward === "order_fixed"
                  ? "Fixed amount taken off the bill."
                  : "Percentage taken off."
              }
            >
              <input
                type="number"
                min="0"
                placeholder={value.reward === "order_fixed" ? "e.g. 15.00" : "e.g. 10"}
                value={value.value}
                onChange={(e) => setValue({ ...value, value: Number(e.target.value) })}
                className={inputCls}
              />
            </Field>

            {rewardNeedsProduct && (
              <Field
                label={value.reward === "buy_x_get_y" ? t("free_product") : t("pick_product")}
                hint={
                  value.reward === "buy_x_get_y"
                    ? "Which item is given away for free (Y)?"
                    : "Which menu item does this reward apply to?"
                }
              >
                <ProductPicker
                  value={value.reward_product_id}
                  onChange={(v) => setValue({ ...value, reward_product_id: v })}
                  products={products}
                  placeholder={t("pick_product")}
                />
              </Field>
            )}

            {value.reward === "nth_item_percent" && (
              <Field label={t("nth_index")} hint="e.g. 2 = every 2nd item gets the discount.">
                <input
                  type="number"
                  min="2"
                  placeholder="2"
                  value={value.nth_item}
                  onChange={(e) => setValue({ ...value, nth_item: Number(e.target.value) })}
                  className={inputCls}
                />
              </Field>
            )}

            {value.reward === "buy_x_get_y" && (
              <Field label={t("buy_product")} hint="Which item must the customer buy (X)?">
                <ProductPicker
                  value={value.required_product_id}
                  onChange={(v) =>
                    setValue({ ...value, required_product_id: v, required_qty: value.buy_qty })
                  }
                  products={products}
                  placeholder={t("buy_product")}
                />
              </Field>
            )}

            {value.reward === "buy_x_get_y" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label={t("buy_qty")} hint="How many must the customer buy?">
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={value.buy_qty}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        buy_qty: Number(e.target.value),
                        required_qty: Number(e.target.value) || 1,
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label={t("get_qty")} hint="How many do they get free?">
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={value.get_qty}
                    onChange={(e) => setValue({ ...value, get_qty: Number(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}

            <Field label={t("max_discount")} hint="Cap the discount amount. Leave 0 for no cap.">
              <input
                type="number"
                min="0"
                value={value.max_discount}
                onChange={(e) => setValue({ ...value, max_discount: Number(e.target.value) })}
                className={inputCls}
                placeholder={t("optional")}
              />
            </Field>
          </Section>

          <Section title={t("section_codes")}>
            {!isEdit && (
              <Field label={t("quantity")} hint="How many codes should this mint at once?">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={value.quantity}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      quantity: Math.min(500, Math.max(1, Number(e.target.value))),
                    })
                  }
                  className={inputCls}
                />
              </Field>
            )}
            {(isEdit || value.quantity === 1) && (
              <Field label={t("manual_code")} hint="Leave blank to auto-generate a code.">
                <input
                  value={value.code}
                  onChange={(e) => setValue({ ...value, code: e.target.value.toUpperCase() })}
                  placeholder={t("manual_code_hint")}
                  className={`${inputCls} uppercase`}
                />
              </Field>
            )}
            {!isEdit && value.quantity > 1 && (
              <Field label={t("code_prefix")} hint="Codes will look like PREFIX-7KQF2M.">
                <input
                  value={value.code_prefix}
                  onChange={(e) =>
                    setValue({ ...value, code_prefix: e.target.value.toUpperCase() })
                  }
                  placeholder="RAYA"
                  className={`${inputCls} uppercase`}
                />
              </Field>
            )}
            <Field label={t("label")} hint="A short name shown to staff and customers.">
              <input
                value={value.label}
                onChange={(e) => setValue({ ...value, label: e.target.value })}
                placeholder="Merdeka treat"
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title={t("section_terms")}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={t("min_spend")} hint="Minimum order total required.">
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 30.00"
                  value={value.min_spend}
                  onChange={(e) => setValue({ ...value, min_spend: Number(e.target.value) })}
                  className={inputCls}
                />
              </Field>
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
            </div>
            {value.reward !== "buy_x_get_y" && (
              <>
                <Field
                  label={t("required_product")}
                  hint="Require a specific product to be in the order."
                >
                  <ProductPicker
                    value={value.required_product_id}
                    onChange={(v) => setValue({ ...value, required_product_id: v })}
                    products={products}
                    placeholder={t("none")}
                  />
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
              </>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={t("usage_limit")} hint="0 = unlimited uses.">
                <input
                  type="number"
                  min="0"
                  placeholder="0 = unlimited"
                  value={value.usage_limit}
                  onChange={(e) => setValue({ ...value, usage_limit: Number(e.target.value) })}
                  className={inputCls}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={value.stackable}
                onChange={(e) => setValue({ ...value, stackable: e.target.checked })}
                className="size-4"
              />
              {t("stackable")}
            </label>
            <Field label={t("terms_note")} hint="Shown to the cashier and printed on the voucher.">
              <textarea
                value={value.terms}
                onChange={(e) => setValue({ ...value, terms: e.target.value })}
                rows={2}
                placeholder="e.g. Dine-in only, one per customer"
                className={inputCls}
              />
            </Field>
          </Section>

          <Section title={t("section_design")}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={t("voucher_width")} hint={t("voucher_size_hint")}>
                <input
                  type="number"
                  min="0"
                  value={value.layout.width_px}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      layout: {
                        ...value.layout,
                        width_px: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      },
                    })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label={t("voucher_height")} hint={t("voucher_size_hint")}>
                <input
                  type="number"
                  min="0"
                  value={value.layout.height_px}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      layout: {
                        ...value.layout,
                        height_px: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      },
                    })
                  }
                  className={inputCls}
                />
              </Field>
            </div>

            <label className="soft-press flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold">
              <Upload className="size-4" />
              {uploading ? t("loading") : t("design_upload")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            <VoucherLayoutEditor
              layout={value.layout}
              onChange={(layout) => setValue((v) => ({ ...v, layout }))}
              artworkUrl={previewUrl}
              sample={{
                code: value.code || value.code_prefix || "SAMPLE",
                label: value.label,
                rewardText: rewardSummary(value, currency),
                terms: value.terms,
              }}
            />


            <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("template_name")}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={saveTemplate}
                className="soft-press flex items-center justify-center gap-1 rounded-2xl bg-secondary px-4 py-2.5 text-xs font-bold text-secondary-foreground"
              >
                <Save className="size-3.5" /> {t("save_as_template")}
              </button>
            </div>
          </Section>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteTemplate}
        onClose={() => setConfirmDeleteTemplate(null)}
        onConfirm={() =>
          confirmDeleteTemplate &&
          onDeleteTemplate(confirmDeleteTemplate.id).catch((e: Error) => toast.error(e.message))
        }
        title={t("delete_template")}
        message={`${t("delete_confirm")} ${confirmDeleteTemplate?.name ?? ""}`}
        confirmLabel={t("delete")}
        destructive
      />
    </>
  );
}

export { blank as blankVoucherForm };
