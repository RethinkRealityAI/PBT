/**
 * Admin navigation model.
 *
 * The portal used to be eighteen flat links in a wrapping pill bar — every
 * screen equally prominent, nothing grouped, and two rows of chrome before you
 * reached any content. This restructures it into **four sections of ten
 * destinations**, where closely-related screens are tabs of one destination
 * rather than separate entries:
 *
 *   Monitor   Analytics [overview|trainees|sessions|skills|engagement|quality|analyzer] · Feedback [sessions|reports]
 *   People    People   [users|members|roles|invites]
 *   Content   Scenario Studio [studio|categories|trainee] · Knowledge · AI tuning
 *   Platform  Email    [templates|settings|log] · Flags · Audit · Preview
 *
 * Monitor used to be three destinations — Overview, Analytics [insights|
 * traffic|quality] and Activity [sessions|analyzer] — that repeated each
 * other (the same average score, finish rate and "needs review" list on two
 * screens) and had nowhere to look at ONE trainee. They are now a single
 * Analytics destination: the Overview tab is the landing page, Trainees adds
 * per-person analytics (with a profile at `#/analytics/trainees/<user id>`),
 * Skills is the old Insights, Engagement the old Traffic. Old `#/overview`,
 * `#/activity/…`, `#/analytics/insights` and `#/analytics/traffic` links are
 * rewritten by `legacyRoute()` below, so bookmarks keep working. Feedback
 * (session ratings + platform reports) moved into Monitor from Content,
 * right after Analytics — it is something you watch, not content you write;
 * its key and `#/feedback/…` URLs did not change.
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
  | 'analytics'
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

/**
 * The admin handbook (Notion) — linked from the foot of the rail for every
 * signed-in admin, whatever their role. Opens in a new tab; the page must be
 * shared with the people who use the portal for the link to open for them.
 */
export const DOCUMENTATION_URL = 'https://www.notion.so/3d0dd85c630c8151bb66dcfb92257fae';

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'monitor',
    label: 'Monitor',
    items: [
      {
        key: 'analytics',
        label: 'Analytics',
        icon: '⌁',
        requires: 'overview.read',
        tabs: [
          // The landing page: the platform at a glance + what needs attention.
          { key: 'overview', label: 'Overview', requires: 'overview.read' },
          // Per-person analytics — a sortable roster, and a profile per trainee.
          { key: 'trainees', label: 'Trainees', requires: 'sessions.read' },
          { key: 'sessions', label: 'Sessions', requires: 'sessions.read' },
          // Was "Insights": how well the team handles pushback.
          { key: 'skills', label: 'Skills', requires: 'insights.read' },
          // Was "Traffic": how the app is used.
          { key: 'engagement', label: 'Engagement', requires: 'analytics.read' },
          { key: 'quality', label: 'AI quality', requires: 'quality.read' },
          { key: 'analyzer', label: 'Pet Analyzer', requires: 'analyzer.read' },
        ],
      },
      // What trainees told us (post-session ratings, bug reports): it is
      // something you watch, not content you author — so it sits under
      // Monitor, next to Analytics. Key and URLs (`#/feedback/…`) unchanged.
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
          // The subjects training is organised by (Probiotics, GI, …): the
          // objections inside each and the knowledge its scenarios read. The
          // team adds its own without a deploy. Was `objections` — old links
          // are rewritten by `legacyRoute()`.
          { key: 'categories', label: 'Categories', requires: 'scenarios.read' },
          { key: 'trainee', label: 'Trainee-built', requires: 'scenarios.read' },
        ],
      },
      { key: 'knowledge', label: 'Knowledge', icon: '▤', requires: 'knowledge.read' },
      { key: 'tuning', label: 'AI tuning', icon: '◎', requires: 'simulation.read' },
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
 * links in old emails must keep landing on the same screen. Likewise the
 * Studio's old `#/scenarios/objections` tab, now `#/scenarios/categories`.
 *
 * The same goes for the old Monitor screens: `#/overview`, `#/activity/…`,
 * `#/analytics/insights` and `#/analytics/traffic` all live inside the one
 * Analytics destination now.
 *
 * Any route that isn't an old one comes back as the SAME object, so a caller
 * can test `legacyRoute(r) !== r` to decide whether to rewrite the URL.
 */
export function legacyRoute(route: AdminRoute): AdminRoute {
  // Monitor became one Analytics destination: Overview is its first tab,
  // Activity's tabs moved in, Insights became Skills and Traffic Engagement.
  if (route.screen === 'overview') return { screen: 'analytics', tab: 'overview' };
  if (route.screen === 'activity') {
    return { screen: 'analytics', tab: route.tab === 'analyzer' ? 'analyzer' : 'sessions', id: route.id ?? null };
  }
  if (route.screen === 'analytics' && route.tab === 'insights') return { screen: 'analytics', tab: 'skills' };
  if (route.screen === 'analytics' && route.tab === 'traffic') return { screen: 'analytics', tab: 'engagement' };
  // The Studio's "Objections" tab became "Categories" (objections now live
  // inside their category on the same screen).
  if (route.screen === 'scenarios' && route.tab === 'objections') return { screen: 'scenarios', tab: 'categories' };
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
