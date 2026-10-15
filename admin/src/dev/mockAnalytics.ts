/**
 * Offline fixtures for the Analytics destination (`npm run dev:admin-mock`).
 *
 * A seeded, deterministic team: ~20 trainees with different habits (a
 * steady improver, a lapsed one, someone who never started, a heavy coach-
 * hint user…), ~4 months of sessions with real transcripts and score
 * reports, and app-usage events. The summaries, engagement report and
 * trainee profiles are then derived with the SAME shared functions the
 * Netlify Functions run (`src/shared/analytics/*`), so what the mock shows is
 * what production would compute from the same rows.
 *
 * Nothing here ships: it is only reachable through `mockApi.ts`, which
 * `main.tsx` imports behind `VITE_ADMIN_MOCK`.
 */
import type {
  EngagementReport,
  SessionSummary,
  TraineeDetail,
  TraineeDirectoryEntry,
} from '../../../src/shared/analytics/contract';
import { toSessionSummary } from '../../../src/shared/analytics/sessionSummary';
import { aggregateEngagement, aggregateTraineeActivity } from '../../../src/shared/analytics/engagement';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

// ── deterministic randomness ─────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261015);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const uid = (n: number) => `0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sid = (n: number) => `5e550000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── the team ──────────────────────────────────────────────────────────────
type Habit = {
  /** Sessions per week while active. */
  rate: number;
  /** Days since they last practised (0 = practising now). */
  lastGap: number;
  /** Days ago they joined. */
  joined: number;
  /** Starting skill level and how fast it improves per session. */
  base: number;
  slope: number;
  /** Per-skill offsets: acknowledge, clarify, transform, empathy, rapport. */
  shape: [number, number, number, number, number];
  voice: number;
  finish: number;
  hints: number;
};

interface Person {
  id: string;
  name: string;
  email: string;
  driver: 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';
  secondary: 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer' | null;
  role: string | null;
  locale: 'en' | 'fr';
  habit: Habit | null;
  device: 'mobile' | 'tablet' | 'desktop';
  os: string;
  installed: boolean;
}

const P = (
  n: number,
  name: string,
  driver: Person['driver'],
  role: string | null,
  habit: Habit | null,
  extra: Partial<Person> = {},
): Person => ({
  id: uid(n),
  name,
  email: `${name.split(' ')[0].toLowerCase()}@vetgroup.ca`,
  driver,
  secondary: null,
  role,
  locale: 'en',
  habit,
  device: 'mobile',
  os: 'ios',
  installed: true,
  ...extra,
});

const H = (h: Partial<Habit>): Habit => ({
  rate: 2,
  lastGap: 1,
  joined: 110,
  base: 62,
  slope: 0.6,
  shape: [4, -2, -8, 6, 0],
  voice: 0.2,
  finish: 0.85,
  hints: 0.6,
  ...h,
});

export const MOCK_PEOPLE: Person[] = [
  P(1, 'Dapo Ajisafe', 'Activator', 'owner', H({ rate: 0.6, lastGap: 3, base: 74, slope: 0.3 }), { device: 'desktop', os: 'macos', installed: false }),
  P(2, 'Marie Tremblay', 'Harmonizer', 'content_manager', H({ rate: 3, lastGap: 0, base: 58, slope: 1.1, shape: [6, -4, -10, 10, 4] }), { locale: 'fr' }),
  P(3, 'Sam Okafor', 'Analyzer', 'analyst', H({ rate: 1.5, lastGap: 2, base: 70, slope: 0.4, shape: [-2, 8, 2, -8, -4], voice: 0 }), { device: 'desktop', os: 'windows', installed: false }),
  P(4, 'Priya Raman', 'Energizer', 'support', H({ rate: 2.5, lastGap: 11, base: 60, slope: 0.7, shape: [2, -6, -6, 4, 10] })),
  P(5, 'Jonah Reed', 'Analyzer', 'clinical_reviewer', H({ rate: 1, lastGap: 34, joined: 120, base: 66, slope: 0.2 }), { os: 'android' }),
  P(6, 'Alex Chen', 'Energizer', null, H({ rate: 4, lastGap: 0, base: 52, slope: 1.4, hints: 2.2, shape: [4, -6, -12, 6, 6] })),
  P(7, 'Rowan Ellis', 'Harmonizer', null, H({ rate: 1, lastGap: 58, joined: 120, base: 55, slope: 0.1 }), { os: 'android', installed: false }),
  P(8, 'Chloé Gagnon', 'Harmonizer', null, H({ rate: 2.5, lastGap: 1, base: 64, slope: 0.9, voice: 0.6 }), { locale: 'fr', device: 'tablet' }),
  P(9, 'Ben Morales', 'Activator', null, H({ rate: 2, lastGap: 4, base: 68, slope: -0.3, shape: [-6, -10, 6, -8, -4], finish: 0.55 }), { os: 'android' }),
  P(10, 'Hana Sato', 'Analyzer', null, H({ rate: 3, lastGap: 0, base: 72, slope: 0.8, shape: [0, 10, 4, -6, -2], voice: 0.1 }), { device: 'desktop', os: 'macos', installed: false }),
  P(11, 'Liam O’Connor', 'Energizer', null, H({ rate: 1.2, lastGap: 16, base: 57, slope: 0.5 })),
  P(12, 'Fatima Haddad', 'Harmonizer', null, H({ rate: 2.2, lastGap: 2, joined: 9, base: 61, slope: 1.2 }), { os: 'android' }),
  P(13, 'Noah Patel', 'Activator', null, H({ rate: 1.6, lastGap: 6, joined: 12, base: 49, slope: 1.6, hints: 1.4 })),
  P(14, 'Grace Kim', 'Analyzer', null, null, { device: 'desktop', os: 'windows', installed: false }),
  P(15, 'Olivier Roy', 'Activator', null, null, { locale: 'fr', os: 'android' }),
  P(16, 'Ava Thompson', 'Harmonizer', null, H({ rate: 2.8, lastGap: 0, base: 76, slope: 0.6, voice: 0.45 })),
  P(17, 'Mateo Silva', 'Energizer', null, H({ rate: 0.8, lastGap: 25, base: 59, slope: 0.3 }), { os: 'android' }),
  P(18, 'Zoe Martin', 'Activator', null, H({ rate: 2, lastGap: 3, joined: 5, base: 63, slope: 0.4 }), { device: 'tablet', installed: false }),
  P(19, 'Isaac Cohen', 'Analyzer', null, H({ rate: 1.4, lastGap: 9, base: 70, slope: 0.5, finish: 0.7 }), { device: 'desktop', os: 'linux', installed: false }),
  P(20, 'Nadia Fischer', 'Harmonizer', null, null, { joined: 3 } as Partial<Person>),
];

const OBJECTIONS = ['cost', 'weight-denial', 'rx-diet', 'raw-food', 'breeder-advice', 'brand-switch', 'team:probiotic-doubt'];
const OBJECTION_TITLES: Record<string, string> = {
  cost: 'Cost / price pushback',
  'weight-denial': 'Weight / obesity denial',
  'rx-diet': 'Skepticism on Rx diet',
  'raw-food': 'Grain-free / trend belief',
  'breeder-advice': 'Friend / breeder said…',
  'brand-switch': 'Switching brands hesitation',
  'team:probiotic-doubt': 'Doubts probiotics work',
};
/** How hard each objection is for this team (score offset). */
const OBJECTION_DIFFICULTY: Record<string, number> = {
  cost: 4,
  'weight-denial': -9,
  'rx-diet': -4,
  'raw-food': -6,
  'breeder-advice': 2,
  'brand-switch': 5,
  'team:probiotic-doubt': -2,
};
const DRIVERS = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'] as const;
const PERSONAS = ['Skeptical', 'Anxious', 'Busy', 'Bargain-hunter', 'Devoted'];
const DOG_BREEDS = ['Labrador Retriever', 'French Bulldog', 'Golden Retriever', 'German Shepherd', 'Beagle', 'Dachshund'];
const CAT_BREEDS = ['Domestic Shorthair', 'Maine Coon', 'Siamese', 'Ragdoll'];

// ── raw session rows (the shape training_sessions holds) ─────────────────
interface RawRow {
  id: string;
  user_id: string;
  scenario: Record<string, unknown>;
  scenario_summary: string;
  pushback_id: string;
  driver: string;
  transcript: Array<{ role: 'user' | 'ai'; text: string; timestamp: number; emotion?: 'red' | 'yellow' | 'green' }>;
  score_report: Record<string, unknown> | null;
  score_overall: number | null;
  duration_seconds: number;
  mode: 'text' | 'voice';
  completed: boolean;
  ended_reason: string;
  flagged: boolean;
  flag_reason: null;
  model_id: string;
  turns: number;
  created_at: string;
}

const OWNER_LINES = [
  'Honestly, this food costs twice what I pay at the pet store.',
  'My breeder said this brand is all she ever needs.',
  'I just don’t think she’s overweight — she’s big-boned.',
  'Why would I trust a prescription diet over what I cook at home?',
  'Fine. What would you actually suggest, then?',
  'That makes sense, I suppose. Can we try it for a month?',
];
const STAFF_LINES = [
  'I completely hear you — price matters, and you want to be sure it’s worth it.',
  'Can I ask what you’re feeding her right now, and how much each day?',
  'What worries you most about switching?',
  'Many owners feel the same at first. Here’s what we usually see in the first few weeks.',
  'How about a four-week trial, then we weigh her together and decide?',
];

const rawRows: RawRow[] = [];
const hintEvents: Array<{ user_id: string; sessionId: string; at: number }> = [];
let sessionN = 0;

for (const person of MOCK_PEOPLE) {
  const h = person.habit;
  if (!h) continue;
  const start = NOW - h.joined * DAY + 2 * DAY;
  const end = NOW - h.lastGap * DAY;
  let t = start + between(0, 2) * DAY;
  let k = 0;
  while (t < end) {
    k++;
    sessionN++;
    const id = sid(sessionN);
    const pushback = pick(OBJECTIONS);
    const species = rand() < 0.22 ? 'cat' : 'dog';
    // Most practice is at the easier levels; harder owners appear as a trainee progresses.
    const difficulty = (Math.min(4, 1 + Math.floor(rand() * Math.min(4, 1.6 + k / 12))) as 1 | 2 | 3 | 4);
    const mode: 'text' | 'voice' = rand() < h.voice ? 'voice' : 'text';
    const completed = rand() < h.finish;
    const ownerDriver = pick(DRIVERS);
    // Learning curve that levels off (≈ slope × 14 points at most), not a straight line to 100.
    const learned = h.slope * 14 * (1 - Math.exp(-k / 14));
    const skillLevel = clamp(h.base + learned + OBJECTION_DIFFICULTY[pushback] - (difficulty - 2) * 4 + between(-8, 8));
    const skills = {
      acknowledge: Math.round(clamp(skillLevel + h.shape[0] + between(-5, 5))),
      clarify: Math.round(clamp(skillLevel + h.shape[1] + between(-5, 5))),
      transform: Math.round(clamp(skillLevel + h.shape[2] + between(-5, 5))),
      empathy: Math.round(clamp(skillLevel + h.shape[3] + between(-5, 5))),
      rapport: Math.round(clamp(skillLevel + h.shape[4] + between(-5, 5))),
    };
    const overall = Math.round(
      skills.acknowledge * 0.24 + skills.clarify * 0.24 + skills.transform * 0.22 + skills.empathy * 0.18 + skills.rapport * 0.12,
    );
    const failed = completed && rand() < 0.03;
    const turns = completed ? 8 + Math.floor(rand() * 8) : 2 + Math.floor(rand() * 4);
    const duration = Math.round(turns * between(22, 48));
    // Practice clusters in the morning before clinic and over lunch.
    const day = new Date(t);
    day.setHours(pick([7, 8, 8, 12, 12, 13, 17, 19, 20]), Math.floor(rand() * 60), 0, 0);
    const endAt = day.getTime() + duration * 1000;
    if (endAt > NOW) break;
    const transcript: RawRow['transcript'] = [];
    let clock = day.getTime();
    const resolved = overall >= 72 ? 'green' : overall >= 58 ? 'yellow' : 'red';
    for (let i = 0; i < turns; i++) {
      const ai = i % 2 === 0;
      clock += (ai ? between(3, 6) : between(9, 40)) * 1000;
      const last = i >= turns - 2;
      transcript.push(
        ai
          ? { role: 'ai', text: pick(OWNER_LINES), timestamp: clock, emotion: last && completed ? resolved : i < 2 ? 'red' : 'yellow' }
          : { role: 'user', text: pick(STAFF_LINES), timestamp: clock },
      );
    }
    const sentiments = transcript
      .map((m, idx) => ({ idx, speaker: m.role === 'ai' ? 'customer' : 'staff', sentiment: 0 }))
      .map((e, i, arr) => ({
        ...e,
        sentiment: Number(
          (e.speaker === 'customer' ? -0.7 + ((overall - 40) / 60) * 1.4 * (i / Math.max(1, arr.length - 1)) : 0.3).toFixed(2),
        ),
      }));
    const report = completed
      ? failed
        ? { acknowledge: 0, clarify: 0, transform: 0, empathy: 0, rapport: 0, overall: 0, band: 'poor', scoreUnavailable: true, critique: '' }
        : {
            ...skills,
            overall,
            band: overall >= 75 ? 'good' : overall >= 55 ? 'ok' : 'poor',
            critique: 'Strong acknowledgement; the next step came late and without a concrete plan.',
            betterAlternative: 'Offer a four-week trial with a weigh-in booked before they leave.',
            perDimensionNotes: {},
            keyMoments: [
              { ts: 1, type: 'win', label: 'Named the worry', quote: STAFF_LINES[0] },
              ...(skills.transform < 65 ? [{ ts: 5, type: 'miss', label: 'No next step', quote: STAFF_LINES[3] }] : []),
            ],
            turnSentiment: sentiments,
          }
      : null;
    const breed = species === 'cat' ? pick(CAT_BREEDS) : pick(DOG_BREEDS);
    const source = rand();
    rawRows.push({
      id,
      user_id: person.id,
      scenario: {
        species: species === 'cat' ? 'cat' : undefined,
        breed,
        age: pick(['Junior (1-3)', 'Adult (3-7)', 'Senior (7+)']),
        pushback: { id: pushback, title: OBJECTION_TITLES[pushback], example: '' },
        persona: pick(PERSONAS),
        difficulty,
        suggestedDriver: ownerDriver,
        ...(source < 0.55 ? { _overrideId: `seed:${Math.floor(rand() * 3)}` } : source < 0.85 ? { _overrideId: 'admin:7c1d' } : {}),
      },
      scenario_summary: `${breed} · ${OBJECTION_TITLES[pushback]}`,
      pushback_id: pushback,
      driver: ownerDriver,
      transcript,
      score_report: report,
      score_overall: report ? (report.overall as number) : null,
      duration_seconds: duration,
      mode,
      completed,
      ended_reason: completed ? 'completed' : pick(['user_exit', 'user_exit', 'abandoned', 'timeout']),
      flagged: false,
      flag_reason: null,
      model_id: mode === 'voice' ? 'gemini-3.1-flash-live-preview' : 'gemini-3-flash-preview',
      turns,
      created_at: new Date(endAt).toISOString(),
    });
    if (mode === 'text') {
      const hints = Math.min(3, Math.floor(between(0, h.hints * 1.6)));
      for (let i = 0; i < hints; i++) hintEvents.push({ user_id: person.id, sessionId: id, at: day.getTime() + (i + 1) * 60_000 });
    }
    t += (7 / h.rate) * between(0.4, 1.6) * DAY;
  }
}
rawRows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

const hintsBySession = new Map<string, number>();
for (const e of hintEvents) hintsBySession.set(e.sessionId, (hintsBySession.get(e.sessionId) ?? 0) + 1);

const SUMMARIES: SessionSummary[] = rawRows.map((r) => toSessionSummary(r as never, { hintsBySession }));
// What `applyScenarioTitles` does on the server: a Studio scenario is named by
// its card title, not its objection.
for (const s of SUMMARIES) if (s.scenario_id === 'admin:7c1d') s.scenario_title = 'Senior lab, cost-sensitive owner';

// ── app-usage events (nav_events rows) ────────────────────────────────────
interface NavRow {
  user_id: string | null;
  anon_session_id: string | null;
  event_type: string;
  screen: string | null;
  target: string | null;
  meta: Record<string, unknown> | null;
  dwell_ms: number | null;
  created_at: string;
}
const NAV: NavRow[] = [];
const FLOW = ['home', 'create', 'chat', 'stats', 'history', 'home'];
const BROWSE = ['home', 'resources', 'actGuide', 'analyzer', 'fecalScan', 'settings', 'history', 'historyDetail'];

function visit(person: Person | null, at: number, anon: string, withSession: RawRow | null) {
  const userId = person?.id ?? null;
  const ctx = person ?? { device: pick(['mobile', 'mobile', 'desktop'] as const), os: pick(['ios', 'android', 'windows']), installed: false, locale: 'en' as const };
  NAV.push({
    user_id: userId,
    anon_session_id: anon,
    event_type: 'custom',
    screen: 'home',
    target: 'app_open',
    meta: { device: ctx.device, os: ctx.os, installed: ctx.installed, locale: ctx.locale, theme: pick(['light', 'system', 'dark']), tz: 'America/Toronto' },
    dwell_ms: null,
    created_at: new Date(at).toISOString(),
  });
  const screens = withSession ? FLOW : [pick(BROWSE), pick(BROWSE), 'home'];
  let clock = at;
  for (const screen of screens) {
    clock += between(5, 40) * 1000;
    NAV.push({ user_id: userId, anon_session_id: anon, event_type: 'screen_view', screen, target: null, meta: null, dwell_ms: null, created_at: new Date(clock).toISOString() });
    const dwell = Math.round(screen === 'chat' && withSession ? (withSession.duration_seconds ?? 200) * 1000 : between(4, 70) * 1000);
    if (screen === 'chat' && withSession && withSession.mode === 'text') {
      NAV.push({
        user_id: userId,
        anon_session_id: anon,
        event_type: 'custom',
        screen: 'chat',
        target: 'session_open',
        meta: { sessionId: withSession.id, scenario: withSession.pushback_id, mode: 'text' },
        dwell_ms: null,
        created_at: new Date(clock + 500).toISOString(),
      });
    }
    if (screen === 'create' && rand() < 0.5) {
      NAV.push({ user_id: userId, anon_session_id: anon, event_type: 'card_click', screen: 'create', target: 'library_scenario', meta: null, dwell_ms: null, created_at: new Date(clock + 2000).toISOString() });
    }
    if (screen === 'analyzer' && rand() < 0.5) {
      NAV.push({ user_id: userId, anon_session_id: anon, event_type: 'custom', screen, target: 'vision_analyze', meta: null, dwell_ms: null, created_at: new Date(clock + 3000).toISOString() });
    }
    if (screen === 'fecalScan' && rand() < 0.6) {
      NAV.push({ user_id: userId, anon_session_id: anon, event_type: 'custom', screen, target: 'fecal_scan', meta: null, dwell_ms: null, created_at: new Date(clock + 3000).toISOString() });
    }
    NAV.push({ user_id: userId, anon_session_id: anon, event_type: 'dwell', screen, target: null, meta: null, dwell_ms: dwell, created_at: new Date(clock + dwell).toISOString() });
    clock += dwell;
  }
}

for (const r of rawRows) {
  const person = MOCK_PEOPLE.find((p) => p.id === r.user_id)!;
  const at = new Date(r.created_at).getTime() - (r.duration_seconds + 90) * 1000;
  visit(person, at, `dev-${person.id.slice(-4)}`, r);
}
for (const e of hintEvents) {
  NAV.push({
    user_id: e.user_id,
    anon_session_id: `dev-${e.user_id.slice(-4)}`,
    event_type: 'custom',
    screen: 'chat',
    target: 'coach_hint_request',
    meta: { sessionId: e.sessionId, turn: 4 },
    dwell_ms: null,
    created_at: new Date(e.at).toISOString(),
  });
}
// Browsing without training, plus anonymous trial users.
for (let i = 0; i < 260; i++) {
  const signedIn = rand() < 0.6;
  const person = signedIn ? pick(MOCK_PEOPLE.filter((p) => p.habit)) : null;
  const gap = person?.habit?.lastGap ?? 0;
  const at = NOW - between(gap, 110) * DAY;
  const d = new Date(at);
  d.setHours(pick([8, 9, 12, 13, 18, 20, 21]), Math.floor(rand() * 60));
  if (d.getTime() > NOW) continue;
  visit(person, d.getTime(), person ? `dev-${person.id.slice(-4)}` : `anon-${Math.floor(rand() * 40)}`, null);
}
NAV.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

// ── directory ────────────────────────────────────────────────────────────
const DIRECTORY: TraineeDirectoryEntry[] = MOCK_PEOPLE.map((p) => {
  const joined = (p.habit?.joined ?? (p.id === uid(20) ? 3 : 40)) * DAY;
  const lastNav = NAV.find((n) => n.user_id === p.id);
  return {
    user_id: p.id,
    display_name: p.name,
    echo_primary: p.driver,
    echo_secondary: p.secondary,
    created_at: new Date(NOW - joined).toISOString(),
    locale: p.locale,
    disabled: p.id === uid(7),
    admin_role: p.role,
    email: p.email,
    last_sign_in_at: lastNav ? lastNav.created_at : null,
  };
});

// ── answers ──────────────────────────────────────────────────────────────
function param(url: string, key: string): string | null {
  return new URL(url, location.origin).searchParams.get(key);
}

function engagement(range: string, tz: number): EngagementReport {
  const agg = aggregateEngagement(NAV as never, { range: range as never, now: NOW, tzOffsetMinutes: tz });
  return { ...agg, generated_at: new Date(NOW).toISOString(), scanned: NAV.length, truncated: false } as EngagementReport;
}

function traineeDetail(id: string, tz: number): TraineeDetail | null {
  const profile = DIRECTORY.find((d) => d.user_id === id);
  if (!profile) return null;
  const sessions = SUMMARIES.filter((s) => s.user_id === id);
  const navRows = NAV.filter((n) => n.user_id === id);
  return {
    profile,
    sessions,
    activity: aggregateTraineeActivity(navRows as never, { now: NOW, tzOffsetMinutes: tz }),
    feedback: sessions
      .filter((_, i) => i % 6 === 2)
      .map((s, i) => ({
        id: `fb-${s.id}`,
        session_id: s.id,
        realism: 4 + (i % 2),
        ai_quality: 4,
        comfort: 3 + (i % 3),
        comment: i % 2 ? 'The owner felt real — pushed back exactly like our clients do.' : null,
        created_at: s.created_at,
      })),
    scenarios: id === uid(6)
      ? [{ id: 'us-1', title: 'Senior lab, cost-sensitive owner', pushback_id: 'cost', difficulty: 3, species: 'dog', created_at: new Date(NOW - 20 * DAY).toISOString() }]
      : [],
    analyzer: id === uid(2)
      ? [{ id: 'an-1', breed: 'Labrador Retriever', bcs: 7, verdict: 'adjust', source: 'vision', created_at: new Date(NOW - 6 * DAY).toISOString() }]
      : [],
    reports: [],
    ai_usage: {
      calls: sessions.length * 9,
      cost_usd: sessions.length * 0.0041,
      by_type: [
        { call_type: 'roleplay', calls: sessions.length * 7, cost_usd: sessions.length * 0.0023 },
        { call_type: 'evaluate', calls: sessions.length, cost_usd: sessions.length * 0.0015 },
        { call_type: 'hint', calls: sessions.reduce((a, s) => a + (s.hints_used ?? 0), 0), cost_usd: 0.002 },
      ],
    },
    withheld: [],
  };
}

function fullSession(id: string) {
  const r = rawRows.find((x) => x.id === id);
  if (!r) return undefined;
  const summary = SUMMARIES.find((s) => s.id === id)!;
  return { ...r, score_unavailable: summary.score_unavailable, difficulty: summary.difficulty };
}

const AI_CALLS = rawRows.flatMap((r, i) => {
  const at = new Date(r.created_at).getTime();
  const calls = [];
  for (let k = 0; k < Math.ceil(r.turns / 2); k++) {
    const slow = rand() < 0.05;
    calls.push({
      id: `call-${i}-${k}`,
      session_id: null,
      user_id: r.user_id,
      call_type: r.mode === 'voice' ? 'voice' : 'roleplay',
      model_id: r.model_id,
      latency_ms: Math.round(slow ? between(4000, 9000) : between(700, 2100)),
      tokens_in: 1800,
      tokens_out: 120,
      cost_usd: 0.00031,
      refusal: rand() < 0.01,
      off_topic: false,
      end_token_emitted: k === Math.ceil(r.turns / 2) - 1,
      retries: 0,
      error: rand() < 0.015 ? 'upstream timeout' : null,
      created_at: new Date(at - (r.turns - k * 2) * 30_000).toISOString(),
    });
  }
  if (r.completed) {
    calls.push({
      id: `call-${i}-eval`,
      session_id: null,
      user_id: r.user_id,
      call_type: 'evaluate',
      model_id: 'gemini-3-flash-preview',
      latency_ms: Math.round(between(2500, 5200)),
      tokens_in: 5200,
      tokens_out: 900,
      cost_usd: 0.0016,
      refusal: false,
      off_topic: false,
      end_token_emitted: false,
      retries: 0,
      error: null,
      created_at: r.created_at,
    });
  }
  return calls;
});

const FEEDBACK = rawRows
  .filter((_, i) => i % 5 === 1)
  .map((r, i) => ({
    id: `fb-${i}`,
    session_id: r.id,
    user_id: r.user_id,
    anon_session_id: null,
    realism: 3 + (i % 3),
    ai_quality: 4 + (i % 2),
    comfort: 3 + ((i + 1) % 3),
    comment: i % 3 === 0 ? 'Felt like a real client conversation.' : null,
    scenario_summary: r.scenario_summary,
    pushback_id: r.pushback_id,
    created_at: r.created_at,
  }));

function since(url: string): number {
  const s = param(url, 'since');
  return s ? new Date(s).getTime() : NOW - 28 * DAY;
}

/**
 * Answer an Analytics GET, or `undefined` to let mockApi's other fixtures
 * answer. `url` is the full request URL (query string included).
 */
export function analyticsMock(name: string, url: string): unknown | undefined {
  switch (name) {
    case 'admin-sessions': {
      const id = param(url, 'id');
      if (id) return fullSession(id) ?? null;
      const from = since(url);
      if (param(url, 'view') === 'summary') {
        return { rows: SUMMARIES.filter((s) => new Date(s.created_at).getTime() >= from), truncated: false };
      }
      return rawRows
        .filter((r) => new Date(r.created_at).getTime() >= from)
        .map((r) => fullSession(r.id));
    }
    case 'admin-analytics': {
      const op = param(url, 'op');
      const tz = Number(param(url, 'tz') ?? 0) || 0;
      if (op === 'directory') return { rows: DIRECTORY, emails: true };
      if (op === 'engagement') return engagement(param(url, 'range') ?? '28d', tz);
      if (op === 'trainee') return traineeDetail(param(url, 'id') ?? '', tz) ?? { error: 'Not found' };
      return { error: 'Unknown op' };
    }
    case 'admin-ai-calls':
      return AI_CALLS.filter((c) => new Date(c.created_at).getTime() >= since(url));
    case 'admin-feedback':
      return FEEDBACK.filter((f) => new Date(f.created_at).getTime() >= since(url));
    case 'admin-nav-events':
      return NAV.filter((n) => new Date(n.created_at).getTime() >= since(url)).slice(0, 5000);
    default:
      return undefined;
  }
}
