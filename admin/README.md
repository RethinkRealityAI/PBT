# PBT Admin

Standalone Vite + React 19 dashboard for PBT operators. Reads telemetry written
by the consumer app (`/home/user/PBT/src`) directly from Supabase. Admin
gating is enforced server-side: the consumer schema's `profiles.is_admin` flag
plus admin RLS policies (see `supabase/migrations/20260507000000_admin_telemetry.sql`)
mean a non-admin token sees zero rows.

Deploy as `admin.<your-domain>`.

## Local dev

```bash
cd admin
npm install
cp ../.env .env.local   # supplies VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## What it surfaces

| Screen     | Tables read                                                    |
|------------|----------------------------------------------------------------|
| Overview   | profiles, training_sessions, ai_call_telemetry, user_scenarios |
| Users      | profiles, training_sessions                                    |
| Sessions   | training_sessions (+ transcript drawer)                        |
| Scenarios  | user_scenarios                                                 |
| Analyzer   | analyzer_events                                                |
| AI Quality | training_sessions, ai_call_telemetry                           |

## RAG export

Edge function `supabase/functions/rag-export` streams `rag_export_v1` rows as
JSONL. Authenticate with an admin JWT:

```bash
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "https://<project>.functions.supabase.co/rag-export?since=2026-01-01&completed=true" \
  > rag.jsonl
```

Each line is a session bundle: `{scenario, transcript, score_report,
ai_signals, turn_signals, driver, pushback_id, …}`.

## Granting admin

```sql
update public.profiles set is_admin = true where user_id = '<uuid>';
```

There is no in-app admin invite flow; do this manually in the Supabase SQL
editor for the first admin, then they can promote others.
