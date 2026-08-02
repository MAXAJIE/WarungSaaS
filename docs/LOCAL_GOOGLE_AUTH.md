# Google sign-in on a local / self-hosted deploy

Inside the Lovable editor and preview, Google sign-in goes through Lovable's
auth broker. That broker only accepts Lovable-hosted origins, so on
`http://localhost:8080` it fails (invalid origin / redirect) and the button
appears broken.

The app now detects the origin in `src/lib/google-auth.ts`:

- Lovable-hosted origin (`*.lovable.app`, `*.lovable.dev`,
  `*.lovableproject.com`) -> keep using the Lovable broker.
- Any other origin (localhost, your own domain) -> call Supabase Auth directly
  with `redirectTo: <origin>/auth-callback`, and finish the session on the new
  public `/auth-callback` route.

## One-time setup for local use

1. Supabase dashboard -> **Authentication -> Providers -> Google**: enable it and
   paste your Google OAuth client ID + secret.
2. Supabase dashboard -> **Authentication -> URL Configuration** -> Redirect URLs,
   add:
   - `http://localhost:8080/auth-callback`
   - `https://<your-domain>/auth-callback`
3. Google Cloud console -> your OAuth client -> Authorized redirect URIs, add:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your local
   `.env` (already read by `src/integrations/supabase/client.ts`).

Then `npm run dev`, open `/auth`, click **Google**: you are sent to Google, back
to `/auth-callback`, and on to `/dashboard`.
