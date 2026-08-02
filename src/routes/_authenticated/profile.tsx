import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight, Globe, Save, Store as StoreIcon, User as UserIcon } from "lucide-react";
import { StaffShell, useMe } from "@/components/staff-shell";
import { requestRoleChange, updateProfile } from "@/lib/staff.functions";
import { useI18n, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile — Warung staff" },
      {
        name: "description",
        content: "Update your display name, language and stall settings for the Warung app.",
      },
      { property: "og:title", content: "Your profile — Warung staff" },
      { property: "og:description", content: "Manage your staff profile and stall settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

/** One row inside a grouped settings card — label, control, optional caption. */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const saveProfile = useServerFn(updateProfile);
  const askRole = useServerFn(requestRoleChange);
  const [wanted, setWanted] = useState("");

  const [name, setName] = useState("");

  useEffect(() => {
    if (!me.data) return;
    setName(me.data.profile?.display_name ?? "");
  }, [me.data]);

  const profileMutation = useMutation({
    mutationFn: async () => saveProfile({ data: { display_name: name, preferred_lang: lang } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("save"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: async () => askRole({ data: { requested_role: wanted as never } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("pending_request"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = (me.data as { pendingRoleRequest?: { requested_role: string } } | undefined)
    ?.pendingRoleRequest;

  const role = me.data?.member?.role ?? null;
  const isCashier = role === "cashier";
  const initial = (name || "?").slice(0, 1).toUpperCase();

  return (
    <StaffShell title={t("nav_profile")} role={role} storeName={me.data?.store?.name ?? null}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* Header card: avatar, name and role badge — the identity strip
            everything below refers back to. */}
        <section className="cozy-card flex items-center gap-4 p-6">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-2xl font-bold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-bold">{name || t("display_name")}</p>
            <span className="mt-1 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              {role ?? "—"}
            </span>
          </div>
        </section>

        {/* Account: identity fields that persist to the server. */}
        <section className="cozy-card overflow-hidden">
          <h2 className="border-b border-border/70 bg-muted/40 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("account")}
          </h2>
          <div className="divide-y divide-border/70">
            <SettingRow label={t("display_name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-48 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </SettingRow>
          </div>
          <div className="flex justify-end border-t border-border/70 bg-muted/20 px-5 py-3">
            <button
              type="button"
              disabled={profileMutation.isPending}
              onClick={() => profileMutation.mutate()}
              className="soft-press inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
            >
              <Save className="size-4" /> {t("save")}
            </button>
          </div>
        </section>

        {/* Preferences: things that only affect this device/session look. */}
        <section className="cozy-card overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Globe className="size-3.5" /> {t("preferences")}
          </h2>
          <div className="divide-y divide-border/70">
            <SettingRow label={t("language")}>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
                <option value="ms">Melayu</option>
              </select>
            </SettingRow>
          </div>
        </section>

        {/* Role: read-only current role plus a request-a-change flow. */}
        <section className="cozy-card overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <UserIcon className="size-3.5" /> {t("role")}
          </h2>
          <div className="px-5 py-4">
            <p className="text-sm text-muted-foreground">{t("role_locked")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase text-primary">
                {role ?? "—"}
              </span>
              {pending ? (
                <span className="rounded-full bg-secondary/20 px-3 py-1.5 text-xs font-bold">
                  {t("pending_request")}: {pending.requested_role}
                </span>
              ) : (
                <>
                  <select
                    value={wanted}
                    onChange={(e) => setWanted(e.target.value)}
                    className="rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">—</option>
                    <option value="cashier">cashier</option>
                    <option value="kitchen">kitchen</option>
                    <option value="pickup">pickup</option>
                  </select>
                  <button
                    type="button"
                    disabled={!wanted || roleMutation.isPending}
                    onClick={() => roleMutation.mutate()}
                    className="soft-press rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {t("request_role")}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {isCashier && (
          <section className="cozy-card overflow-hidden">
            <h2 className="border-b border-border/70 bg-muted/40 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("quick_links")}
            </h2>
            <Link
              to="/store"
              className="soft-press flex items-center justify-between px-5 py-4 text-sm font-bold"
            >
              <span className="flex items-center gap-2">
                <StoreIcon className="size-4 text-primary" /> {t("store_settings")}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </section>
        )}
      </div>
    </StaffShell>
  );
}
