import { supabase } from "@/integrations/supabase/client";

/**
 * Google sign-in.
 *
 * We always drive Supabase Auth directly (PKCE) with an explicit, same-origin
 * `redirectTo`. That matters for two reasons:
 *
 *  1. The Lovable auth broker only accepts origins it knows about, so it fails
 *     on `localhost` and on the self-hosted Worker domain.
 *  2. Passing `redirectTo` explicitly stops Supabase from falling back to the
 *     project's *Site URL* — which is what made every device bounce through
 *     `http://localhost:...` mid-flow. Whatever origin the browser is on is the
 *     origin it comes back to.
 *
 * The provider always returns to the PUBLIC `/auth-callback` route, never
 * straight to a protected page: the session has to be exchanged and persisted
 * before the auth gate is allowed to look at it.
 */

/** Public callback route the OAuth provider must return to. */
export const AUTH_CALLBACK_PATH = "/auth-callback";

export type GoogleSignInResult = {
  /** The browser is navigating away to the provider. */
  redirected: boolean;
  error?: Error;
};

/** Absolute, same-origin URL the provider redirects back to. */
export function authCallbackUrl(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Explicit + same-origin: never let Supabase substitute its Site URL.
      redirectTo: authCallbackUrl(),
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) return { redirected: false, error: toError(error) };
  return { redirected: true };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
