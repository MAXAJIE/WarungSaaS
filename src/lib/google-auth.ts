import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

/**
 * Google sign-in that works both inside the Lovable editor/preview and on a
 * local (or self-hosted) deployment.
 *
 * The Lovable auth broker (`@lovable.dev/cloud-auth-js`) only accepts origins
 * it knows about, so on `localhost` it fails with an invalid-origin/redirect
 * error. On those origins we go straight to Supabase Auth instead, which is the
 * same provider the broker ends up using.
 */
export function isLovableHostedOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev") ||
    host.endsWith(".lovableproject.com")
  );
}

export type GoogleSignInResult = {
  /** The browser is navigating away to the provider. */
  redirected: boolean;
  error?: Error;
};

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const origin = window.location.origin;

  if (isLovableHostedOrigin()) {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: origin,
    });
    if (result.error) {
      return { redirected: false, error: toError(result.error) };
    }
    return { redirected: Boolean(result.redirected) };
  }

  // Local / self-hosted: plain Supabase OAuth with a public callback route.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth-callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) return { redirected: false, error: toError(error) };
  return { redirected: true };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
