import { Link } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function describe(n: AppNotification, t: (k: string) => string) {
  const no = n.payload?.["order_no"];
  const suffix = no ? ` #${no}` : "";
  switch (n.type) {
    case "order.new":
      return `${t("notif_order_new")}${suffix}`;
    case "order.approved":
      return `${t("notif_order_approved")}${suffix}`;
    case "order.kitchen_done":
      return `${t("notif_order_ready")}${suffix}`;
    case "order.received":
      return `${t("notif_order_received")}${suffix}`;
    case "order.cancelled":
      return `${t("notif_order_cancelled")}${suffix}`;
    case "role.requested":
      return `${t("notif_role_requested")} — ${String(n.payload?.["who"] ?? "")}`;
    case "role.approved":
      return t("notif_role_approved");
    case "role.rejected":
      return t("notif_role_rejected");
    case "member.joined":
      return `${t("notif_member_joined")} — ${String(n.payload?.["who"] ?? "")}`;
    default:
      return n.type;
  }
}

export function NotificationBell({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const { items, unread, readOne, readAll, clearRead } = useNotifications(enabled);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("notifications")}
        className="soft-press relative grid size-10 place-items-center rounded-2xl border border-border bg-card transition-colors hover:border-primary"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[92vw] overflow-hidden rounded-3xl border border-border bg-card shadow-lift duration-150 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-bold">{t("notifications")}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => readAll.mutate()}
                className="soft-press grid size-8 place-items-center rounded-xl hover:bg-muted"
                aria-label={t("mark_all_read")}
                title={t("mark_all_read")}
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => clearRead.mutate()}
                className="soft-press grid size-8 place-items-center rounded-xl hover:bg-muted"
                aria-label={t("clear_read")}
                title={t("clear_read")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("no_notifications")}
              </p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  to={n.target_url ?? "/dashboard"}
                  onClick={() => {
                    if (!n.read) readOne.mutate(n.id);
                    setOpen(false);
                  }}
                  className={`flex items-start gap-2.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted ${
                    n.read ? "" : "bg-primary/5"
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{describe(n, t)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
