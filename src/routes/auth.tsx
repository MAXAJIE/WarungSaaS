import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogIn, Soup } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/google-auth";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Warung staff" },
      {
        name: "description",
        content:
          "Owners, kitchen and pickup crew sign in to run counter orders, cooking queue and handover.",
      },
      { property: "og:title", content: "Sign in — Warung staff" },
      {
        property: "og:description",
        content: "Access your stall's counter, kitchen and pickup dashboards.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed. Try email instead.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grain flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-4">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Soup className="size-4" />
          </span>
          {t("app_name")}
        </Link>
        <LanguageSwitcher compact />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="cozy-card w-full max-w-md p-7">
          <h1 className="font-display text-3xl font-bold">
            {mode === "in" ? t("sign_in") : t("sign_up")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tagline")}</p>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="soft-press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
              />
              <path fill="#FBBC05" d="M5.4 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8Z" />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4.1 3.1A7.2 7.2 0 0 1 12 4.8Z"
              />
            </svg>
            Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "up" && (
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("display_name")}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
                  placeholder="Ah Hock"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">{t("email")}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
                placeholder="you@warung.my"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">{t("password")}</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="soft-press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lift disabled:opacity-60"
            >
              <LogIn className="size-4" />
              {busy ? t("loading") : mode === "in" ? t("sign_in") : t("sign_up")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="mt-5 w-full text-center text-sm text-muted-foreground underline underline-offset-4"
          >
            {mode === "in" ? t("sign_up") : t("sign_in")}
          </button>
        </div>
      </div>
    </div>
  );
}
