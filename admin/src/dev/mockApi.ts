/**
 * Offline harness for the admin portal.
 *
 * Enabled only when the dev server runs with `VITE_ADMIN_MOCK=1`, which is how
 * the UI gets reviewed and screenshotted without a Supabase project or a live
 * Netlify Functions deploy. It does two things:
 *
 *   1. Seeds a fake Supabase session in localStorage so the auth gate passes.
 *   2. Intercepts `/.netlify/functions/*` and answers from fixtures.
 *
 * Nothing here ships: `main.tsx` only imports it behind the env check, so the
 * production bundle never includes it. Fixtures deliberately cover the awkward
 * states — a paused template, a revoked invite, a failed delivery — because
 * those are the ones that look wrong first.
 */
import { DEFAULT_TEMPLATES } from '../../../src/shared/email/defaults';
import { DEFAULT_BRAND } from '../../../src/shared/email/types';
import {
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
  SYSTEM_ROLES,
} from '../../../src/shared/access/permissions';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();
const ahead = (ms: number) => new Date(now + ms).toISOString();

const ME = '00000000-0000-4000-8000-000000000001';

function seedSession(): void {
  const session = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor((now + 12 * HOUR) / 1000),
    user: {
      id: ME,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'dapo@rethinkreality.ai',
      app_metadata: {},
      user_metadata: { display_name: 'Dapo Ajisafe' },
      created_at: ago(400 * DAY),
    },
  };
  localStorage.setItem('pbt:admin_session', JSON.stringify(session));
}

const USERS = [
  user(ME, 'Dapo Ajisafe', 'dapo@rethinkreality.ai', 'owner', 'Activator', 0),
  user('…0002', 'Marie Tremblay', 'marie@vetgroup.ca', 'content_manager', 'Harmonizer', 3 * DAY),
  user('…0003', 'Sam Okafor', 'sam@vetgroup.ca', 'analyst', 'Analyzer', 9 * DAY),
  user('…0004', 'Priya Raman', 'priya@vetgroup.ca', 'support', 'Energizer', 26 * DAY),
  user('…0005', 'Jonah Reed', 'jonah@vetgroup.ca', 'clinical_reviewer', 'Analyzer', 41 * DAY),
  user('…0006', 'Alex Chen', 'alex@vetgroup.ca', null, 'Energizer', 2 * DAY),
  disabled(user('…0007', 'Rowan Ellis', 'rowan@vetgroup.ca', null, 'Harmonizer', 60 * DAY)),
];

function user(
  id: string,
  name: string,
  email: string,
  role: string | null,
  driver: string,
  age: number,
) {
  return {
    user_id: id.startsWith('…') ? `0000000-0000-4000-8000-${id.slice(1).padStart(12, '0')}` : id,
    display_name: name,
    email,
    echo_primary: driver,
    echo_secondary: 'Harmonizer',
    is_admin: role !== null,
    admin_role: role,
    permission_overrides: role === 'analyst' ? { grant: ['flags.read'], revoke: [] } : {},
    disabled: false,
    created_at: ago(age + 30 * DAY),
  };
}

function disabled<T extends { disabled: boolean }>(u: T): T {
  return { ...u, disabled: true };
}

const INVITES = [
  {
    id: 'inv-1',
    email: 'nadia@vetgroup.ca',
    role_key: 'content_manager',
    display_name: 'Nadia Fischer',
    expires_at: ahead(5 * DAY),
    accepted_at: null,
    revoked_at: null,
    send_count: 1,
    last_sent_at: ago(2 * DAY),
    created_at: ago(2 * DAY),
    status: 'pending',
    invited_by_name: 'Dapo Ajisafe',
  },
  {
    id: 'inv-2',
    email: 'liam@vetgroup.ca',
    role_key: 'analyst',
    display_name: null,
    expires_at: ahead(6 * DAY),
    accepted_at: null,
    revoked_at: null,
    send_count: 2,
    last_sent_at: ago(4 * HOUR),
    created_at: ago(3 * DAY),
    status: 'pending',
    invited_by_name: 'Dapo Ajisafe',
  },
  {
    id: 'inv-3',
    email: 'sam@vetgroup.ca',
    role_key: 'analyst',
    display_name: 'Sam Okafor',
    expires_at: ago(2 * DAY),
    accepted_at: ago(9 * DAY),
    revoked_at: null,
    send_count: 1,
    last_sent_at: ago(10 * DAY),
    created_at: ago(10 * DAY),
    status: 'accepted',
    invited_by_name: 'Dapo Ajisafe',
  },
  {
    id: 'inv-4',
    email: 'contractor@agency.io',
    role_key: 'support',
    display_name: null,
    expires_at: ago(1 * DAY),
    accepted_at: null,
    revoked_at: ago(6 * DAY),
    send_count: 1,
    last_sent_at: ago(8 * DAY),
    created_at: ago(8 * DAY),
    status: 'revoked',
    invited_by_name: 'Dapo Ajisafe',
  },
];

const CUSTOM_ROLE = {
  key: 'regional_trainer',
  name: 'Regional Trainer',
  description:
    'Runs training for one region: reads sessions and insights, edits scenarios, and triages feedback.',
  permissions: [
    'overview.read',
    'insights.read',
    'sessions.read',
    'scenarios.read',
    'scenarios.write',
    'feedback.read',
    'preview.read',
  ],
  is_system: false,
  rank: 45,
  updated_at: ago(3 * DAY),
};

const EMAIL_LOG = [
  logRow('admin_invite', 'nadia@vetgroup.ca', 'You’ve been invited to the PBT admin portal', 'sent', 2 * DAY),
  logRow('admin_invite', 'liam@vetgroup.ca', 'You’ve been invited to the PBT admin portal', 'sent', 4 * HOUR),
  logRow('password_reset', 'marie@vetgroup.ca', 'Reset your PBT password', 'sent', 6 * HOUR),
  logRow('welcome', 'alex@vetgroup.ca', 'Welcome to Pushback Training', 'sent', 2 * DAY),
  logRow('account_disabled', 'rowan@vetgroup.ca', 'Your PBT account has been disabled', 'sent', 5 * DAY),
  {
    ...logRow('password_reset', 'typo@nowhere.invalid', 'Reset your PBT password', 'failed', 7 * DAY),
    error: 'Resend rejected the message (422): recipient domain does not accept mail',
  },
];

function logRow(template: string, to: string, subject: string, status: string, age: number) {
  return {
    id: `${template}-${to}`,
    template_key: template,
    to_email: to,
    subject,
    provider: 'resend',
    status,
    error: null as string | null,
    created_at: ago(age),
  };
}

// ── Analytics / community fixtures ──────────────────────────────────
// Representative rather than exhaustive: enough rows that the Analytics
// heatmap, Feature usage, Reports triage, and Analyzer vision columns all
// render with real-looking data in review screenshots.

const SCREEN_DWELL: [string, number, number][] = [
  // [screen, total minutes, visits]
  ['chat', 262, 41],
  ['home', 118, 96],
  ['stats', 74, 33],
  ['analyzer', 51, 18],
  ['history', 32, 21],
  ['resources', 19, 9],
  ['settings', 7, 11],
];

const NAV_EVENTS = (() => {
  const rows: Record<string, unknown>[] = [];
  let id = 1;
  const anonFor = (i: number) => `anon-${(i % 9) + 1}`;
  for (const [screen, totalMin, visits] of SCREEN_DWELL) {
    for (let i = 0; i < visits; i++) {
      rows.push({
        id: id++,
        user_id: null,
        anon_session_id: anonFor(i),
        event_type: 'dwell',
        screen,
        target: null,
        meta: null,
        dwell_ms: Math.round((totalMin * 60_000) / visits),
        created_at: ago(((i * 37) % (27 * 24)) * HOUR),
      });
      rows.push({
        id: id++,
        user_id: null,
        anon_session_id: anonFor(i),
        event_type: 'screen_view',
        screen,
        target: null,
        meta: null,
        dwell_ms: null,
        created_at: ago(((i * 41) % (27 * 24)) * HOUR),
      });
    }
  }
  const interactions: [string, string, string, number][] = [
    // [event_type, screen, target, count]
    ['cta_click', 'home', 'start_todays_pick', 64],
    ['tab_change', 'home', 'history', 38],
    ['tab_change', 'stats', 'home', 29],
    ['card_click', 'create', 'library_scenario', 22],
    ['cta_click', 'create', 'start_custom_scenario', 17],
    ['custom', 'chat', 'session_open', 87],
    ['custom', 'stats', 'session_feedback', 31],
    ['custom', 'analyzer', 'vision_analyze', 24],
    ['custom', 'analyzer', 'analyzer_save', 19],
    ['custom', 'chat', 'coach_hint_request', 44],
    ['custom', 'home', 'platform_report', 6],
  ];
  for (const [event_type, screen, target, count] of interactions) {
    for (let i = 0; i < count; i++) {
      rows.push({
        id: id++,
        user_id: null,
        anon_session_id: anonFor(i),
        event_type,
        screen,
        target,
        meta: null,
        dwell_ms: null,
        created_at: ago(((i * 53) % (27 * 24)) * HOUR),
      });
    }
  }
  return rows;
})();

const REPORTS = [
  report(1, 'bug', 'Voice mode drops the first word of every customer reply on Safari.', 'chat', 'open', 5 * HOUR),
  report(2, 'suggestion', 'Let me favourite a scenario so the team can all run the same one.', 'home', 'open', 9 * HOUR),
  report(3, 'bug', 'Score ring shows 0 for a second before the real score loads.', 'stats', 'triaged', 2 * DAY),
  report(4, 'suggestion', 'A French voice option for fr-CA sessions would help our Québec clinics.', 'settings', 'triaged', 3 * DAY),
  report(5, 'bug', 'Photo upload spinner never stops if I switch tabs mid-analysis.', 'analyzer', 'resolved', 6 * DAY),
  report(6, 'suggestion', 'Print-friendly session summary for our lunch-and-learn reviews.', 'history', 'dismissed', 11 * DAY),
];

function report(
  n: number,
  kind: 'bug' | 'suggestion',
  message: string,
  screen: string,
  status: 'open' | 'triaged' | 'resolved' | 'dismissed',
  age: number,
) {
  return {
    id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    user_id: null,
    anon_session_id: `anon-${n}`,
    kind,
    message,
    screen,
    user_agent: 'Mozilla/5.0 (Macintosh)',
    status,
    created_at: ago(age),
  };
}

const ANALYZER_EVENTS = [
  analyzerEvent(1, 'Labrador Retriever', 31, 7, 'vision', 'Adult, roughly 4–6 years', 0.92, 'mild', ['patchy redness at the left flank'], 'adjust', 3 * HOUR),
  analyzerEvent(2, 'French Bulldog', 14, 6, 'vision', 'Junior, 1–2 years', 0.87, 'none', [], 'watch', 8 * HOUR),
  analyzerEvent(3, 'German Shepherd', 38, 5, 'manual', null, null, null, null, 'on_track', 1 * DAY),
  analyzerEvent(4, 'Golden Retriever', 36, 8, 'vision', 'Senior, 8+ years', 0.95, 'moderate', ['scaling along the dorsum', 'thinning coat'], 'concern', 2 * DAY),
  analyzerEvent(5, 'Beagle', 13, 6, 'manual', null, null, null, null, 'on_track', 3 * DAY),
  analyzerEvent(6, 'Shih Tzu', 7, 7, 'vision', 'Adult, 3–5 years', 0.78, 'marked', ['periocular irritation', 'patchy alopecia'], 'adjust', 5 * DAY),
];

function analyzerEvent(
  n: number,
  breed: string,
  weight: number,
  bcs: number,
  source: 'manual' | 'vision',
  ageEstimate: string | null,
  breedConfidence: number | null,
  dermSeverity: 'none' | 'mild' | 'moderate' | 'marked' | null,
  indicators: string[],
  verdict: 'on_track' | 'watch' | 'adjust' | 'concern',
  age: number,
) {
  return {
    id: `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`,
    user_id: n % 2 === 0 ? ME : null,
    breed,
    weight_kg: weight,
    bcs,
    mcs: 3,
    activity: 'moderate',
    kcal_target: 600 + n * 55,
    verdict,
    source,
    age_estimate: ageEstimate,
    breed_confidence: breedConfidence,
    dermatitis: dermSeverity == null ? null : { severity: dermSeverity, indicators, note: '' },
    created_at: ago(age),
  };
}

const ROUTES: Record<string, unknown> = {
  'admin-whoami': {
    user_id: ME,
    email: 'dapo@rethinkreality.ai',
    display_name: 'Dapo Ajisafe',
    role: 'owner',
    role_name: 'Owner',
    is_owner: true,
    permissions: ALL_PERMISSIONS,
  },
  'admin-users': USERS,
  'admin-roles': {
    roles: [...SYSTEM_ROLES.map((r) => ({ ...r, is_system: true, updated_at: null })), CUSTOM_ROLE],
    memberCounts: {
      owner: 1,
      content_manager: 1,
      analyst: 1,
      support: 1,
      clinical_reviewer: 1,
      regional_trainer: 0,
    },
    permissionCatalog: PERMISSION_CATEGORIES,
    allPermissions: ALL_PERMISSIONS,
    canManage: true,
    isOwner: true,
    myPermissions: ALL_PERMISSIONS,
  },
  'admin-invites': { invites: INVITES, canManage: true },
  'admin-email-templates': {
    templates: DEFAULT_TEMPLATES.map((t, i) => ({
      key: t.key,
      name: t.name,
      group: t.group,
      description: t.description,
      trigger: t.trigger,
      variables: t.variables,
      subject: t.subject,
      preheader: t.preheader,
      blocks: t.blocks,
      htmlOverride: null,
      enabled: t.key !== 'email_verify',
      customized: i === 0,
      updatedAt: i === 0 ? ago(3 * DAY) : null,
    })),
    brand: { ...DEFAULT_BRAND, siteUrl: 'https://pbt.example.com', supportEmail: 'support@vetgroup.ca' },
    canEdit: true,
    canSend: true,
    problem: null,
  },
  'admin-email-settings': {
    provider: 'resend',
    fromEmail: 'no-reply@vetgroup.ca',
    fromName: 'Pushback Training',
    replyTo: 'support@vetgroup.ca',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpSecure: false,
    appBaseUrl: 'https://pbt.example.com',
    brand: { ...DEFAULT_BRAND, siteUrl: 'https://pbt.example.com', supportEmail: 'support@vetgroup.ca' },
    hasResendKey: true,
    hasSmtpPass: false,
    resendKeyHint: 're_l…9f2a',
    origin: { credentials: 'database', sender: 'database' },
    problem: null,
    dedicatedSecretKey: true,
    updatedAt: ago(3 * DAY),
    canEdit: true,
    canSend: true,
  },
  'admin-email-log': EMAIL_LOG,
  'invite-accept': {
    email: 'nadia@vetgroup.ca',
    displayName: 'Nadia Fischer',
    roleKey: 'content_manager',
    roleName: 'Content Manager',
    roleDescription:
      'Owns what the trainer says: scenarios, simulation tuning, knowledge base, and feature flags.',
    expiresAt: ahead(5 * DAY),
    needsPassword: true,
  },
  'admin-sessions': [],
  'admin-ai-calls': [],
  'admin-analyzer': ANALYZER_EVENTS,
  'admin-nav-events': NAV_EVENTS,
  'admin-feedback': [],
  'admin-reports': REPORTS,
  'admin-scenarios': [],
  'admin-audit-log': [],
  'admin-flags': { flags: [], rules: [] },
  'admin-knowledge': { documents: [] },
  'admin-scenario-overrides': [],
  'admin-simulation-config': { config: {} },
  'user-scenarios': [],
};

export function installAdminMocks(): void {
  // `?mock=signedout` skips the seeded session so the sign-in and recovery
  // screens can be reviewed too.
  if (!/(^|[?&])mock=signedout(&|$)/.test(location.search)) seedSession();
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /\/\.netlify\/functions\/([a-z0-9-]+)/i.exec(url);
    if (!match) return real(input as RequestInfo, init);

    const name = match[1];
    // Writes just succeed — this harness is for reviewing layout and copy,
    // not for exercising the mutation paths (those have server-side tests).
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
      return json({ ok: true, status: 'sent' });
    }
    const body = ROUTES[name];
    if (body === undefined) return json({ error: `No mock for ${name}` }, 404);
    return json(body);
  };
  // eslint-disable-next-line no-console
  console.info('[admin] mock API installed — no server calls will leave this page.');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
