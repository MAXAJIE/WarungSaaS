import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGS, useI18n } from "@/lib/i18n";

/**
 * Globe dropdown language toggle: a single pill that opens a small menu with
 * the three supported languages and a check on the active one.
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = LANGS.find((l) => l.code === lang) ?? LANGS[0]!;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language")}
        className="soft-press group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold transition-all duration-200 hover:border-primary hover:shadow-lift"
      >
        <Globe className="size-4 text-primary transition-transform duration-200 group-hover:rotate-12" />
        <span className={compact ? "hidden sm:inline" : ""}>{active.label}</span>
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-lift duration-150 animate-in fade-in slide-in-from-top-1"
        >
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="menuitem"
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                lang === l.code ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
              }`}
            >
              {l.label}
              {lang === l.code && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
