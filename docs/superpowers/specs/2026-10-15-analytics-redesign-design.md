# Analytics redesign — design (2026-10-15)

Owner ask (paraphrased): the Overview section is partly redundant with the
analytics screens — make it ONE analytics page with tabs and sections for the
platform overview, individual sessions and individual users. Streamline it,
make it more efficient, more beautiful, better organised and more useful —
especially per-user analytics, with more (relevant) detail collected.

## 1. What was wrong

| Problem | Where | Consequence |
|---|---|---|
| Three Monitor destinations repeating each other | Overview · Analytics [Insights · Traffic · AI quality] · Activity [Sessions · Pet Analyzer] | The same average score, finish rate and "needs review" list on two screens, fetched twice with different caps — so they could disagree |
| No per-trainee analytics | People → Users modal: 4 counts and a sparkline | A manager could not answer "who needs coaching, on what?" |
| **Supabase returns at most 1,000 rows per request** | every admin list read (`limit` up to 5,000 was silently ignored) | Traffic counted only the newest 1,000 events (≈ 8 days at current volume) for ANY range; sessions capped likewise |
| Failed scorings counted as 0 | Users list average, user modal, AI quality "Sessions scored under 60" | A scorer outage looked like terrible trainees |
| `training_sessions.flagged` is never written | Overview "Flagged sessions" tile, Sessions "Flagged" filter | A metric that was always 0 |
| `user_scenarios.plays` / `avg_score` never written | user modal "0 plays" pills | Read as a fact |
| Names came from `admin-users` (`team.read`) | Sessions screen | The Analyst role (no `team.read`) got an error instead of the session list |
| Transcripts shipped in every list | `admin-sessions` | Heaviest payload in the portal, for screens that never show a transcript |
| Every tab switch refetched everything | `useQuery` | Slow, and wasteful on the Functions budget |
| No device / install / language context | trainee-app telemetry | "What do my trainees use?" unanswerable; voice sessions never logged a start |

## 2. Information architecture

`Monitor` is one destination, **Analytics** (`admin/src/primitives/nav.ts`):

| Tab | Key | Permission | Replaces |
|---|---|---|---|
| Overview | `overview` | `overview.read` | the Overview destination |
| Trainees | `trainees` | `sessions.read` | — (new) |
| Sessions | `sessions` | `sessions.read` | Activity → Sessions |
| Skills | `skills` | `insights.read` | Analytics → Insights |
| Engagement | `engagement` | `analytics.read` | Analytics → Traffic |
| AI quality | `quality` | `quality.read` | unchanged (low-score list moved out) |
| Pet Analyzer | `analyzer` | `analyzer.read` | Activity → Pet Analyzer |

Routes gain an optional record segment (`admin/src/lib/route.ts`):
`#/analytics/trainees/<user id>` is a trainee's profile and
`#/analytics/sessions/<session id>` opens a session — both linkable,
bookmarkable and Back-able. `legacyRoute()` rewrites `#/overview`,
`#/activity/…`, `#/analytics/insights` and `#/analytics/traffic`.

The date range and search box are shared across the tabs (owned by `App`),
and every headline is compared with the **previous window of the same
length** ("▲ 12% vs previous 28 days").

## 3. Data

**Contract** — `src/shared/analytics/contract.ts` (types only, imported by the
functions and the portal).

**Server** (all derived from rows the app already writes — no migration):

- `admin-sessions?view=summary` → `SessionSummary[]`: no transcript; derived
  per-session facts — skill scores, start time, scenario source/title/species,
  owner mood at the end (`transcript[].emotion`), owner sentiment start/end
  (`score_report.turnSentiment`), trainee words per reply, median reply time,
  coach hints used (from `coach_hint_request` events), key wins/misses.
  `?id=` returns one full row (transcript included) when a session is opened.
- `admin-analytics` (GET):
  - `op=directory` (`sessions.read`) — everyone with a profile, named; email
    only with `team.read`; last sign-in from Supabase Auth.
  - `op=engagement` (`analytics.read`) — `nav_events` aggregated on the server
    over EVERY row in the window (paged; hard cap reported as `truncated`):
    totals for the current and previous window, trend, screens, actions,
    weekday × hour heat map in the admin's timezone, return-frequency
    histogram, device context, per-user activity.
  - `op=trainee&id=` (`sessions.read`) — one trainee's sessions plus each
    optional section only when the caller holds ITS permission (activity:
    `analytics.read`, feedback: `feedback.read`, scenarios: `scenarios.read`,
    analyzer: `analyzer.read`, reports: `reports.read`, AI usage:
    `quality.read`); `withheld` names what was left out.
- `netlify/functions/_shared/paging.ts` — `.range()` paging past the 1,000-row
  limit, used by every read above.

**Client** — `admin/src/data/cache.ts`: a keyed cache with stale-while-
revalidate (60 s) shared by every tab; `admin/src/analytics/data.ts` holds the
hooks. Sessions are fetched for twice the window so deltas need no second
request.

**Metrics** — `admin/src/analytics/lib/` (pure, unit-tested): `period.ts`
(windows, deltas, buckets), `metrics.ts` (the ONE definition of average score,
finish rate, skills, trend, breakdowns), `trainees.ts` (roster rollup, status,
streaks, momentum, coaching notes), `csv.ts` (formula-safe export).

Rules every number obeys: a score is real only when the session finished, was
scored and the scoring didn't fail (`isScored`); difficulty is context beside a
score, never a weight; nothing averages a missing value as 0.

## 4. Trainee status

| Status | Rule |
|---|---|
| Active | practised in the last 7 days |
| At risk | last practised 8–21 days ago — when a nudge still works |
| Dormant | nothing for over 21 days |
| Not started | has an account, never practised |
| New (badge) | joined in the last 14 days |

Momentum = mean of the latest 5 scored sessions minus the 5 before (needs
2 + 2). Streaks count local calendar days with a session; today without one
doesn't break the streak until the day is over.

## 5. Collection added (trainee app)

All through `logEvent`, so the privacy opt-out and the admin preview gate
apply unchanged; no schema change (`nav_events.meta`):

- `app_open` (`src/lib/analytics.ts`, `src/lib/deviceContext.ts`) — once per
  app start and again after ≥ 30 min in the background: device class, OS
  family, installed-or-browser, app language, theme preference, IANA timezone.
  Deliberately coarse — no versions, models or resolution; not a fingerprint.
- Voice sessions now log `session_open` (`meta.mode = 'voice'`) when the Live
  socket opens.

Known gap: the trainee app ships no web manifest, so "installed" is false for
everyone until one does.

## 6. Tabs

Every tab: its own title, the shared range picker, and headline tiles that
compare with the previous window of the same length. Every chart's numbers
are reachable without hovering (a value on the mark, a "View as table"
toggle, or a table). Loading shows the final layout in grey; errors go
through `QueryBoundary`; a panel that needs another permission hides (or
says what's hidden) instead of firing a request that would be refused.

**Overview** (`OverviewTab.tsx`, `overview/`) — the 30-second answer.
- A narrative headline (`lib/narrative.ts`): who practised, how often vs
  before, the team average vs before, the weakest skill, who improved most —
  names link to profiles; honest when the window is empty or thin.
- "Your team" bar: Active · At risk · Dormant · Not started.
- Six tiles: trainees practising, sessions, average score, finish rate,
  practice time, owners won over (finished sessions whose AI owner ended
  happy).
- **Needs your attention** (`lib/attention.ts`), most severe first: AI
  failure / slow-reply alerts (`quality.read`), open problem reports
  (`reports.read`), sessions under 55, trainees slipping, scoring failures,
  people who joined over a week ago and never practised — each a link to
  where you act on it; "All clear" lists what was checked.
- Leaders: most improved (latest 5 vs previous 5) and most active.
- Practice activity (finished vs left early) and Average score (separate
  charts — never two axes), Skills at a glance vs the previous window,
  Getting-started funnel, a one-line AI health strip (`quality.read`).
- Removed as redundant or dead: the ECHO-driver spread (Trainees shows
  drivers per person), built-scenario and token counts, flagged sessions.

**Trainees** (`TraineesTab.tsx`, `trainee/`) — per-person analytics.
- Roster: four tiles (practising now, at risk → filters, improving vs
  slipping, sessions per active trainee), status chips with counts, a
  sortable table (status, sessions + 8-week sparkline, average + momentum,
  five skill mini-bars with the weakest named, streak, last active), CSV.
- Profile (`#/analytics/trainees/<id>`): identity card (driver, role,
  joined, last active, language, device), **coaching notes**
  (`coachingNotes` — each backed by a number on the page), six tiles,
  score progression (each session, 5-session rolling average, team average),
  skill profile vs team, objections weakest-first plus "not tried yet",
  difficulty, a 26-week practice calendar (sessions, and days they only
  opened the app), practice style (typed vs spoken, length, words per reply,
  reply time, hints, how owners ended), recent sessions, and — each only with
  its permission — feedback they gave, scenarios built, pet tools, app
  activity, problems reported, AI usage and cost.

**Sessions** (`SessionsTab.tsx`, `sessions/`) — the explorer. Outcome chips
(Finished · Left early · Scoring failed · Low score), filters (mode,
difficulty, objection, animal, scenario source), a summary strip for the
filtered set, sortable columns, 50 at a time, CSV; the trainee name opens
their profile. `#/analytics/sessions/<id>` opens the session modal on a
skeleton while the transcript loads (404 → toast and close).

**Skills** (`SkillsTab.tsx`, `skills/`) — outcomes. Tiles (average, pass
rate, owners won over, scored sessions), skill breakdown vs previous window
with a coaching callout for the weakest, score trend, the **objection ×
skill** table (band-tinted, the hardest cell outlined and named), difficulty
(same standard at every level), ECHO **communication-style matchups**
(trainee driver × owner driver), score distribution, animal and scenario
source, how owners felt (start → end sentiment), trainee feedback.

**Engagement** (`EngagementTab.tsx`, `engagement/`) — app usage, from the
server-side aggregate. Tiles (people, signed-in trainees, returning %,
screens per person, time in app, sessions started), a people / screen-views
trend (one at a time), the weekday × hour heat map with its peak sentence,
feature adoption, the onboarding path, where time goes vs most-opened
screens, return frequency, most-used actions, and devices & context.

**AI quality** keeps its charts; its tiles became shares with deltas and the
low-*training*-score list moved out (Sessions filter, Overview attention).
**Pet Analyzer** is unchanged, now a tab here.

## 7. People → Users

Account management stays there. Its averages now exclude failed and missing
scores, the never-written "plays" pills are gone, ended reasons read in
words, and the user card links to the person's Analytics profile ("Full
analytics →").

## 8. Verification

Unit tests for every pure helper (`admin/src/analytics/lib/__tests__`,
`src/shared/analytics/__tests__`), function tests (`adminAnalytics`,
`adminSessions`, `adminListPaging`, `paging`), the label-exhaustiveness and
no-emoji guards, and screenshots of every tab against the seeded mock at
1440 / 1280 / 900 / 820 px with no horizontal overflow and no console errors.

## 9. Anonymous sessions and language (follow-up, 2026-10-15)

**Problem.** PBT is anonymous-first, but only signed-in sessions reached
`training_sessions`: the app upserts its own row under RLS, and an anonymous
trainee has no row it may write. An anonymous session left only app-usage
events and AI-call telemetry. On 1 October 2026, 79 anonymous devices (mostly
French, per the product owner) opened ~60 text and ~90 voice sessions that
Analytics → Sessions could not see; the 5 ratings in Feedback were all
anonymous and pointed at sessions that did not exist.

**Recording (from this release).** Migration
`20261015000000_anonymous_sessions.sql` makes `user_id` nullable and adds
`anon_session_id` (the random per-device id in `pbt:session_id`), `locale`
and `origin`. Only the server writes anonymous rows: `session-save` (the
conversation when it ends or is left — no score) and `ai-evaluate` (the
score, with `anonSessionId`). Both refuse rows owned by an account or another
device and write nothing with `allowTelemetry: false` or in a preview. On
sign-in, the backfill claims the device's anonymous rows among its local
sessions (`session-save` `claim: true`) so a complete row keeps its verified
score. The Terms say so (en + fr; no version bump — see CLAUDE.md
"Outstanding work" 0(i)).

**History.** The migration rebuilds one `origin = 'reconstructed'` row per
anonymous TEXT session the app announced with `session_open` (~115 rows, 60 on
1 Oct): when, objection, mode, device, duration, and whether it reached the
scorecard (a `stats` screen view on the same device before its next session,
within 90 minutes) or was left (`session_abandon`); otherwise the ending is
unknown. Transcripts and scores were never stored and cannot be recovered;
anonymous voice sessions logged no `session_open` and cannot be rebuilt.

**Display.** An anonymous session counts as a session (and its score in every
average) but never as a person; people are reported as signed-in trainees +
anonymous devices. Sessions gains Who and Language filters, a hashed device
tag, "Rebuilt" and "Ending not recorded"; Skills gains a "Score by group"
panel (language, who, animal, source); Trainees links its anonymous count to
Sessions; Feedback (moved to Monitor) gains a Who column and opens the rated
session. Rules: `admin/src/analytics/lib/who.ts`.
