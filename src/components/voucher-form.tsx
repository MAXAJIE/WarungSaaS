import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2, Upload } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { ImageCropper } from "@/components/image-cropper";
import { useI18n } from "@/lib/i18n";
import type { VoucherReward } from "@/lib/vouchers";
import { VOUCHER_W, VOUCHER_H } from "@/components/voucher-canvas";
import QRCode from "qrcode";

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
  expires_at: string;
  template_id: string | null;
  artwork_path: string | null;
  qr_x: number;
  qr_y: number;
  qr_size: number;
  /** Voucher card dimensions in px, used only to shape the artwork crop and
   * QR placement preview — the export always renders at this aspect. */
  width_px: number;
  height_px: number;
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
    expires_at: "",
    template_id: null,
    artwork_path: null,
    qr_x: 0.78,
    qr_y: 0.5,
    qr_size: 0.32,
    width_px: VOUCHER_W,
    height_px: VOUCHER_H,
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

/**
 * Drag-and-resize placement of the QR rectangle over the cropped artwork. A
 * real sample QR code is rendered inside the frame (not a plain box) so the
 * preview matches the exported PNG pixel-for-pixel: same aspect, same
 * fractional position, same relative size.
 */
function QrPlacer({
  artworkUrl,
  code,
  qr_x,
  qr_y,
  qr_size,
  aspect,
  onChange,
}: {
  artworkUrl: string;
  code: string;
  qr_x: number;
  qr_y: number;
  qr_size: number;
  aspect: number;
  onChange: (v: { qr_x: number; qr_y: number; qr_size: number }) => void;
}) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const FRAME_W = 320;
  const FRAME_H = Math.round(FRAME_W / aspect);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(code || "SAMPLE", { margin: 0, width: 256 })
      .then((url) => !cancelled && setQrDataUrl(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        className="relative w-full max-w-[320px] overflow-hidden rounded-2xl border border-border bg-muted"
        style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}`, touchAction: "none" }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const move = (ev: PointerEvent) => {
            const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
            onChange({ qr_x: x, qr_y: y, qr_size });
          };
          move(e.nativeEvent);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <img
          src={artworkUrl}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary bg-card/90 p-[3%] shadow-lift"
          style={{
            width: `${qr_size * 100}%`,
            height: `${qr_size * aspect * (FRAME_H / FRAME_W) * 100}%`,
            left: `${qr_x * 100 - (qr_size * 100) / 2}%`,
            top: `${qr_y * 100 - (qr_size * (FRAME_W / FRAME_H) * 100) / 2}%`,
          }}
        >
          {qrDataUrl && <img src={qrDataUrl} alt="" className="size-full object-contain" />}
        </div>
      </div>
      <label className="flex w-full items-center gap-3 text-xs font-semibold text-muted-foreground">
        {t("qr_size")}
        <input
          type="range"
          min={0.12}
          max={0.6}
          step={0.01}
          value={qr_size}
          onChange={(e) => onChange({ qr_x, qr_y, qr_size: Number(e.target.value) })}
          className="flex-1"
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("design_qr_hint")}</p>
    </div>
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
  submitting?: boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<VoucherFormValue>(blank());
  const [localArtworkPreview, setLocalArtworkPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedForPlacement, setCroppedForPlacement] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<VoucherTemplateRow | null>(
    null,
  );
  const isEdit = !!value.id;
  const isBatchCreate = !isEdit && value.quantity > 1;
  const aspect =
    Math.max(0.2, value.width_px || VOUCHER_W) / Math.max(0.2, value.height_px || VOUCHER_H);

  useEffect(() => {
    if (!open) return;
    setValue({ ...blank(), ...(initial ?? {}) });
    setLocalArtworkPreview(null);
    setCroppedForPlacement(null);
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
      qr_x: Number(tpl.qr_x),
      qr_y: Number(tpl.qr_y),
      qr_size: Number(tpl.qr_size),
      width_px: Number(defaults.width_px) || VOUCHER_W,
      height_px: Number(defaults.height_px) || VOUCHER_H,
    }));
    setLocalArtworkPreview(tpl.artwork_path ? (artworkUrls[tpl.artwork_path] ?? null) : null);
  }

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const rewardNeedsProduct = value.reward !== "order_percent" && value.reward !== "order_fixed";

  async function handleFile(file: File) {
    setCropFile(file);
  }

  async function handleCropped(dataUrl: string) {
    setCropFile(null);
    setCroppedForPlacement(dataUrl);
  }

  async function commitArtwork() {
    if (!croppedForPlacement) return;
    setUploading(true);
    try {
      const res = await onUploadArtwork(croppedForPlacement);
      setValue((v) => ({ ...v, artwork_path: res.path }));
      setLocalArtworkPreview(res.url ?? croppedForPlacement);
      setCroppedForPlacement(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const previewUrl =
    croppedForPlacement ??
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
        size="lg"
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
              <Field label={t("pick_product")} hint="Which menu item does this reward apply to?">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label={t("buy_qty")} hint="How many must the customer buy?">
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={value.buy_qty}
                    onChange={(e) => setValue({ ...value, buy_qty: Number(e.target.value) })}
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
              <Field label={t("expires_at")} hint="Leave blank for no expiry.">
                <input
                  type="date"
                  value={value.expires_at ? value.expires_at.slice(0, 10) : ""}
                  onChange={(e) => setValue({ ...value, expires_at: e.target.value })}
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
              <Field label="Voucher width (px)" hint="Controls the card's shape.">
                <input
                  type="number"
                  min="200"
                  value={value.width_px}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      width_px: Math.max(200, Number(e.target.value) || VOUCHER_W),
                    })
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Voucher height (px)" hint="Controls the card's shape.">
                <input
                  type="number"
                  min="120"
                  value={value.height_px}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      height_px: Math.max(120, Number(e.target.value) || VOUCHER_H),
                    })
                  }
                  className={inputCls}
                />
              </Field>
            </div>

            {previewUrl ? (
              <div
                className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-border"
                style={{ aspectRatio: `${value.width_px} / ${value.height_px}` }}
              >
                <img src={previewUrl} alt="" className="size-full object-cover" />
              </div>
            ) : (
              <div className="grid h-24 place-items-center rounded-2xl border border-dashed border-border text-xs text-muted-foreground">
                {t("token_fallback_hint")}
              </div>
            )}

            <label className="soft-press flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold">
              <Upload className="size-4" />
              {t("design_upload")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>

            {croppedForPlacement && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("design_place_qr")}
                </p>
                <QrPlacer
                  artworkUrl={croppedForPlacement}
                  code={value.code || value.code_prefix || "SAMPLE"}
                  qr_x={value.qr_x}
                  qr_y={value.qr_y}
                  qr_size={value.qr_size}
                  aspect={aspect}
                  onChange={(v) => setValue({ ...value, ...v })}
                />
                <button
                  onClick={commitArtwork}
                  disabled={uploading}
                  className="soft-press w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {uploading ? t("loading") : t("save")}
                </button>
              </div>
            )}

            {!croppedForPlacement && previewUrl && (
              <QrPlacer
                artworkUrl={previewUrl}
                code={value.code || value.code_prefix || "SAMPLE"}
                qr_x={value.qr_x}
                qr_y={value.qr_y}
                qr_size={value.qr_size}
                aspect={aspect}
                onChange={(v) => setValue({ ...value, ...v })}
              />
            )}

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

      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={handleCropped}
          aspect={aspect}
          outputWidth={value.width_px || VOUCHER_W}
          title={t("design_upload")}
          hint={t("design_qr_hint")}
        />
      )}

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
