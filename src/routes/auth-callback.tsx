import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Soup } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Warung staff" },
      {
        name: "description",
        content: "Finishing your Google sign-in and taking you to your warung dashboard.",
      },
      { property: "og:title", content: "Signing you in — Warung staff" },
      {
        property: "og:description",
        content: "Finishing your Google sign-in for the warung staff dashboards.",
      },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;
    let done = false;

    const go = () => {
      if (cancelled || done) return;
      done = true;
      // Scrub the ?code=/#access_token= fragment out of history so a refresh or
      // a shared link never replays a spent authorization code.
      window.history.replaceState({}, "", window.location.pathname);
      navigate({ to: "/dashboard", replace: true });
    };

    // supabase-js may finish `detectSessionInUrl` after our first getSession()
    // call, so listen as well instead of racing it.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    async function finish() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const errorDescription =
        url.searchParams.get("error_description") ?? hashParams.get("error_description");
      if (errorDescription) {
        if (!cancelled) setMessage(errorDescription);
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        // PKCE flow: swap the code for a session. If supabase-js already did it
        // via detectSessionInUrl, this errors harmlessly and getSession wins.
        await supabase.auth.exchangeCodeForSession(code).catch(() => undefined);
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        go();
        return;
      }

      // Give the in-flight detectSessionInUrl / listener one more beat before
      // declaring failure, otherwise a slow device shows a false error.
      window.setTimeout(async () => {
        if (cancelled || done) return;
        const { data: retry } = await supabase.auth.getSession();
        if (cancelled || done) return;
        if (retry.session) {
          go();
          return;
        }
        setMessage("Sign-in did not complete. Please try again.");
        window.setTimeout(() => {
          if (!cancelled && !done) navigate({ to: "/auth", replace: true });
        }, 1500);
      }, 1200);
    }

    void finish();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);



  return (
    <div className="grain flex min-h-screen items-center justify-center bg-background px-4">
      <div className="cozy-card flex w-full max-w-sm flex-col items-center gap-3 p-8 text-center">
        <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Soup className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
