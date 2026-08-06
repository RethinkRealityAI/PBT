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
  functions verify the JWT, resolve the caller's role + permissions via the
  service role, then query Supabase. The browser never sees
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Authorisation**: every endpoint names the permission it needs
  (`requireAdmin(req, 'sessions.read')`). Hiding a nav entry is a convenience;
  the server check is the control.
- **Public routes**: `/admin/invite` (accept an invitation) and `/admin/reset`
  (finish a password reset) render *before* the auth gate — the people who
  land on them have no session yet. `vite dev` mirrors the Netlify rewrites so
  these work locally too.
- **Navigation**: a left rail of four sections over ten destinations
  (`admin/src/primitives/nav.ts`), with closely-related screens as tabs of one
  destination. The rail collapses to an icon strip (remembered per browser) and
  becomes an overlay drawer under 900px. Location lives in the URL hash as
  `#/destination/tab`, so screens are linkable and Back undoes a tab switch.

## Deploy environment

In Netlify → Site configuration → Environment variables:

| Var                              | Used by              |
|----------------------------------|----------------------|
| `GEMINI_API_KEY`                 | Consumer app         |
| `VITE_SUPABASE_URL`              | Both apps + Functions|
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | Both apps + Functions|
| `SUPABASE_SERVICE_ROLE_KEY`      | **Admin Functions only** |
| `EMAIL_SECRET_KEY`               | Encrypts stored email credentials (recommended) |
| `RESEND_API_KEY` / `SMTP_*`      | Optional bootstrap for email before the portal is configured |
| `APP_BASE_URL`                   | Absolute URL used to build invite + reset links |

The service role key is read at request time inside Netlify Functions and
never bundled.

`EMAIL_SECRET_KEY` is optional but recommended: without it, stored email
credentials are encrypted with a key derived from the service-role key, so
rotating Supabase keys also invalidates them. The Email → Settings screen
tells you which is in effect.

## What it surfaces

| Screen     | Function                       | Source tables                      |
|------------|--------------------------------|------------------------------------|
| Overview   | admin-{users,sessions,ai-calls,scenarios} | profiles, training_sessions, ai_call_telemetry, user_scenarios |
| Users      | admin-{users,sessions}         | profiles, training_sessions        |
| Sessions   | admin-sessions                 | training_sessions (transcript inline) |
| Scenarios  | admin-scenarios                | user_scenarios                     |
| Analyzer   | admin-analyzer                 | analyzer_events                    |
| AI Quality | admin-{sessions,ai-calls}      | training_sessions, ai_call_telemetry |
| People     | admin-{users,roles,invites,user-actions} | profiles, admin_roles, admin_invites |
| Email      | admin-email-{templates,settings,log} | email_templates, email_settings, email_log |

Destinations and their tabs:

| Section | Destination | Tabs |
|---------|-------------|------|
| Monitor | Overview | — |
| Monitor | Analytics | Insights · Traffic · AI quality |
| Monitor | Activity | Sessions · Pet Analyzer |
| People | People | Users · Admins · Roles · Invites |
| Content | Library | Scenarios · Builder · Knowledge · Simulation |
| Content | Feedback | Session feedback · Platform reports |
| Platform | Email | Templates · Settings · Delivery |
| Platform | Flags / Audit / Preview | — |

Screens don't know they're tabbed: the destination publishes its tabs through
`SectionTabsProvider`, and `ContextBar` — which every screen already renders —
picks them up. Each screen keeps its own title, range picker, search, and
export button.

## RAG export

Two outputs, populated by the consumer app on session end:

- **`rag_documents` table** — one row per session with `content` (assembled
  prompt + transcript + critique) and `metadata` (driver, pushback, scorecard,
  telemetry rollup). Indexed on `pushback_id` and `driver`. Reserved
  `embedding` column for pgvector.
- **`/admin/ai-quality` "Export sessions"** — Sessions screen toolbar invokes
  `/.netlify/functions/admin-rag-export` which streams `rag_export_v1` rows
  as JSONL ready for fine-tune / external embedder workflows.

## Roles & permissions

Access is a role plus optional per-user exceptions. The catalog lives in
`src/shared/access/permissions.ts` — one module imported by both the browser
and the Functions, so the UI and the server can never disagree about what a
permission means.

| Role | For |
|------|-----|
| **Owner** | Everything, including managing other owners. Implicitly holds every permission, present and future — which is what makes it safe as the recovery role. |
| **Admin** | Day-to-day operation. Everything except `owners.manage`. |
| **Content Manager** | Scenarios, simulation tuning, knowledge base, flags. |
| **Clinical Reviewer** | Reads sessions + quality, edits knowledge. |
| **Analyst** | Read-only analytics, sessions, AI quality; RAG export. |
| **Support** | Sees accounts, can disable/re-enable, triages feedback + reports. |
| **Comms Manager** | Email templates, provider, and invitations only. |

Custom roles are built from the same permission matrix in **Team & roles →
Roles**. Two rules keep the portal from being escalated out from under you:

- The Owner role can't be edited, and only an owner may grant it or act on
  another owner's account.
- Nobody can grant a permission they don't hold themselves — checked
  server-side on roles, invites, and per-user overrides alike.

Guardrails on account actions: you can't demote, disable, or delete your own
account, and the platform can never reach zero active owners (including under
two admins racing each other — the check is compensated post-write).

## Granting the first admin

Manual SQL once (Supabase SQL editor):

```sql
update public.profiles set admin_role = 'owner' where user_id = '<uuid>';
```

`is_admin` is kept in sync by a trigger, so existing RLS policies keep working.
After that, invite the rest of the team from **Team & roles → Invites** — they
get a branded email with a single-use link and choose their own password.

## Transactional email

Provider is **Resend** or **SMTP**, configured in **Email → Settings**.
Credentials are AES-256-GCM encrypted before they touch the database and are
never returned to the browser — the settings screen shows only a masked hint.

Templates (invite, welcome, password reset, password changed, verify address,
role changed, account disabled) are edited as content blocks with a live
preview that calls the *same* renderer the sender uses, so the preview is the
message. "Reset to default" restores the version shipped in
`src/shared/email/defaults.ts`, so a bad edit is never permanent.

Password recovery is driven by `auth-recover`, which mints the Supabase action
link server-side and delivers it through your provider with your template —
that's why reset mail looks like the product instead of like Supabase.

## Reviewing the UI without a backend

```bash
VITE_ADMIN_MOCK=1 npx vite      # then open /admin
```

Seeds a fake session and answers every function call from fixtures in
`admin/src/dev/mockApi.ts`. Add `?mock=signedout` to reach the sign-in and
recovery screens. The import is behind the env check, so production builds
never include it.
