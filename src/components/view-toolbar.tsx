import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Maximize2, Minimize2, Search, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ViewSize = "sm" | "md" | "lg";
export type ViewLayout = "grid" | "list";

export type ViewPrefs = {
  size: ViewSize;
  layout: ViewLayout;
  query: string;
  filter: string;
};

const DEFAULTS: ViewPrefs = { size: "md", layout: "grid", query: "", filter: "all" };

/** Per-surface view preferences (size / arrangement / filter), remembered locally. */
export function useViewPrefs(key: string, initial?: Partial<ViewPrefs>) {
  const storageKey = `warung.view.${key}`;
  const [prefs, setPrefs] = useState<ViewPrefs>({ ...DEFAULTS, ...initial });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setPrefs((p) => ({ ...p, ...(JSON.parse(raw) as Partial<ViewPrefs>), query: "" }));
    } catch {
      /* ignore unreadable prefs */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      const { size, layout, filter } = prefs;
      localStorage.setItem(storageKey, JSON.stringify({ size, layout, filter }));
    } catch {
      /* storage may be unavailable */
    }
  }, [storageKey, prefs]);

  const set = useMemo(
    () => (patch: Partial<ViewPrefs>) => setPrefs((p) => ({ ...p, ...patch })),
    [],
  );

  return { prefs, set };
}

/** Tailwind grid classes for the chosen size + arrangement. */
export function viewGridClass(prefs: ViewPrefs) {
  if (prefs.layout === "list") return "grid grid-cols-1 gap-3";
  if (prefs.size === "sm") return "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  if (prefs.size === "lg") return "grid gap-4 lg:grid-cols-2";
  return "grid gap-3 md:grid-cols-2 xl:grid-cols-3";
}

export function viewPadClass(prefs: ViewPrefs) {
  return prefs.size === "sm" ? "p-3 text-sm" : prefs.size === "lg" ? "p-6 text-base" : "p-4";
}

const SIZES: Array<{ id: ViewSize; icon: typeof Minimize2 }> = [
  { id: "sm", icon: Minimize2 },
  { id: "md", icon: SlidersHorizontal },
  { id: "lg", icon: Maximize2 },
];

export function ViewToolbar({
  prefs,
  set,
  filters,
  searchPlaceholder,
}: {
  prefs: ViewPrefs;
  set: (patch: Partial<ViewPrefs>) => void;
  filters?: Array<{ id: string; label: string }>;
  searchPlaceholder?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[150px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={prefs.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder={searchPlaceholder ?? t("search")}
          className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </label>

      {filters && filters.length > 1 && (
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => set({ filter: f.id })}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                prefs.filter === f.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
        {SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={`${t("size")} ${s.id}`}
            onClick={() => set({ size: s.id })}
            className={cn(
              "grid size-8 place-items-center rounded-xl transition-all duration-200 hover:scale-110",
              prefs.size === s.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <s.icon className="size-4" />
          </button>
        ))}
      </div>

      <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
        {([
          { id: "grid" as const, icon: LayoutGrid },
          { id: "list" as const, icon: List },
        ]).map((l) => (
          <button
            key={l.id}
            type="button"
            aria-label={`${t("arrangement")} ${l.id}`}
            onClick={() => set({ layout: l.id })}
            className={cn(
              "grid size-8 place-items-center rounded-xl transition-all duration-200 hover:scale-110",
              prefs.layout === l.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <l.icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
