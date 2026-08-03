// Shared fetch wrapper for every Supabase client in this app.
//
// Three separate failure modes are handled here, all of which showed up only
// on the public (self-hosted Worker) deployment:
//
//   * PostgREST and GoTrue must NOT receive an opaque `sb_…` key in
//     `Authorization`. They try to parse that value as a JWT and fail with
//     "Expected 3 parts in JWT; got 1".
//   * Storage MUST receive an `Authorization` header. When it is missing,
//     storage-api falls back to parsing the `apikey` value as a JWT, and an
//     opaque key blows up with "jws protected header is invalid".
//   * **"Invalid API key"** - the key that reached the service does not belong
//     to the project behind SUPABASE_URL (typical when the browser bundle was
//     built with one key while the Worker secret holds another, or when a
//     value was pasted with quotes/newlines). Instead of surfacing that to the
//     user we retry the very same request with the other configured key and
//     remember whichever one the project accepts.

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Strips quotes/whitespace that survive copy-paste into .env or `wrangler secret put`. */
export function sanitizeApiKey(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function isStorageRequest(input: RequestInfo | URL): boolean {
  return requestUrl(input).includes("/storage/v1/");
}

function isInvalidApiKeyBody(body: string): boolean {
  const lowered = body.toLowerCase();
  return (
    lowered.includes("invalid api key") ||
    lowered.includes("no api key found") ||
    lowered.includes("invalid authentication credentials")
  );
}

/** A retry is only safe when the body can be replayed. */
function isReplayable(init: RequestInit | undefined, input: RequestInfo | URL): boolean {
  if (typeof Request !== "undefined" && input instanceof Request && !init?.body) {
    // The body lives on the Request stream and is consumed by the first attempt.
    return input.method === "GET" || input.method === "HEAD";
  }
  const body = init?.body;
  if (body === undefined || body === null) return true;
  return (
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) ||
    ArrayBuffer.isView(body as ArrayBufferView)
  );
}

export function createSupabaseFetch(keys: string | string[]): typeof fetch {
  const candidates = (Array.isArray(keys) ? keys : [keys])
    .map((key) => sanitizeApiKey(key))
    .filter((key): key is string => Boolean(key))
    .filter((key, index, all) => all.indexOf(key) === index);

  if (candidates.length === 0) {
    throw new Error("createSupabaseFetch called without a usable Supabase API key");
  }

  // Index of the key currently known to work; updated after a successful retry.
  let activeIndex = 0;

  const buildHeaders = (input: RequestInfo | URL, init: RequestInit | undefined, key: string) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, header) => headers.set(header, value));
    }

    const authorization = headers.get("Authorization");
    const authorizationIsApiKey =
      authorization !== null && candidates.some((c) => authorization === `Bearer ${c}`);

    if (isNewSupabaseApiKey(key)) {
      if (isStorageRequest(input)) {
        // Storage needs *some* Authorization header; the API key is the right
        // credential when no user JWT is attached.
        if (!authorization || authorizationIsApiKey) headers.set("Authorization", `Bearer ${key}`);
      } else if (authorizationIsApiKey) {
        headers.delete("Authorization");
      }
    } else if (authorizationIsApiKey) {
      headers.set("Authorization", `Bearer ${key}`);
    }

    headers.set("apikey", key);
    return headers;
  };

  return async (input, init) => {
    const attempt = async (key: string) =>
      fetch(input, { ...init, headers: buildHeaders(input, init, key) });

    const response = await attempt(candidates[activeIndex]!);

    if (
      candidates.length === 1 ||
      (response.status !== 401 && response.status !== 403) ||
      !isReplayable(init, input)
    ) {
      return response;
    }

    let body = "";
    try {
      body = await response.clone().text();
    } catch {
      return response;
    }
    if (!isInvalidApiKeyBody(body)) return response;

    // The configured key is not valid for this project - try the others once.
    for (let offset = 1; offset < candidates.length; offset += 1) {
      const index = (activeIndex + offset) % candidates.length;
      const retry = await attempt(candidates[index]!);
      if (retry.status !== 401 && retry.status !== 403) {
        activeIndex = index;
        return retry;
      }
    }

    return response;
  };
}
