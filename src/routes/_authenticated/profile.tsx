import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Store as StoreIcon } from "lucide-react";
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
    mutationFn: async () =>
      saveProfile({ data: { display_name: name, preferred_lang: lang } }),
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

  return (
    <StaffShell title={t("nav_profile")} role={role} storeName={me.data?.store?.name ?? null}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section className="cozy-card p-6">
          <h1 className="font-display text-xl font-bold">{t("nav_profile")}</h1>
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("display_name")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-semibold text-muted-foreground">{t("language")}</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="ms">Melayu</option>
            </select>
          </label>
          <button
            type="button"
            disabled={profileMutation.isPending}
            onClick={() => profileMutation.mutate()}
            className="soft-press mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
          >
            <Save className="size-4" /> {t("save")}
          </button>
        </section>

        <section className="cozy-card p-6">
          <h2 className="font-display text-lg font-bold">{t("role")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("role_locked")}</p>
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
        </section>

        {isCashier && (
          <Link
            to="/store"
            className="soft-press flex items-center justify-between rounded-3xl border border-border bg-card p-5 text-sm font-bold shadow-lift"
          >
            {t("store_settings")} <StoreIcon className="size-4 text-primary" />
          </Link>
        )}
      </div>
    </StaffShell>
  );
}
