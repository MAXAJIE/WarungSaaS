import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  deleteProductOption,
  listProductOptions,
  upsertProductOption,
} from "@/lib/staff.functions";
import { useI18n } from "@/lib/i18n";

type Value = { id?: string; label: string; price_delta: number };
type OptionDraft = { id?: string; name: string; is_required: boolean; values: Value[] };

const inputClass =
  "w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";

/** Owner-side editor for the choices a customer sees on a product. */
export function ProductOptionsEditor({ productId }: { productId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(listProductOptions);
  const save = useServerFn(upsertProductOption);
  const remove = useServerFn(deleteProductOption);
  const [draft, setDraft] = useState<OptionDraft | null>(null);

  const options = useQuery({
    queryKey: ["product-options", productId],
    queryFn: () => list({ data: { product_id: productId } }),
  });

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(draft?.id ? { id: draft.id } : {}),
          product_id: productId,
          name: draft!.name,
          is_required: draft!.is_required,
          values: draft!.values
            .filter((v) => v.label.trim())
            .map((v, i) => ({ ...v, sort_order: i })),
        },
      }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["product-options", productId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-options", productId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = options.data ?? [];

  return (
    <div className="space-y-3">
      {rows.map((o) => (
        <div key={o.id} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold">
              {o.name}
              {o.is_required && <span className="text-destructive"> *</span>}
            </p>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  id: o.id,
                  name: o.name,
                  is_required: o.is_required,
                  values: o.values.map((v) => ({
                    id: v.id,
                    label: v.label,
                    price_delta: Number(v.price_delta),
                  })),
                })
              }
              className="soft-press rounded-xl border border-border px-3 py-1 text-xs font-bold"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => delM.mutate(o.id)}
              aria-label={t("delete")}
              className="soft-press grid size-8 place-items-center rounded-xl bg-destructive/10 text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.values.map((v) => v.label).join(" · ") || "—"}
          </p>
        </div>
      ))}

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft({ name: "", is_required: false, values: [{ label: "", price_delta: 0 }] })}
          className="soft-press inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm font-bold"
        >
          <Plus className="size-4" /> {t("add_option")}
        </button>
      )}

      {draft && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
          <input
            value={draft.name}
            placeholder={t("option_name")}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.is_required}
              onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })}
            />
            {t("option_required")}
          </label>
          {draft.values.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={v.label}
                placeholder={t("value_label")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    values: draft.values.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
                className={inputClass}
              />
              <input
                type="number"
                step="0.10"
                value={v.price_delta}
                aria-label={t("price_delta")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    values: draft.values.map((x, j) =>
                      j === i ? { ...x, price_delta: Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-28 rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label={t("delete")}
                onClick={() =>
                  setDraft({ ...draft, values: draft.values.filter((_, j) => j !== i) })
                }
                className="soft-press grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, values: [...draft.values, { label: "", price_delta: 0 }] })
              }
              className="soft-press rounded-2xl border border-border bg-card px-4 py-2 text-xs font-bold"
            >
              <Plus className="mr-1 inline size-3.5" /> {t("add_value")}
            </button>
            <button
              type="button"
              disabled={!draft.name.trim() || saveM.isPending}
              onClick={() => saveM.mutate()}
              className="soft-press rounded-2xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {t("save_option")}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="soft-press rounded-2xl border border-border px-4 py-2 text-xs font-bold"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
