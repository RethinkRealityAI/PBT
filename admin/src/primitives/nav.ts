/**
 * Admin navigation model.
 *
 * The portal used to be eighteen flat links in a wrapping pill bar — every
 * screen equally prominent, nothing grouped, and two rows of chrome before you
 * reached any content. This restructures it into **four sections of ten
 * destinations**, where closely-related screens became tabs of one destination
 * rather than separate entries:
 *
 *   Monitor   Overview · Analytics [insights|traffic|quality] · Activity [sessions|analyzer]
 *   People    People   [users|members|roles|invites]
 *   Content   Library  [scenarios|builder|knowledge|simulation] · Feedback [feedback|reports]
 *   Platform  Email    [templates|settings|delivery] · Flags · Audit · Preview
 *
 * Nothing was removed — the same screens are all still reachable, in at most
 * two clicks, and related ones now sit next to each other instead of being
 * separated by whatever happened to be adjacent in the old row.
 *
 * Every destination and tab declares the permission it needs; a role that
 * can't use any tab of a destination never sees the destination.
 */
import type { Permission } from '../../../src/shared/access/permissions';

export type AdminScreen =
  | 'overview'
  | 'analytics'
  | 'activity'
  | 'people'
  | 'library'
  | 'feedback'
  | 'email'
  | 'flags'
  | 'audit'
  | 'preview';

export interface TabDef {
  key: string;
  label: string;
  requires: Permission;
}

export interface NavItem {
  key: AdminScreen;
  label: string;
  /** Glyph, not an icon font — keeps the admin app dependency-free. */
  icon: string;
  /** Permission needed when the destination has no tabs. */
  requires: Permission;
  tabs?: TabDef[];
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'monitor',
    label: 'Monitor',
    items: [
      { key: 'overview', label: 'Overview', icon: '✦', requires: 'overview.read' },
      {
        key: 'analytics',
        label: 'Analytics',
        icon: '⌁',
        requires: 'insights.read',
        tabs: [
          { key: 'insights', label: 'Insights', requires: 'insights.read' },
          { key: 'traffic', label: 'Traffic', requires: 'analytics.read' },
          { key: 'quality', label: 'AI quality', requires: 'quality.read' },
        ],
      },
      {
        key: 'activity',
        label: 'Activity',
        icon: '◇',
        requires: 'sessions.read',
        tabs: [
          { key: 'sessions', label: 'Sessions', requires: 'sessions.read' },
          { key: 'analyzer', label: 'Pet Analyzer', requires: 'analyzer.read' },
        ],
      },
    ],
  },
  {
    key: 'people',
    label: 'People',
    items: [
      {
        key: 'people',
        label: 'People',
        icon: '◔',
        requires: 'team.read',
        tabs: [
          { key: 'users', label: 'Users', requires: 'team.read' },
          { key: 'members', label: 'Admins', requires: 'team.read' },
          { key: 'roles', label: 'Roles', requires: 'team.read' },
          { key: 'invites', label: 'Invites', requires: 'team.read' },
        ],
      },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    items: [
      {
        key: 'library',
        label: 'Library',
        icon: '▤',
        requires: 'scenarios.read',
        tabs: [
          { key: 'scenarios', label: 'Scenarios', requires: 'scenarios.read' },
          { key: 'builder', label: 'Builder', requires: 'scenarios.read' },
          { key: 'knowledge', label: 'Knowledge', requires: 'knowledge.read' },
          { key: 'simulation', label: 'Simulation', requires: 'simulation.read' },
        ],
      },
      {
        key: 'feedback',
        label: 'Feedback',
        icon: '☆',
        requires: 'feedback.read',
        tabs: [
          { key: 'sessions', label: 'Session feedback', requires: 'feedback.read' },
          { key: 'reports', label: 'Platform reports', requires: 'reports.read' },
        ],
      },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    items: [
      {
        key: 'email',
        label: 'Email',
        icon: '✉',
        requires: 'email.read',
        tabs: [
          { key: 'templates', label: 'Templates', requires: 'email.read' },
          { key: 'settings', label: 'Settings', requires: 'email.read' },
          { key: 'log', label: 'Delivery', requires: 'email.read' },
        ],
      },
      { key: 'flags', label: 'Flags', icon: '⚑', requires: 'flags.read' },
      { key: 'audit', label: 'Audit', icon: '☷', requires: 'audit.read' },
      { key: 'preview', label: 'Preview', icon: '◐', requires: 'preview.read' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function findNavItem(key: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((i) => i.key === key);
}

/** Tabs of a destination this admin may open, in declared order. */
export function visibleTabs(item: NavItem, permissions: readonly string[]): TabDef[] {
  return (item.tabs ?? []).filter((t) => permissions.includes(t.requires));
}

/**
 * A destination is reachable when at least one of its tabs is — or, for a
 * tabless destination, when its own permission is held. Sections with no
 * reachable destinations disappear entirely rather than rendering an empty
 * heading.
 */
export function visibleSections(permissions: readonly string[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      item.tabs ? visibleTabs(item, permissions).length > 0 : permissions.includes(item.requires),
    ),
  })).filter((section) => section.items.length > 0);
}

export function visibleItems(permissions: readonly string[]): NavItem[] {
  return visibleSections(permissions).flatMap((s) => s.items);
}

/** First tab the admin may open, used when a deep link names a forbidden one. */
export function defaultTab(item: NavItem, permissions: readonly string[]): string | null {
  return visibleTabs(item, permissions)[0]?.key ?? null;
}
