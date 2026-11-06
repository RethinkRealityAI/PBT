# ECHO quiz analytics — design (2026-11-06)

Owner ask: instructors in workshops sometimes tell trainees to "just click A"
through the ECHO personality quiz to get into the app quickly. Those profiles
pollute ECHO analytics. Detect rushed or straight-lined quizzes, flag them,
exclude them from ECHO analytics by default (with a toggle to include them),
detect what we can retroactively, and give admins a clear ECHO data view with
strong filters and CSV export.

## 1. Starting point

| Fact | Consequence |
|---|---|
| Quiz answers were kept as `DriverKey[]` only, locally; no letters, no timings | A straight-liner could not be told from a decisive person |
| Server-side: `profiles.echo_primary / echo_secondary / echo_tally` for signed-in users only (32 rows) | Anonymous results — most trainees — existed nowhere |
| The letter → driver mapping differs per question and is not shuffled | "All A" produces a fixed, recognisable tally (a fingerprint) |
| `nav_events` has `screen = 'quiz'` dwell events, anonymous too | Context for the past (visits), never results |

All-same-letter fingerprints (computed from `QUIZ_QUESTIONS`, pinned in
`src/shared/quiz/__tests__/echoScoring.test.ts`):
A → Analyzer 6 · others 3; B → Activator 8, Energizer 3, Analyzer 2,
Harmonizer 2; C → Energizer 5, Analyzer 4, Harmonizer 3, Activator 3;
D → Harmonizer 7, Energizer 4, Analyzer 3, Activator 1. One of the 32
stored profiles matches (A) — an admin account.

## 2. Recording (trainee app → `echo-quiz-save`)

- `useQuiz` records, per question, the FINAL letter + driver + ms from the
  question being shown to the tap (an undo re-times the question), the undo
  count, the tie-breaker separately, and the total. The screen passes the tap
  time (its 420 ms choice animation is not counted).
- `QuizScreen` posts on completion, fire-and-forget (`recordQuizResult`), and
  stores only `Profile.quizResultId` (inside `pbt:profile` — no new key).
- Gates: current Terms accepted (`hasAcceptedCurrentTerms`), not the admin
  preview frame (`isPreviewMode`), "Allow training data use" on
  (`allowTelemetry`; the server also refuses `allowTelemetry: false` /
  `preview: true`).
- The trainee app shows nothing different. Flags are admin-only.

## 3. Server (`netlify/functions/echo-quiz-save.ts`)

- Body ≤ 16 KB; all 15 question ids exactly once, letters A–D, ms clamped to
  0–600 000, total to 2 h, undos to 500; tie-breaker kept only when the 15
  answers really tie the top two.
- **Trust boundary:** drivers, tally, primary, secondary are DERIVED from the
  letters by `src/shared/quiz/echoScoring.ts` (the same rule `useQuiz` uses).
  A client tally is never read.
- Owner: verified JWT → `user_id`; else `anon_session_id` (device id).
  Insert-if-absent by the client's `quizId` (retries are no-ops; a row is
  never rewritten). `created_at` = database `now()`.
- Limits: per-IP `echoQuizSave` 120/min (a room of ~40 + retries),
  `echoQuizClaim` 20/min; ≤ 50 rows per device (or account) per 24 h.
- Claim (`claim: true`, signed-in): the quiz ids the device holds locally move
  to the account, guarded in the statement (`user_id is null and
  anon_session_id = <device>`). Run by the sign-in backfill before sessions.
- `account-delete` deletes the caller's rows explicitly (FK also cascades).

## 4. Storage (`20261106000000_echo_quiz_results.sql`, applied 2026-11-06)

`public.echo_quiz_results`: id, user_id (→ auth.users, cascade),
anon_session_id, source (`app` | `profile_backfill`), created_at, taken_at,
locale, answers jsonb (≤ 16), tie_breaker jsonb, primary_driver,
secondary_driver, tally, total_ms, undo_count, review_status (`auto` |
`include` | `exclude`), review_note (≤ 500), reviewed_by, reviewed_at.
CHECKs: exactly one owner; backfill rows are signed-in with no answers; app
rows have answers. RLS on, no policies, no client grants. Backfill: one
`profile_backfill` row per profile with a tally (32), idempotent via a partial
unique index.

The audit log's entity CHECK has no `echo_quiz`; widening it re-creates an
existing constraint, so it is a separate migration
(`20261106000100_audit_echo_quiz_entity.sql`) for the owner to apply. Until
then a review still saves (who / when live on the row); only its audit line is
refused (logged).

## 5. Quality flags (`src/shared/analytics/echoQuality.ts`)

Computed at READ time — thresholds are live controls, nothing is baked in:

| Flag | Rule (defaults) |
|---|---|
| Rushed | median ms per answer < 2 000 |
| Straight-lined | one letter ≥ 70 % of answers (needs ≥ 8 answers) OR a same-letter run ≥ 6 consecutive questions |
| Pattern match | a row WITHOUT answers whose tally equals an all-same fingerprint |

Letter metrics use the 15 main questions; the tie-breaker is kept apart. A
manual `include` / `exclude` overrides the automatic flag. Staff (directory
`admin_role`) are left out by default.

## 6. Admin — Analytics → ECHO (`insights.read`)

- `GET admin-analytics?op=echo` → every quiz (paged, `selectAll`), device as
  the 4-char tag + a 16-hex join key (`src/shared/analytics/device.ts`), never
  the raw id; `history` = quiz-screen dwell visits (and those < 30 s) before
  recording began; `can_review`.
- `POST admin-analytics {op:'echo-review', id, status, note}` → new
  permission **`insights.review`** ("Review ECHO quiz data"; requires
  `insights.read`; Admin + Clinical Reviewer presets). Stamps reviewer + time,
  writes an audit entry.
- Layers (`admin/src/analytics/lib/echo.ts`): filters → population (staff /
  backfill toggles) → counted (quality rules). KPIs count the population
  (completed, people + devices apart, % flagged, median time — each vs the
  previous period); distributions count only counted quizzes.
- Panels: data-quality controls + "N of M counted — left out: …"; history
  note; KPIs; filters (who, primary, quality, language, source, staff +
  search); primary / secondary share; primary × secondary matrix; completions
  over time by driver; style mix by who / language / source; question
  diagnostics (A–D share, median time, share under the threshold); results
  table with flags, counted state, Include / Exclude / Reset and expandable
  per-question answers + note.
- CSV of exactly the filtered quizzes: per quiz, or per answer (long). Device
  tag only. `lib/csv.ts` (formula-safe).
- Skills → "Communication styles": the trainee's style is their LATEST quiz
  (the device's for an anonymous session, via the join key); a flagged latest
  quiz = style unknown unless "Include flagged quizzes" (shared with the ECHO
  tab's controls, in memory).

## 7. Retroactive detection

Only what the data allows: the 32 backfilled profiles are pattern-matched
(1 match, an admin account — excluded as staff anyway). Anonymous quizzes
before this release were never stored; the tab says so and shows the quiz-
screen visit counts as context, labelled as visits.

## 8. Not done / follow-ups

- Apply `20261106000100_audit_echo_quiz_entity.sql` (owner decision).
- Tick "Review ECHO quiz data" for the stored Admin role in Team & roles (the
  stored system role rows predate the permission; Owners hold it already).
- Thresholds are per admin session (memory); persisting a team default would
  need a table.
