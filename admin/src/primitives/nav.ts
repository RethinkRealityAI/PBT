/**
 * Admin navigation model.
 *
 * The portal used to be eighteen flat links in a wrapping pill bar — every
 * screen equally prominent, nothing grouped, and two rows of chrome before you
 * reached any content. This restructures it into **four sections of twelve
 * destinations**, where closely-related screens are tabs of one destination
 * rather than separate entries:
 *
 *   Monitor   Overview · Analytics [insights|traffic|quality] · Activity [sessions|analyzer]
 *   People    People   [users|members|roles|invites]
 *   Content   Scenario Studio [studio|trainee] · Knowledge · AI tuning · Feedback [sessions|reports]
 *   Platform  Email    [templates|settings|log] · Flags · Audit · Preview
 *
 * Content used to be a single "Library" destination with four unrelated jobs
 * (trainee scenarios, the builder, knowledge, simulation) behind one icon.
 * Building scenarios is now its own destination — the Scenario Studio —
 * because some admins do nothing else (the Scenario Author role lands straight
 * on it). Knowledge and AI tuning (the old "Simulation" screen) stand on their
 * own. Old `#/library/…` links are rewritten by `legacyRoute()` below, so
 * bookmarks keep working.
 *
 * Nothing was removed — the same screens are all still reachable, in at most
 * two clicks, and related ones now sit next to each other instead of being
 * separated by whatever happened to be adjacent in the old row.
 *
 * Every destination and tab declares the permission it needs; a role that
 * can't use any tab of a destination never sees the destination.
 */
import type { Permission } from '../../../src/shared/access/permissions';
import type { AdminRoute } from '../lib/route';

export type AdminScreen =
  | 'overview'
  | 'analytics'
  | 'activity'
  | 'people'
  | 'scenarios'
  | 'knowledge'
  | 'tuning'
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
        key: 'scenarios',
        label: 'Scenario Studio',
        icon: '✎',
        requires: 'scenarios.read',
        tabs: [
          { key: 'studio', label: 'Studio', requires: 'scenarios.read' },
          { key: 'trainee', label: 'Trainee-built', requires: 'scenarios.read' },
        ],
      },
      { key: 'knowledge', label: 'Knowledge', icon: '▤', requires: 'knowledge.read' },
      { key: 'tuning', label: 'AI tuning', icon: '◎', requires: 'simulation.read' },
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

/**
 * Where an old `#/library/…` link lives now. The Library destination was split
 * into Scenario Studio, Knowledge and AI tuning; bookmarks, shared links and
 * links in old emails must keep landing on the same screen.
 *
 * Any route that isn't a Library one comes back as the SAME object, so a
 * caller can test `legacyRoute(r) !== r` to decide whether to rewrite the URL.
 */
export function legacyRoute(route: AdminRoute): AdminRoute {
  if (route.screen !== 'library') return route;
  switch (route.tab) {
    case 'scenarios':
      return { screen: 'scenarios', tab: 'trainee' };
    case 'knowledge':
      return { screen: 'knowledge', tab: null };
    case 'simulation':
      return { screen: 'tuning', tab: null };
    case 'builder':
    default:
      // A bare `#/library` (or a tab that no longer exists): scenario work
      // happens in the Studio now.
      return { screen: 'scenarios', tab: 'studio' };
  }
}
