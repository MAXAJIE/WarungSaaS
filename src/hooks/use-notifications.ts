import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  clearNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

export type AppNotification = {
  id: string;
  type: string;
  payload: Record<string, string | number | boolean | null>;
  target_url: string | null;
  read: boolean;
  created_at: string;
};

/** Polls the staff inbox; cheap enough for a counter shop on shared tablets. */
export function useNotifications(enabled: boolean) {
  const qc = useQueryClient();
  const list = useServerFn(listNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const clear = useServerFn(clearNotifications);

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list({ data: { limit: 30 } }) as Promise<AppNotification[]>,
    enabled,
    refetchInterval: enabled ? 20_000 : false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readOne = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: invalidate,
  });
  const readAll = useMutation({ mutationFn: () => markAll({}), onSuccess: invalidate });
  const clearRead = useMutation({ mutationFn: () => clear({}), onSuccess: invalidate });

  const items = query.data ?? [];
  return {
    items,
    unread: items.filter((n) => !n.read).length,
    isLoading: query.isLoading,
    readOne,
    readAll,
    clearRead,
  };
}
