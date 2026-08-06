/**
 * PBT access control — the single source of truth for admin permissions.
 *
 * Imported by BOTH the browser admin app (`admin/src/**`) and the Netlify
 * Functions (`netlify/functions/**`), so it must stay dependency-free and
 * side-effect-free. The server is the authority: the UI uses this catalog to
 * hide what you can't do, the functions use it to *refuse* what you can't do.
 *
 * Model
 * ─────
 *   role            → a named bundle of permissions (system preset or custom)
 *   overrides       → per-user { grant: [], revoke: [] } on top of the role
 *   effective set   → role.permissions ∪ grant \ revoke   (revoke always wins)
 *
 * `owner` is special: it implicitly holds every permission, including ones
 * added by future releases, and only an owner can manage owners.
 */

// ── Permission keys ────────────────────────────────────────────────────

export const PERMISSIONS = [
  // Team & access
  'team.read',
  'team.manage',
  'roles.manage',
  'invites.manage',
  'owners.manage',
  'audit.read',

  // Insights & analytics
  'overview.read',
  'insights.read',
  'analytics.read',
  'sessions.read',
  'quality.read',

  // Content & simulation
  'scenarios.read',
  'scenarios.write',
  'simulation.read',
  'simulation.write',
  'knowledge.read',
  'knowledge.write',
  'flags.read',
  'flags.write',

  // Community
  'feedback.read',
  'reports.read',
  'analyzer.read',

  // Communications
  'email.read',
  'email.templates.write',
  'email.settings.write',
  'email.send',

  // Data
  'rag.export',
  'preview.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

// ── Categories (how the UI groups them, and how humans think about them) ──

export interface PermissionMeta {
  key: Permission;
  label: string;
  description: string;
  /** Permissions that are meaningless without these. UI shows them as implied. */
  requires?: Permission[];
  /** Marks a permission that can change who has access to the platform. */
  sensitive?: boolean;
}

export interface PermissionCategory {
  key: string;
  label: string;
  description: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    key: 'team',
    label: 'Team & access',
    description: 'Who can reach the admin portal and what they may do there.',
    permissions: [
      {
        key: 'team.read',
        label: 'View team & users',
        description: 'See the user list, roles, and account status.',
      },
      {
        key: 'team.manage',
        label: 'Manage accounts',
        description:
          'Create, disable, re-enable, delete accounts and assign existing roles.',
        requires: ['team.read'],
        sensitive: true,
      },
      {
        key: 'roles.manage',
        label: 'Manage roles & permissions',
        description: 'Create custom roles and change what each role can do.',
        requires: ['team.read'],
        sensitive: true,
      },
      {
        key: 'invites.manage',
        label: 'Invite teammates',
        description: 'Send, resend, and revoke admin invitations.',
        requires: ['team.read'],
        sensitive: true,
      },
      {
        key: 'owners.manage',
        label: 'Manage owners',
        description:
          'Promote or demote owners. Owners hold every permission, present and future.',
        requires: ['team.read', 'team.manage'],
        sensitive: true,
      },
      {
        key: 'audit.read',
        label: 'Read the audit log',
        description: 'See every administrative change and who made it.',
      },
    ],
  },
  {
    key: 'analytics',
    label: 'Insights & analytics',
    description: 'Aggregate platform telemetry, scoring trends, and traffic.',
    permissions: [
      { key: 'overview.read', label: 'Overview dashboard', description: 'Headline platform metrics.' },
      { key: 'insights.read', label: 'Insights', description: 'Scoring trends, ACT dimensions, sentiment.' },
      { key: 'analytics.read', label: 'Traffic analytics', description: 'Navigation events, engagement, dwell time.' },
      {
        key: 'sessions.read',
        label: 'Training sessions',
        description: 'Browse individual roleplay sessions and transcripts.',
      },
      { key: 'quality.read', label: 'AI quality & cost', description: 'Model failure rates, latency, spend.' },
    ],
  },
  {
    key: 'content',
    label: 'Content & simulation',
    description: 'The scenarios, prompts, and knowledge the trainer runs on.',
    permissions: [
      { key: 'scenarios.read', label: 'View scenarios', description: 'Browse the scenario library and overrides.' },
      {
        key: 'scenarios.write',
        label: 'Edit scenarios',
        description: 'Create and publish scenario overrides.',
        requires: ['scenarios.read'],
      },
      { key: 'simulation.read', label: 'View simulation config', description: 'Read prompt + scoring tuning.' },
      {
        key: 'simulation.write',
        label: 'Tune simulation',
        description: 'Change scoring weights, rubric copy, personas, and prompts.',
        requires: ['simulation.read'],
      },
      { key: 'knowledge.read', label: 'View knowledge base', description: 'Browse ingested knowledge documents.' },
      {
        key: 'knowledge.write',
        label: 'Edit knowledge base',
        description: 'Add, edit, re-seed, and delete knowledge documents.',
        requires: ['knowledge.read'],
      },
      { key: 'flags.read', label: 'View feature flags', description: 'Read flag values and rules.' },
      {
        key: 'flags.write',
        label: 'Change feature flags',
        description: 'Flip flags and edit targeting rules for live users.',
        requires: ['flags.read'],
      },
    ],
  },
  {
    key: 'community',
    label: 'Feedback & reports',
    description: 'What users tell you, and what they upload.',
    permissions: [
      { key: 'feedback.read', label: 'Session feedback', description: 'Post-session ratings and comments.' },
      { key: 'reports.read', label: 'Platform reports', description: 'Bug reports and suggestions from users.' },
      { key: 'analyzer.read', label: 'Pet Analyzer data', description: 'Pet Vision analyses and saved pets.' },
    ],
  },
  {
    key: 'comms',
    label: 'Communications',
    description: 'Transactional email: how it is sent and how it reads.',
    permissions: [
      { key: 'email.read', label: 'View email setup', description: 'See templates, provider status, and delivery log.' },
      {
        key: 'email.templates.write',
        label: 'Edit email templates',
        description: 'Change the subject, copy, and branding of transactional email.',
        requires: ['email.read'],
      },
      {
        key: 'email.settings.write',
        label: 'Change email provider',
        description: 'Set the Resend key or SMTP credentials and sender identity.',
        requires: ['email.read'],
        sensitive: true,
      },
      {
        key: 'email.send',
        label: 'Send test email',
        description: 'Deliver a rendered template to a chosen address.',
        requires: ['email.read'],
      },
    ],
  },
  {
    key: 'data',
    label: 'Data & preview',
    description: 'Bulk export and the embedded consumer preview.',
    permissions: [
      {
        key: 'rag.export',
        label: 'Export RAG corpus',
        description: 'Download the full session corpus as JSONL.',
        sensitive: true,
      },
      { key: 'preview.read', label: 'Consumer preview', description: 'Open the embedded consumer app preview.' },
    ],
  },
];

export const PERMISSION_META: Record<Permission, PermissionMeta> = Object.fromEntries(
  PERMISSION_CATEGORIES.flatMap((c) => c.permissions).map((p) => [p.key, p]),
) as Record<Permission, PermissionMeta>;

/** Every permission appears in exactly one category — guarded by a test. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATEGORIES.flatMap((c) =>
  c.permissions.map((p) => p.key),
);

// ── Role presets ───────────────────────────────────────────────────────

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  /** Owner ignores this list and holds everything. */
  permissions: Permission[];
  /** System roles can be re-permissioned but never deleted or renamed away. */
  system: boolean;
  /** Sort order in pickers — lower is more privileged. */
  rank: number;
}

const READ_ONLY_ANALYTICS: Permission[] = [
  'overview.read',
  'insights.read',
  'analytics.read',
  'sessions.read',
  'quality.read',
];

export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    key: 'owner',
    name: 'Owner',
    description:
      'Full control, including owners, roles, billing-level settings, and data export. Holds every permission automatically — including ones added in future releases.',
    permissions: [...ALL_PERMISSIONS],
    system: true,
    rank: 0,
  },
  {
    key: 'admin',
    name: 'Admin',
    description:
      'Runs the platform day to day: team, content, flags, analytics, and email. Cannot promote or demote owners.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'owners.manage'),
    system: true,
    rank: 10,
  },
  {
    key: 'content_manager',
    name: 'Content Manager',
    description:
      'Owns what the trainer says: scenarios, simulation tuning, knowledge base, and feature flags.',
    permissions: [
      'overview.read',
      'insights.read',
      'sessions.read',
      'scenarios.read',
      'scenarios.write',
      'simulation.read',
      'simulation.write',
      'knowledge.read',
      'knowledge.write',
      'flags.read',
      'flags.write',
      'feedback.read',
      'preview.read',
    ],
    system: true,
    rank: 20,
  },
  {
    key: 'clinical_reviewer',
    name: 'Clinical Reviewer',
    description:
      'Reviews training quality and clinical accuracy. Reads sessions and scorecards, edits knowledge content, touches nothing else.',
    permissions: [
      'overview.read',
      'insights.read',
      'sessions.read',
      'quality.read',
      'scenarios.read',
      'simulation.read',
      'knowledge.read',
      'knowledge.write',
      'feedback.read',
      'analyzer.read',
      'preview.read',
    ],
    system: true,
    rank: 30,
  },
  {
    key: 'analyst',
    name: 'Analyst',
    description: 'Read-only across analytics, sessions, and AI quality. Can export the RAG corpus.',
    permissions: [...READ_ONLY_ANALYTICS, 'scenarios.read', 'feedback.read', 'reports.read', 'analyzer.read', 'rag.export'],
    system: true,
    rank: 40,
  },
  {
    key: 'support',
    name: 'Support',
    description:
      'Front line for users: sees accounts and can disable or re-enable them, triages feedback and reports.',
    permissions: [
      'overview.read',
      'team.read',
      'team.manage',
      'sessions.read',
      'feedback.read',
      'reports.read',
      'analyzer.read',
      'preview.read',
    ],
    system: true,
    rank: 50,
  },
  {
    key: 'comms_manager',
    name: 'Comms Manager',
    description:
      'Owns transactional email — templates, sender identity, provider credentials, and invitations. Nothing else.',
    permissions: [
      'team.read',
      'invites.manage',
      'email.read',
      'email.templates.write',
      'email.settings.write',
      'email.send',
    ],
    system: true,
    rank: 60,
  },
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);

export const OWNER_ROLE = 'owner';

export function isSystemRole(key: string): boolean {
  return SYSTEM_ROLE_KEYS.includes(key);
}

// ── Effective permission resolution ────────────────────────────────────

export interface PermissionOverrides {
  grant?: string[];
  revoke?: string[];
}

export interface AccessInput {
  /** Role key, or null for a non-admin account. */
  role: string | null;
  /**
   * Role rows from the DB (system + custom). Permissions arrive as loose
   * strings — unknown keys are dropped rather than trusted. Falls back to the
   * code presets when empty.
   */
  roles?: Array<{ key: string; permissions: readonly string[] }>;
  overrides?: PermissionOverrides | null;
  /** Legacy: pre-RBAC accounts carry only `is_admin`. Treated as `admin`. */
  legacyIsAdmin?: boolean;
}

export interface ResolvedAccess {
  role: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: Permission[];
}

/**
 * Merge a role's permissions with per-user overrides.
 *
 * Order is deliberate: revoke is applied last, so an explicit revoke beats both
 * the role grant and an explicit grant. That makes "take this away from this
 * one person" reliable regardless of how their role later changes — except for
 * owners, who cannot be partially revoked (a half-owner is a support burden,
 * not a security control: demote them instead).
 */
export function resolveAccess(input: AccessInput): ResolvedAccess {
  const roleKey =
    input.role && input.role.trim() ? input.role.trim() : input.legacyIsAdmin ? 'admin' : null;

  if (!roleKey) {
    return { role: null, isOwner: false, isAdmin: false, permissions: [] };
  }

  if (roleKey === OWNER_ROLE) {
    return { role: OWNER_ROLE, isOwner: true, isAdmin: true, permissions: [...ALL_PERMISSIONS] };
  }

  const table = input.roles?.length ? input.roles : SYSTEM_ROLES;
  const def = table.find((r) => r.key === roleKey);
  const base = (def?.permissions ?? []).filter(isPermission);

  const effective = new Set<Permission>(base);
  for (const g of input.overrides?.grant ?? []) {
    if (isPermission(g)) effective.add(g);
  }
  for (const r of input.overrides?.revoke ?? []) {
    if (isPermission(r)) effective.delete(r);
  }

  return {
    role: roleKey,
    isOwner: false,
    isAdmin: true,
    // Stable order so audit-log diffs and UI lists don't churn.
    permissions: ALL_PERMISSIONS.filter((p) => effective.has(p)),
  };
}

export function hasPermission(access: ResolvedAccess, permission: Permission): boolean {
  return access.isOwner || access.permissions.includes(permission);
}

/**
 * Expand a permission selection to include everything it depends on.
 * Checking "Edit scenarios" without "View scenarios" would produce a role that
 * can write what it cannot see; the editor calls this on every toggle.
 */
export function withImpliedPermissions(selected: Iterable<string>): Permission[] {
  const out = new Set<Permission>();
  const add = (p: Permission) => {
    if (out.has(p)) return;
    out.add(p);
    for (const dep of PERMISSION_META[p]?.requires ?? []) add(dep);
  };
  for (const p of selected) if (isPermission(p)) add(p);
  return ALL_PERMISSIONS.filter((p) => out.has(p));
}

/**
 * Remove a permission and everything that depends on it (the inverse of
 * `withImpliedPermissions`) — unchecking "View scenarios" must also clear
 * "Edit scenarios".
 */
export function withoutDependents(selected: Iterable<string>, removed: Permission): Permission[] {
  const keep = new Set<Permission>();
  for (const p of selected) {
    if (!isPermission(p) || p === removed) continue;
    keep.add(p);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of [...keep]) {
      const deps = PERMISSION_META[p]?.requires ?? [];
      if (deps.some((d) => !keep.has(d))) {
        keep.delete(p);
        changed = true;
      }
    }
  }
  return ALL_PERMISSIONS.filter((p) => keep.has(p));
}

/** Human summary for role cards: "12 of 28 permissions · 4 areas". */
export function summarizePermissions(permissions: readonly string[]): {
  count: number;
  total: number;
  areas: string[];
} {
  const set = new Set(permissions);
  const areas = PERMISSION_CATEGORIES.filter((c) =>
    c.permissions.some((p) => set.has(p.key)),
  ).map((c) => c.label);
  return { count: permissions.filter(isPermission).length, total: ALL_PERMISSIONS.length, areas };
}
