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
  'admin-analyzer': [],
  'admin-nav-events': [],
  'admin-feedback': [],
  // Deliberately spans the triage states so the queue, the "already dealt
  // with" filter and the per-row actions can all be reviewed at once.
  'admin-reports': [
    {
      id: 'rep-1',
      kind: 'bug',
      message: 'The scorecard spun forever after my session ended.',
      screen: 'stats',
      status: 'open',
      user_agent: 'Mozilla/5.0 (iPhone)',
      created_at: ago(2 * HOUR),
    },
    {
      id: 'rep-2',
      kind: 'suggestion',
      message: 'Could the coach hint stay on screen while I type my reply?',
      screen: 'chat',
      status: 'triaged',
      user_agent: 'Mozilla/5.0 (Macintosh)',
      created_at: ago(2 * DAY),
    },
    {
      id: 'rep-3',
      kind: 'bug',
      message: 'French translation missing on the pet analyzer verdict.',
      screen: 'analyzer',
      status: 'resolved',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
      created_at: ago(9 * DAY),
    },
  ],
  'admin-scenarios': [],
  'admin-audit-log': [],
  'admin-flags': { flags: [], rules: [] },
  'admin-knowledge': { documents: [] },
  'admin-scenario-overrides': [],
  'admin-simulation-config': { config: {} },
  'user-scenarios': [],
};

/**
 * POSTs whose response is itself a reviewable surface. Everything else falls
 * through to a bare success — see the branch in installAdminMocks.
 */
const POST_ROUTES: Record<string, unknown> = {
  // Rubric dry run. Shares are the shipped defaults so the panel reads the way
  // it will against a real config; scores are mid-band on purpose, so neither
  // the "strong" nor the "needs work" styling monopolises the review.
  'admin-score-preview': {
    scenario: {
      breed: 'Labrador Retriever',
      pushback: 'Weight / obesity denial',
      persona: 'Defensive',
      driver: 'Harmonizer',
      difficulty: 2,
    },
    transcript: [
      { role: 'ai', text: "She's always been a big girl — the vet says that every visit." },
      { role: 'user', text: 'I hear you, and it’s clear how much you care about her.' },
      { role: 'ai', text: 'So you agree she looks fine?' },
      { role: 'user', text: 'Can I ask what a normal day of meals and treats looks like for her?' },
    ],
    dimensions: [
      { key: 'acknowledge', label: 'Acknowledge', score: 82, sharePct: 24 },
      { key: 'clarify', label: 'Clarify', score: 74, sharePct: 24 },
      { key: 'transform', label: 'Transform', score: 58, sharePct: 22 },
      { key: 'empathy', label: 'Empathy & warmth', score: 88, sharePct: 18 },
      { key: 'rapport', label: 'Rapport & pacing', score: 71, sharePct: 12 },
    ],
    overall: 74,
    band: 'good',
    critique:
      'Opened with genuine acknowledgement and asked a good open question about daily routine. ' +
      'Stopped short of a concrete next step — no recheck, trial or written plan was offered.',
  },
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
    // The exception is a POST whose *response* is the thing being reviewed:
    // the rubric dry-run renders a scorecard, so a bare `{ok:true}` would
    // leave the panel it exists to demonstrate permanently blank.
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
      const posted = POST_ROUTES[name];
      return json(posted === undefined ? { ok: true, status: 'sent' } : posted);
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
