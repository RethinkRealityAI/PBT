# PBT — Pushback Training

AI-driven training simulator for veterinary teams. Practise the awkward client
conversations — cost objections, breeder advice, raw-food evangelism,
prescription-diet scepticism — against an AI role-play customer (text or live
voice), then get an ACT-first scorecard (Acknowledge · Clarify · Transform,
plus Empathy and Rapport) and track improvement over time.

Personality system: the ECHO 4-driver model (Activator · Energizer · Analyzer ·
Harmonizer). Also includes a Pet Analyzer (body/muscle condition + Pet Vision
photo analysis), **Fecal Scan** (stool photo scored against the Royal Canin
Fecal Scoring System charts, RAG-grounded), a full fr-CA translation, and an
admin dashboard at `/admin`. AI is Google Gemini, called **only from Netlify
Functions** — the key never reaches a browser.

> **For contributors and AI agents:** [`CLAUDE.md`](CLAUDE.md) is the detailed,
> maintained architecture reference (trust boundaries, knowledge scopes,
> migrations, translation rules, conventions). Read it before changing code.

## Quick start

```bash
npm install
cp .env.example .env.local   # if present; otherwise create it (see below)
netlify dev                  # serves the app on :3006 AND the functions
```

`vite` alone (`npm run dev`) serves the UI with **no AI** — every AI feature
lives in `netlify/functions/ai-*`, so use `netlify dev` for local AI work.

Environment variables (Netlify → Site configuration → Environment variables in
production; `.env.local` / `netlify env` locally):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Functions (runtime only) | Every AI call. **Never** create a `VITE_GEMINI_*` variable — a `VITE_` prefix compiles it into the browser bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions (secret) | Admin reads/writes, score writes, knowledge sync. Never in the browser. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Build (public) | Cloud sync + admin sign-in. Optional — without them the app runs anonymously on `localStorage`. |
| `EMAIL_SECRET_KEY` | Functions (secret) | Encrypts email-provider credentials stored via the admin UI. |

The full list (email provider, `APP_BASE_URL`, dev-only flags) is in
`docs/handover/handover.html` → *Environment variables*.

## Scripts

```
netlify dev              # app + functions locally (use this for AI features)
npm run dev              # Vite only, port 3006, no AI
npm run dev:admin-mock   # admin dashboard against mock data (UI work)
npm test                 # Vitest, single run (~1,100 tests)
npm run typecheck        # tsc --noEmit
npm run build            # production bundle → dist/
npm run check:bundle     # after build: main entry < 500 kB gzip + no key-shaped strings
npm run verify:db        # probes the live Supabase project for every relation the code uses
npm run knowledge:sync   # re-seed the RAG knowledge base by hand (normally automatic)
```

## Architecture (short)

```
src/            consumer PWA — app shell, screens, features (chat, scorecard,
                fecal-scan, pet-analyzer, …), i18n (en + fr), shared/ (code
                shared with the functions: AI contract, access control, email)
admin/          admin dashboard (second Vite entry, served at /admin)
netlify/        functions (every AI + admin call, permission-checked) and the
                knowledge-sync build plugin
supabase/       hand-run SQL migrations — adding a file does NOT apply it
docs/           handover pack (PDF + source), design specs
```

## Testing

```
npm test
```

Vitest + React Testing Library, plus node-environment tests for the Netlify
Functions. Guards that run in the normal suite: schema parity (every
`.from('<table>')` must be created by a migration), translation catalog parity
(no missing keys, English stubs or `{token}` drift), English prompt
byte-parity, and the Fecal Scan grounding / image-match rules. Gemini is mocked
at the module boundary — see `src/services/__tests__/geminiService.test.ts`.

Before shipping a change that touches the database: apply its migration to the
target project, then run `npm run verify:db`.

## Deployment

Netlify builds `main` on every push (`npm ci && npm run build`). The
knowledge base re-seeds itself after production deploys. See `CLAUDE.md` →
*Database migrations & deploy alignment* and the handover pack in
`docs/handover/`.
