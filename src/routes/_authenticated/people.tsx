import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChefHat, Copy, HandPlatter, Plus, Store, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Loading, StaffShell, useStoreGuard } from "@/components/staff-shell";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n";
import {
  createInvite,
  deleteGroup,
  kickMember,
  listPeople,
  revokeInvite,
  setMemberGroup,
  upsertGroup,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/people")({
  component: PeoplePage,
});

const ROLE_ICON = { cashier: Store, kitchen: ChefHat, pickup: HandPlatter } as const;

function PeoplePage() {
  const { t } = useI18n();
  const { me, hasStore } = useStoreGuard();
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["people"],
    queryFn: useServerFn(listPeople) as never,
    enabled: hasStore,
  });
  const invite = useServerFn(createInvite);
  const revoke = useServerFn(revokeInvite);
  const kick = useServerFn(kickMember);
  const saveGroup = useServerFn(upsertGroup);
  const removeGroup = useServerFn(deleteGroup);
  const assignGroup = useServerFn(setMemberGroup);
  const [groupName, setGroupName] = useState("");

  const data = people.data as
    | {
        members: Array<{
          id: string;
          user_id: string;
          display_name: string;
          role: "cashier" | "kitchen" | "pickup";
          group_id: string | null;
        }>;
        invites: Array<{ id: string; code: string; role: string; expires_at: string }>;
        groups: Array<{ id: string; name: string }>;
        ownerId: string;
      }
    | undefined;

  const refresh = () => qc.invalidateQueries({ queryKey: ["people"] });
  const inviteM = useMutation({
    mutationFn: (role: "cashier" | "kitchen" | "pickup") => invite({ data: { role } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const groupM = useMutation({
    mutationFn: (name: string) => saveGroup({ data: { name } }),
    onSuccess: () => {
      setGroupName("");
      refresh();
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = data?.groups ?? [];

  return (
    <StaffShell
      title={t("nav_people")}
      roles={
        (me.data?.roles?.length
          ? me.data.roles
          : me.data?.member
            ? [me.data.member.role]
            : []) as never
      }
      storeName={me.data?.store?.name ?? null}
    >
      {people.isLoading ? (
        <Loading />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-5">
            <h2 className="font-display text-xl font-bold">{t("members")}</h2>
            {(data?.members ?? []).length === 0 && (
              <EmptyState title={t("empty_members_title")} hint={t("empty_members_hint")} />
            )}
            {(["cashier", "kitchen", "pickup"] as const).map((role) => {
              const list = (data?.members ?? []).filter((m) => m.role === role);
              if (!list.length) return null;
              const Icon = ROLE_ICON[role];
              return (
                <div key={role} className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                    <Icon className="size-4" /> {t(`role_${role}`)} · {list.length}
                  </p>
                  {list.map((m) => (
                    <div key={m.id} className="cozy-card flex flex-wrap items-center gap-3 p-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 font-display text-base font-bold text-primary">
                        {(m.display_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.display_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.user_id === data?.ownerId ? t("i_am_owner") : t(`role_${m.role}`)}
                        </p>
                      </div>
                      <select
                        value={m.group_id ?? ""}
                        onChange={(e) =>
                          assignGroup({
                            data: { memberId: m.id, group_id: e.target.value || null },
                          })
                            .then(refresh)
                            .catch((err: Error) => toast.error(err.message))
                        }
                        aria-label={t("assign_group")}
                        className="rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold"
                      >
                        <option value="">{t("no_group")}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      {m.user_id !== data?.ownerId && (
                        <button
                          onClick={() =>
                            kick({ data: { memberId: m.id } })
                              .then(() => {
                                toast.success(t("removed"));
                                refresh();
                              })
                              .catch((e: Error) => toast.error(e.message))
                          }
                          className="soft-press inline-flex items-center gap-1 rounded-2xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
                        >
                          <UserMinus className="size-4" /> {t("remove_person")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            <div>
              <h2 className="mb-3 font-display text-xl font-bold">{t("departments")}</h2>
              <div className="flex gap-2">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder={t("group_name")}
                  className="flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={() => groupName.trim() && groupM.mutate(groupName.trim())}
                  className="soft-press inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
                >
                  <Plus className="size-4" /> {t("new_group")}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {groups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold"
                  >
                    {g.name}
                    <button
                      onClick={() =>
                        removeGroup({ data: { id: g.id } })
                          .then(() => {
                            refresh();
                            qc.invalidateQueries({ queryKey: ["groups"] });
                          })
                          .catch((e: Error) => toast.error(e.message))
                      }
                      className="text-destructive"
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                ))}
                {groups.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("empty_groups_hint")}</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-bold">{t("invite_staff")}</h2>
            <div className="flex flex-wrap gap-2">
              {(["cashier", "kitchen", "pickup"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => inviteM.mutate(r)}
                  className="soft-press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  <UserPlus className="size-4" /> {t(`role_${r}`)}
                </button>
              ))}
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
              {t("pending_invites")}
            </h3>
            <div className="space-y-2">
              {(data?.invites ?? []).map((i) => (
                <div key={i.id} className="cozy-card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold tracking-wider">{i.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`role_${i.role}`)} · {new Date(i.expires_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(i.code);
                      toast.success(i.code);
                    }}
                    className="soft-press grid size-9 place-items-center rounded-2xl border border-border"
                    aria-label="Copy"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    onClick={() =>
                      revoke({ data: { id: i.id } })
                        .then(refresh)
                        .catch((e: Error) => toast.error(e.message))
                    }
                    className="soft-press rounded-2xl bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
                  >
                    {t("delete")}
                  </button>
                </div>
              ))}
              {(data?.invites ?? []).length === 0 && (
                <EmptyState title={t("empty_invites_title")} hint={t("empty_invites_hint")} />
              )}
            </div>
          </section>
        </div>
      )}
    </StaffShell>
  );
}
