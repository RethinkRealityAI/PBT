// Scenario tags — the team's tag library for the Scenario Studio gallery.
//
// A tag is a short name + a colour from a FIXED palette, shared by every
// admin ("Q1 rollout" in teal means the same thing to everyone). Tags live in
// `scenario_tags`; which scenario carries which tag lives in the join table
// `scenario_tag_assignments` (migration
// 20261107000000_scenario_tags_archive.sql) — never a column on
// `scenario_overrides`, so tagging a built-in scenario creates no override
// row and tagging never bumps an override's `updated_at` (which would 409 an
// editor open elsewhere).
//
// ADMIN-ONLY: tags never reach the public flags snapshot, the trainee app or
// any AI prompt.
//
// Dependency-free: imported by admin/src and netlify/functions (the
// `admin-scenario-tags` endpoint validates with the same functions the
// Studio's editors use while the admin types).

/** The palette, in "next colour" order. Keys are the stored values (DB CHECK). */
export const TAG_COLOR_KEYS = [
  'blue',
  'green',
  'amber',
  'purple',
  'teal',
  'red',
  'pink',
  'orange',
  'indigo',
  'slate',
] as const;

export type TagColor = (typeof TAG_COLOR_KEYS)[number];

export interface TagSwatch {
  /** Pill background. */
  bg: string;
  /** Pill text — passes WCAG AA (≥ 4.5 : 1) on `bg` (unit-tested). */
  fg: string;
  /** The small colour dot / swatch (decorative: the name always says it). */
  dot: string;
  /** A hairline border so a pale pill still reads on a white card. */
  border: string;
}

export interface TagColorDef {
  key: TagColor;
  /** "Teal" — said to screen readers and shown in the palette picker. */
  label: string;
  light: TagSwatch;
  dark: TagSwatch;
}

/**
 * Light + dark fills for every colour. Solid hex values on purpose: the
 * contrast test computes them exactly, and a translucent fill's contrast
 * would depend on whatever sits behind the card.
 */
export const TAG_COLORS: Record<TagColor, TagColorDef> = {
  slate: {
    key: 'slate',
    label: 'Slate',
    light: { bg: '#eef1f5', fg: '#1e293b', dot: '#64748b', border: '#d5dbe3' },
    dark: { bg: '#334155', fg: '#e2e8f0', dot: '#94a3b8', border: '#475569' },
  },
  red: {
    key: 'red',
    label: 'Red',
    light: { bg: '#fde8e8', fg: '#991b1b', dot: '#e5484d', border: '#f6c9c9' },
    dark: { bg: '#5c1a1a', fg: '#fecaca', dot: '#f87171', border: '#7f2a2a' },
  },
  orange: {
    key: 'orange',
    label: 'Orange',
    light: { bg: '#ffedd5', fg: '#9a3412', dot: '#f97316', border: '#fbd3a8' },
    dark: { bg: '#5a2a0c', fg: '#fed7aa', dot: '#fb923c', border: '#7c3a12' },
  },
  amber: {
    key: 'amber',
    label: 'Amber',
    light: { bg: '#fdf1c7', fg: '#854d0e', dot: '#d99a06', border: '#f3dc8f' },
    dark: { bg: '#53390a', fg: '#fde68a', dot: '#fbbf24', border: '#714f10' },
  },
  green: {
    key: 'green',
    label: 'Green',
    light: { bg: '#dcf5e3', fg: '#166534', dot: '#22a35a', border: '#b5e5c3' },
    dark: { bg: '#163d26', fg: '#bbf7d0', dot: '#4ade80', border: '#1f5634' },
  },
  teal: {
    key: 'teal',
    label: 'Teal',
    light: { bg: '#d5f5f0', fg: '#115e59', dot: '#14a394', border: '#a9e6dd' },
    dark: { bg: '#123d3a', fg: '#99f6e4', dot: '#2dd4bf', border: '#1a5853' },
  },
  blue: {
    key: 'blue',
    label: 'Blue',
    light: { bg: '#dde9fe', fg: '#1e40af', dot: '#3b82f6', border: '#bcd3fb' },
    dark: { bg: '#1c2f5e', fg: '#bfdbfe', dot: '#60a5fa', border: '#29427d' },
  },
  indigo: {
    key: 'indigo',
    label: 'Indigo',
    light: { bg: '#e3e6fd', fg: '#3730a3', dot: '#6366f1', border: '#c6cbf9' },
    dark: { bg: '#2a2766', fg: '#c7d2fe', dot: '#818cf8', border: '#3a3684' },
  },
  purple: {
    key: 'purple',
    label: 'Purple',
    light: { bg: '#f1e6fd', fg: '#6b21a8', dot: '#a855f7', border: '#ddc5f8' },
    dark: { bg: '#3d1f5c', fg: '#e9d5ff', dot: '#c084fc', border: '#532b7c' },
  },
  pink: {
    key: 'pink',
    label: 'Pink',
    light: { bg: '#fce4f1', fg: '#9d174d', dot: '#e84393', border: '#f6c4de' },
    dark: { bg: '#561a38', fg: '#fbcfe8', dot: '#f472b6', border: '#73244b' },
  },
};

export function isTagColor(value: unknown): value is TagColor {
  return typeof value === 'string' && (TAG_COLOR_KEYS as readonly string[]).includes(value);
}

export function tagSwatch(color: TagColor, theme: 'light' | 'dark' = 'light'): TagSwatch {
  const def = TAG_COLORS[isTagColor(color) ? color : 'slate'];
  return theme === 'dark' ? def.dark : def.light;
}

export const TAG_LIMITS = {
  /** Characters, after trimming. Also a DB CHECK. */
  nameMax: 32,
  /** Live (non-deleted) tags in the team's library. */
  maxTags: 100,
  /** Tags on one scenario. */
  perScenario: 8,
} as const;

/** One tag in the team's library. */
export interface ScenarioTag {
  id: string;
  name: string;
  color: TagColor;
  /** Optimistic-concurrency token (the row's `updated_at`). */
  updatedAt: string | null;
}

/** A tag as the admin endpoint lists it: with how many scenarios carry it. */
export interface AdminScenarioTag extends ScenarioTag {
  usage: number;
}

export interface ScenarioTagAssignment {
  scenarioId: string;
  tagId: string;
}

/** `admin-scenario-tags` GET. */
export interface ScenarioTagsResponse {
  tags: AdminScenarioTag[];
  assignments: ScenarioTagAssignment[];
  /** `tags_table_missing` until the migration has been applied. */
  _notice?: string;
}

/** `admin-scenario-tags` POST bodies. */
export type ScenarioTagWriteRequest =
  | { op: 'upsert-tag'; tag: { id?: string | null; name: string; color: string }; baseUpdatedAt?: string | null }
  | { op: 'delete-tag'; id: string }
  | { op: 'set-tags'; scenarioId: string; tagIds: string[] };

/** The `_notice` the GET answers with before the migration runs. */
export const TAGS_TABLE_MISSING = 'tags_table_missing';

/** "  Q1   rollout " → "Q1 rollout". */
export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** The uniqueness key: case- and space-insensitive (the DB index matches). */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/** A sentence for the admin, or null when the name is fine. */
export function tagNameProblem(name: unknown): string | null {
  if (typeof name !== 'string') return 'Give the tag a name.';
  const n = normalizeTagName(name);
  if (!n) return 'Give the tag a name.';
  if (n.length > TAG_LIMITS.nameMax) return `Keep tag names to ${TAG_LIMITS.nameMax} characters.`;
  return null;
}

/** Validate an upsert-tag body's `tag`. */
export function validateTagInput(tag: unknown): string | null {
  if (!tag || typeof tag !== 'object' || Array.isArray(tag)) return 'tag required';
  const t = tag as Record<string, unknown>;
  const nameProblem = tagNameProblem(t.name);
  if (nameProblem) return nameProblem;
  if (!isTagColor(t.color)) return 'Pick one of the palette colours.';
  if (t.id != null && (typeof t.id !== 'string' || !isTagId(t.id))) return 'Unknown tag.';
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tag ids are uuids (the table's primary key). */
export function isTagId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Scenarios that can carry tags: the shipped library (`seed:`) and the
 * team's own (`admin:`). A trainee's own `user:` scenario belongs to that
 * trainee — tags, like archive, don't apply to it.
 */
export function isTaggableScenarioId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^(seed|admin):[A-Za-z0-9_.:-]+$/.test(value);
}

/**
 * The colour a NEW tag gets: the first palette colour no live tag uses yet,
 * else the palette again in order (so ten tags in, colours start repeating
 * evenly rather than all landing on blue).
 */
export function nextTagColor(used: readonly string[]): TagColor {
  const taken = new Set(used);
  const free = TAG_COLOR_KEYS.find((c) => !taken.has(c));
  if (free) return free;
  const counts = new Map<TagColor, number>(TAG_COLOR_KEYS.map((c) => [c, 0] as const));
  for (const u of used) if (isTagColor(u)) counts.set(u, (counts.get(u) ?? 0) + 1);
  let best: TagColor = TAG_COLOR_KEYS[0];
  for (const c of TAG_COLOR_KEYS) if ((counts.get(c) ?? 0) < (counts.get(best) ?? 0)) best = c;
  return best;
}

/** Tags A→Z by name (case-insensitive), ties by id — the order every list uses. */
export function sortTags<T extends Pick<ScenarioTag, 'id' | 'name'>>(tags: readonly T[]): T[] {
  return [...tags].sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  );
}

/** Read one stored row tolerantly (null when it isn't a usable tag). */
export function rowToScenarioTag(row: unknown): ScenarioTag | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!isTagId(r.id) || typeof r.name !== 'string' || !normalizeTagName(r.name)) return null;
  return {
    id: r.id,
    name: normalizeTagName(r.name),
    color: isTagColor(r.color) ? r.color : 'slate',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}

// ── WCAG contrast (for the palette test and anyone choosing a new colour) ──

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours (1 … 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
