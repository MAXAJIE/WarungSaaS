import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Filter,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
  if (prefs.layout === "list") return "grid grid-cols-[minmax(0,1fr)] gap-3";
  if (prefs.size === "sm")
    return "grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  if (prefs.size === "lg") return "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2";
  return "grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3";
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

      {filters && filters.length > 1 && <FilterMenu prefs={prefs} set={set} filters={filters} />}

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
        {[
          { id: "grid" as const, icon: LayoutGrid },
          { id: "list" as const, icon: List },
        ].map((l) => (
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

/**
 * Status / grouping picker. A row of pills pushed the size and arrangement
 * controls off screen as soon as a stall had a few categories, so the whole
 * list collapses behind one filter icon and only opens when asked.
 */
function FilterMenu({
  prefs,
  set,
  filters,
}: {
  prefs: ViewPrefs;
  set: (patch: Partial<ViewPrefs>) => void;
  filters: Array<{ id: string; label: string }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = filters.find((f) => f.id === prefs.filter) ?? filters[0]!;
  const filtered = prefs.filter !== "all";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("filter")}
        title={`${t("filter")}: ${active.label}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "soft-press inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors",
          filtered && "border-primary text-primary",
        )}
      >
        <Filter className="size-4" />
        {filtered && <span className="max-w-[9rem] truncate">{active.label}</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 max-h-72 w-52 overflow-y-auto rounded-2xl border border-border bg-card p-1.5 shadow-lift"
        >
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={prefs.filter === f.id}
              onClick={() => {
                set({ filter: f.id });
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors",
                prefs.filter === f.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Check className={cn("size-3.5", prefs.filter === f.id ? "" : "opacity-0")} />
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
