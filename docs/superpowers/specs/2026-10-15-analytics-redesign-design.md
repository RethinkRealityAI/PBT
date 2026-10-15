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

(See the components under `admin/src/analytics/`; each tab file's header
describes its panels.)
