# PBT Admin

Standalone dashboard surface for PBT operators, served at **`/admin`** as a
second Vite entry of the main repo. Same React, same Supabase auth, same
deploy.

## Architecture

- **Build**: `vite.config.ts` declares two Rollup inputs (`index.html` +
  `admin.html`). `npm run build` produces both into `dist/`.
- **Routing**: `netlify.toml` rewrites `/admin/*` → `admin.html`; everything
  else falls through to `index.html`.
- **Auth**: Admin signs in with email + password against Supabase Auth. The
  client only holds the JWT; admin gating + cross-user reads happen server-
  side.
- **Data**: every read is a `fetch('/.netlify/functions/admin-*')` call. The
  functions verify the JWT, check `profiles.is_admin` via the service role,
  then query Supabase. The browser never sees `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy environment

In Netlify → Site configuration → Environment variables:

| Var                              | Used by              |
|----------------------------------|----------------------|
| `GEMINI_API_KEY`                 | Consumer app         |
| `VITE_SUPABASE_URL`              | Both apps + Functions|
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Both apps + Functions|
| `SUPABASE_SERVICE_ROLE_KEY`      | **Admin Functions only** |

The service role key is read at request time inside Netlify Functions and
never bundled.

## What it surfaces

| Screen     | Function                       | Source tables                      |
|------------|--------------------------------|------------------------------------|
| Overview   | admin-{users,sessions,ai-calls,scenarios} | profiles, training_sessions, ai_call_telemetry, user_scenarios |
| Users      | admin-{users,sessions}         | profiles, training_sessions        |
| Sessions   | admin-sessions                 | training_sessions (transcript inline) |
| Scenarios  | admin-scenarios                | user_scenarios                     |
| Analyzer   | admin-analyzer                 | analyzer_events                    |
| AI Quality | admin-{sessions,ai-calls}      | training_sessions, ai_call_telemetry |

## RAG export

Two outputs, populated by the consumer app on session end:

- **`rag_documents` table** — one row per session with `content` (assembled
  prompt + transcript + critique) and `metadata` (driver, pushback, scorecard,
  telemetry rollup). Indexed on `pushback_id` and `driver`. Reserved
  `embedding` column for pgvector.
- **`/admin/ai-quality` "Export sessions"** — Sessions screen toolbar invokes
  `/.netlify/functions/admin-rag-export` which streams `rag_export_v1` rows
  as JSONL ready for fine-tune / external embedder workflows.

## Granting admin

Manual SQL once for the first admin (Supabase SQL editor):

```sql
update public.profiles set is_admin = true where user_id = '<uuid>';
```

After that, an existing admin can promote others by editing rows directly —
there's no in-app invite flow yet.
