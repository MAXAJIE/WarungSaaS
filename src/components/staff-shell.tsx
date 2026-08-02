import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  ClipboardList,
  Gift,
  LogOut,
  ScrollText,
  Soup,
  Store,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getMe } from "@/lib/staff.functions";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notification-bell";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/modal";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { useQueryClient } from "@tanstack/react-query";

export function useMe() {
  const fn = useServerFn(getMe);
  return useQuery({ queryKey: ["me"], queryFn: () => fn({}) });
}

/**
 * Staff pages only make sense inside a store. If the signed-in account has no
 * membership yet, send them back to /dashboard (onboarding) instead of firing
 * store-scoped server fns that throw "You are not part of any store yet."
 */
export function useStoreGuard() {
  const me = useMe();
  const navigate = useNavigate();
  const hasStore = !!me.data?.member;
  useEffect(() => {
    if (me.isSuccess && !hasStore) navigate({ to: "/dashboard", replace: true });
  }, [me.isSuccess, hasStore, navigate]);
  return { me, hasStore };
}


type NavItem = { to: string; label: string; icon: typeof Soup };

const RAIL = "72px";
const IDLE_MINUTES = 20;

function RailButton({
  label,
  active,
  to,
  onClick,
  danger,
  children,
}: {
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const base =
    "group/link relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ease-out";
  const state = active
    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
    : danger
      ? "text-sidebar-foreground/60 hover:bg-destructive/15 hover:text-destructive"
      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  const inner = (
    <>
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
      )}
      <span className="relative transition-transform duration-200 ease-out group-hover/link:scale-110">
        {children}
      </span>
      <span className="pointer-events-none absolute left-full z-50 ml-3 translate-x-[-6px] whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-200 ease-out group-hover/link:translate-x-0 group-hover/link:opacity-100">
        {label}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={label} className={`${base} ${state}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`${base} ${state}`}>
      {inner}
    </button>
  );
}

export function StaffShell({
  children,
  title,
  role,
  storeName,
}: {
  children: ReactNode;
  title: string;
  role?: "cashier" | "kitchen" | "pickup" | null;
  storeName?: string | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [confirmOut, setConfirmOut] = useState(false);

  const items: NavItem[] =
    role === "cashier"
      ? [
          { to: "/dashboard", label: t("nav_orders"), icon: ClipboardList },
          { to: "/products", label: t("nav_products"), icon: UtensilsCrossed },
          { to: "/promos", label: t("nav_promos"), icon: Gift },
          { to: "/people", label: t("nav_people"), icon: Users },
          { to: "/store", label: t("nav_store"), icon: Store },
          { to: "/analytics", label: t("nav_analytics"), icon: BarChart3 },
          { to: "/logs", label: t("nav_logs"), icon: ScrollText },
          { to: "/profile", label: t("nav_profile"), icon: UserRound },
        ]
      : [
          {
            to: "/dashboard",
            label: role === "kitchen" ? t("nav_kitchen") : t("nav_pickup"),
            icon: Soup,
          },
          { to: "/logs", label: t("nav_logs"), icon: ScrollText },
          { to: "/profile", label: t("nav_profile"), icon: UserRound },
        ];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Shared devices are left unattended a lot; sign out after 20 idle minutes.
  useIdleLogout(IDLE_MINUTES, () => {
    void signOut();
  });

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ ["--rail" as string]: RAIL }}
    >
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col items-center border-r border-sidebar-border bg-sidebar md:flex"
        style={{ width: RAIL }}
      >
        <div className="flex w-full items-center justify-center border-b border-sidebar-border py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105">
            <Soup className="size-[18px]" />
          </span>
        </div>

        <nav className="mt-3 flex flex-1 flex-col items-center gap-1.5 px-2">
          {items.map((i) => (
            <RailButton key={i.to} to={i.to} label={i.label} active={pathname === i.to}>
              <i.icon className="size-[18px]" />
            </RailButton>
          ))}
        </nav>

        <div className="flex w-full flex-col items-center gap-1.5 border-t border-sidebar-border p-2">
          <RailButton label={t("sign_out")} onClick={() => setConfirmOut(true)} danger>
            <LogOut className="size-[18px]" />
          </RailButton>
        </div>
      </aside>

      <div className="md:pl-[72px]">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold leading-tight">{title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {storeName ?? t("app_name")}
                {role ? ` · ${t(`role_${role}`)}` : ""}
              </p>
            </div>
            <NotificationBell enabled={!!role} />
            <LanguageSwitcher compact />
            <button
              type="button"
              onClick={() => setConfirmOut(true)}
              className="soft-press grid size-10 place-items-center rounded-xl border border-border bg-card md:hidden"
              aria-label={t("sign_out")}
            >
              <LogOut className="size-4" />
            </button>
          </div>

          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden">
            {items.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  pathname === i.to
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <i.icon className="size-3.5" />
                {i.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-5 duration-300 animate-in fade-in">
          {children}
        </main>
      </div>

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => void signOut()}
        title={t("sign_out")}
        message={t("sign_out_confirm")}
        confirmLabel={t("sign_out")}
        destructive
      />
    </div>
  );
}


export function Loading() {
  const { t } = useI18n();
  return <p className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</p>;
}
