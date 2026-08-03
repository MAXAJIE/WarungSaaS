// Server-side Supabase env resolution.
//
// Why this exists: on a self-hosted Cloudflare Worker deploy, `process.env` is
// NOT populated the way it is inside Lovable Cloud. Server functions therefore
// blew up with "Missing Supabase environment variable(s)" the moment a user did
// anything that hits the server (creating a store, etc.).
//
// We now look in every place the value can legitimately live, in order:
//   1. process.env            - node/dev + Lovable Cloud injection
//   2. Cloudflare Worker env  - `env` from `cloudflare:workers`, and any env
//                               object stashed on globalThis by the runtime
//   3. import.meta.env VITE_* - build-time inlined values (public URL + the
//                               publishable key only; never the service role)
//
// Only the URL and the publishable key fall back to the VITE_ values, because
// those are public by definition and are already shipped in the browser bundle.
// The service role key has no fallback - it must be a real server secret.

import { sanitizeApiKey } from "./api-key-fetch";

type EnvRecord = Record<string, string | undefined>;

let cloudflareEnv: EnvRecord | undefined;

function getCloudflareEnv(): EnvRecord | undefined {
  if (cloudflareEnv) return cloudflareEnv;

  const g = globalThis as unknown as {
    env?: EnvRecord;
    __env__?: EnvRecord;
    process?: { env?: EnvRecord };
  };

  // Some runtimes expose the bindings directly on globalThis.
  if (g.env && typeof g.env === "object") cloudflareEnv = g.env;
  else if (g.__env__ && typeof g.__env__ === "object") cloudflareEnv = g.__env__;

  return cloudflareEnv;
}

/** Called by the Worker entry so bindings are available to server functions. */
export function setServerEnv(env: EnvRecord | undefined): void {
  if (env && typeof env === "object") cloudflareEnv = env;
}

function readEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  // Values pasted into .env / `wrangler secret put` frequently carry quotes or
  // a trailing newline; those reach Supabase verbatim and come back as
  // "Invalid API key". Normalise every value on read.
  if (sanitizeApiKey(fromProcess)) return sanitizeApiKey(fromProcess);

  const fromCloudflare = getCloudflareEnv()?.[name];
  if (sanitizeApiKey(fromCloudflare)) return sanitizeApiKey(fromCloudflare);

  return undefined;
}

function viteEnv(name: string): string | undefined {
  try {
    return sanitizeApiKey((import.meta.env as unknown as EnvRecord)[name]);
  } catch {
    return undefined;
  }
}

export function getSupabaseUrl(): string | undefined {
  return (
    readEnv("SUPABASE_URL") ??
    readEnv("VITE_SUPABASE_URL") ??
    viteEnv("VITE_SUPABASE_URL") ??
    undefined
  );
}

/**
 * Every publishable/anon key this deployment knows about, best guess first.
 *
 * A self-hosted Worker very often ends up with the browser bundle built from
 * one key and `wrangler secret put` holding another (or an older, rotated
 * one). Handing the whole list to `createSupabaseFetch` lets the client retry
 * with the next candidate when the project answers "Invalid API key", so no
 * compartment of the app breaks because of a stale secret.
 */
export function getSupabasePublishableKeyCandidates(): string[] {
  const candidates = [
    readEnv("SUPABASE_PUBLISHABLE_KEY"),
    readEnv("SUPABASE_ANON_KEY"),
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
    readEnv("VITE_SUPABASE_ANON_KEY"),
    viteEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
    viteEnv("VITE_SUPABASE_ANON_KEY"),
  ].filter((value): value is string => Boolean(value));

  return candidates.filter((value, index) => candidates.indexOf(value) === index);
}

export function getSupabasePublishableKey(): string | undefined {
  return getSupabasePublishableKeyCandidates()[0];
}

export function getSupabaseServiceRoleKey(): string | undefined {
  // No VITE_ fallback on purpose: a service role key must never be inlined into
  // a client bundle.
  return readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? undefined;
}

export function missingEnvMessage(missing: string[]): string {
  return (
    `Missing Supabase environment variable(s): ${missing.join(", ")}. ` +
    `Set them for the server runtime (Lovable Cloud injects them automatically; ` +
    `on a self-hosted Cloudflare Worker use \`wrangler secret put <NAME>\` or the ` +
    `Worker's Variables settings).`
  );
}
