/**
 * The admin navigation model — who sees which destination, and where old
 * links land.
 *
 * The Scenario Studio split "Library" into three destinations. The two things
 * that must hold afterwards: a role built around scenario work (Scenario
 * Author) sees a portal made of scenario work and lands in the Studio, and
 * every old `#/library/…` bookmark still opens the screen it used to.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_NAV_ITEMS,
  NAV_SECTIONS,
  defaultTab,
  findNavItem,
  legacyRoute,
  visibleItems,
  visibleTabs,
} from '../nav';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLES,
  isPermission,
} from '../../../../src/shared/access/permissions';

function rolePermissions(key: string): string[] {
  const role = SYSTEM_ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`no system role ${key}`);
  return [...role.permissions];
}

describe('NAV_SECTIONS', () => {
  it('has unique destination keys and only real permissions', () => {
    const keys = ALL_NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of ALL_NAV_ITEMS) {
      expect(isPermission(item.requires)).toBe(true);
      for (const tab of item.tabs ?? []) expect(isPermission(tab.requires)).toBe(true);
    }
  });

  it('no longer has a Library destination', () => {
    expect(findNavItem('library')).toBeUndefined();
  });

  it('puts Scenario Studio first in Content, then Knowledge and AI tuning', () => {
    const content = NAV_SECTIONS.find((s) => s.key === 'content')!;
    expect(content.items.map((i) => i.label)).toEqual([
      'Scenario Studio',
      'Knowledge',
      'AI tuning',
      'Feedback',
    ]);
  });

  it('gives the Studio two tabs, both readable with scenarios.read', () => {
    const studio = findNavItem('scenarios')!;
    expect(studio.requires).toBe('scenarios.read');
    expect(studio.tabs?.map((t) => [t.key, t.label, t.requires])).toEqual([
      ['studio', 'Studio', 'scenarios.read'],
      ['trainee', 'Trainee-built', 'scenarios.read'],
    ]);
    expect(findNavItem('knowledge')).toMatchObject({ label: 'Knowledge', requires: 'knowledge.read' });
    expect(findNavItem('knowledge')!.tabs).toBeUndefined();
    expect(findNavItem('tuning')).toMatchObject({ label: 'AI tuning', requires: 'simulation.read' });
    expect(findNavItem('tuning')!.tabs).toBeUndefined();
  });
});

describe('visibleItems by role', () => {
  it('shows a Scenario Author only scenario work, and lands them on the Studio', () => {
    const perms = rolePermissions('scenario_author');
    const items = visibleItems(perms);
    // Scenario Studio + Knowledge are the job. `preview.read` is part of the
    // role (the trainee-app preview the Test drive links to), so the
    // Preview destination rides along — nothing else does.
    expect(items.map((i) => i.key)).toEqual(['scenarios', 'knowledge', 'preview']);
    // App.tsx lands on the first visible destination, on its default tab.
    expect(items[0].key).toBe('scenarios');
    expect(defaultTab(items[0], perms)).toBe('studio');
    // No Monitor, People, AI tuning or Platform-admin screens.
    for (const hidden of ['overview', 'analytics', 'people', 'tuning', 'flags', 'audit', 'email']) {
      expect(items.find((i) => i.key === hidden)).toBeUndefined();
    }
  });

  it('shows the Studio (both tabs) to anyone with scenarios.read', () => {
    const items = visibleItems(['scenarios.read']);
    expect(items.map((i) => i.key)).toEqual(['scenarios']);
    expect(visibleTabs(items[0], ['scenarios.read']).map((t) => t.key)).toEqual([
      'studio',
      'trainee',
    ]);
  });

  it('shows the analyst the Studio alongside their Monitor screens', () => {
    const items = visibleItems(rolePermissions('analyst'));
    expect(items.map((i) => i.key)).toContain('scenarios');
    expect(items.map((i) => i.key)).not.toContain('tuning');
    expect(items[0].key).toBe('overview');
  });

  it('hides Knowledge and AI tuning without their permissions', () => {
    const keys = visibleItems(['scenarios.read', 'scenarios.write']).map((i) => i.key);
    expect(keys).not.toContain('knowledge');
    expect(keys).not.toContain('tuning');
  });

  it('gives an owner every destination', () => {
    expect(visibleItems([...ALL_PERMISSIONS]).length).toBe(ALL_NAV_ITEMS.length);
  });
});

describe('legacyRoute', () => {
  it.each([
    [{ screen: 'library', tab: 'scenarios' }, { screen: 'scenarios', tab: 'trainee' }],
    [{ screen: 'library', tab: 'builder' }, { screen: 'scenarios', tab: 'studio' }],
    [{ screen: 'library', tab: 'knowledge' }, { screen: 'knowledge', tab: null }],
    [{ screen: 'library', tab: 'simulation' }, { screen: 'tuning', tab: null }],
    [{ screen: 'library', tab: null }, { screen: 'scenarios', tab: 'studio' }],
  ])('maps %o to %o', (from, to) => {
    expect(legacyRoute(from)).toEqual(to);
  });

  it('sends a Library tab that never existed to the Studio', () => {
    expect(legacyRoute({ screen: 'library', tab: 'nope' })).toEqual({
      screen: 'scenarios',
      tab: 'studio',
    });
  });

  it('returns every other route unchanged — the same object', () => {
    for (const route of [
      { screen: 'overview', tab: null },
      { screen: 'scenarios', tab: 'studio' },
      { screen: 'knowledge', tab: null },
      { screen: 'people', tab: 'roles' },
    ]) {
      expect(legacyRoute(route)).toBe(route);
    }
  });

  it('only ever maps onto destinations that exist', () => {
    for (const tab of ['scenarios', 'builder', 'knowledge', 'simulation', null]) {
      const to = legacyRoute({ screen: 'library', tab });
      const item = findNavItem(to.screen);
      expect(item).toBeDefined();
      if (to.tab) expect(item!.tabs?.map((t) => t.key)).toContain(to.tab);
    }
  });
});
