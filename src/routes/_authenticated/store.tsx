import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, ExternalLink, ImagePlus, Save, Store as StoreIcon } from "lucide-react";
import { StaffShell, useStoreGuard } from "@/components/staff-shell";
import { updateStore, uploadStoreImage } from "@/lib/staff.functions";
import { ImageCropper } from "@/components/image-cropper";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "Store settings — Warung" },
      {
        name: "description",
        content:
          "Configure your stall: name, tagline, opening state, prep minutes per cup and customer disclaimer.",
      },
      { property: "og:title", content: "Store settings — Warung" },
      { property: "og:description", content: "Configure your stall details and ordering rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

const inputClass =
  "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors focus:border-primary";

type StoreImages = { logo_path?: string | null; cover_path?: string | null };

function StorePage() {
  const { t } = useI18n();
  const { me } = useStoreGuard();
  const qc = useQueryClient();
  const saveStore = useServerFn(updateStore);
  const uploadImage = useServerFn(uploadStoreImage);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [prep, setPrep] = useState(8);
  const [disclaimer, setDisclaimer] = useState("");
  const [open, setOpen] = useState(true);
  const [template, setTemplate] = useState("{STALL}-{SEQ}");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropKind, setCropKind] = useState<"logo" | "cover" | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  const store = me.data?.store;
  const roles = (
    me.data?.roles?.length ? me.data.roles : me.data?.member ? [me.data.member.role] : []
  ) as string[];
  // Store settings belong to the owner, whatever other hats they also wear.
  const isOwner = roles.includes("owner");

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? "");
    setTagline(store.tagline ?? "");
    setPrep(Number(store.avg_prep_minutes ?? 8));
    setDisclaimer(store.disclaimer ?? "");
    setOpen(!!store.is_open);
    setTemplate(store.order_code_template ?? "{STALL}-{SEQ}");
    const images = store as unknown as StoreImages;
    setLogoPath(images.logo_path ?? null);
    setCoverPath(images.cover_path ?? null);
  }, [store]);

  // `logo_path`/`cover_path` are storage paths, never usable in <img src>. The
  // server hands back resolved URLs alongside them; a freshly uploaded file
  // takes priority so the tile updates before `me` refetches.
  const savedLogoUrl = me.data?.storeImages?.logo_url ?? null;
  const savedCoverUrl = me.data?.storeImages?.cover_url ?? null;
  const logoSrc = logoPreview ?? (logoPath ? savedLogoUrl : null);
  const coverSrc = coverPreview ?? (coverPath ? savedCoverUrl : null);

  const storeMutation = useMutation({
    mutationFn: async () =>
      saveStore({
        data: {
          name,
          tagline,
          avg_prep_minutes: prep,
          // Gift thresholds live per-gift on the promos page; event spend is
          // configured there too, so neither is sent from here.
          disclaimer,
          is_open: open,
          order_code_template: template,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("save"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { dataUrl: string; kind: "logo" | "cover" }) =>
      uploadImage({ data: { base64: payload.dataUrl, ext: "jpg", kind: payload.kind } }),
    onSuccess: (res, vars) => {
      if (vars.kind === "logo") {
        setLogoPath(res.path);
        setLogoPreview(res.signedUrl);
      } else {
        setCoverPath(res.path);
        setCoverPreview(res.signedUrl);
      }
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("save"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pickFile(kind: "logo" | "cover", file: File | undefined) {
    if (!file) return;
    setCropKind(kind);
    setCropFile(file);
  }

  return (
    <StaffShell title={t("nav_store")} roles={roles as never} storeName={store?.name ?? null}>
      <div className="mx-auto max-w-2xl space-y-6 py-2">
        <section className="cozy-card p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <StoreIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-bold">{t("store_settings")}</h1>
                {store?.slug && (
                  <a
                    href={`/s/${store.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    /s/{store.slug} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {!isOwner ? (
            <p className="mt-5 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
              {t("owner_only")}
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("store_logo")}
                  </span>
                  <button
                    type="button"
                    onClick={() => logoInput.current?.click()}
                    className="soft-press mt-1 flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40"
                  >
                    {logoSrc ? (
                      <img src={logoSrc} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-6 text-muted-foreground" />
                    )}
                  </button>
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickFile("logo", e.target.files?.[0])}
                  />
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("store_cover")}
                  </span>
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    className="soft-press mt-1 flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40"
                  >
                    {coverSrc ? (
                      <img src={coverSrc} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-6 text-muted-foreground" />
                    )}
                  </button>
                  <input
                    ref={coverInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickFile("cover", e.target.files?.[0])}
                  />
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("store_name")}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("description")}
                </span>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder={t("store_description_placeholder")}
                  className={`mt-1 ${inputClass} placeholder:opacity-50`}
                />
              </label>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" /> {t("prep_per_unit")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={prep}
                    onChange={(e) => setPrep(Number(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("prep_per_unit_hint")}
                  </span>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("order_code_template")}
                  </span>
                  <input
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {t("order_code_template_hint")}
                  </span>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("disclaimer_title")}
                </span>
                <textarea
                  value={disclaimer}
                  onChange={(e) => setDisclaimer(e.target.value)}
                  rows={3}
                  className={`mt-1 ${inputClass}`}
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => setOpen(e.target.checked)}
                  className="size-4"
                />
                {open ? t("store_open") : t("store_closed")}
              </label>

              <button
                type="button"
                disabled={storeMutation.isPending}
                onClick={() => storeMutation.mutate()}
                className="soft-press inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
              >
                <Save className="size-4" /> {t("save")}
              </button>
            </div>
          )}
        </section>
      </div>

      {cropFile && cropKind && (
        <ImageCropper
          file={cropFile}
          aspect={cropKind === "logo" ? 1 : 16 / 9}
          outputWidth={cropKind === "logo" ? 400 : 1200}
          title={cropKind === "logo" ? t("store_logo") : t("store_cover")}
          onCancel={() => {
            setCropFile(null);
            setCropKind(null);
          }}
          onCropped={(dataUrl) => {
            const kind = cropKind;
            setCropFile(null);
            setCropKind(null);
            if (kind) uploadMutation.mutate({ dataUrl, kind });
          }}
        />
      )}
    </StaffShell>
  );
}
