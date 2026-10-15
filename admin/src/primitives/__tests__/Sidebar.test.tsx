/**
 * The rail's Documentation link: every admin can reach the handbook, in a new
 * tab, whether the rail is expanded, collapsed to icons, or a drawer.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { DOCUMENTATION_URL } from '../nav';

function renderRail({ collapsed = false, permissions = [] as string[] } = {}) {
  return render(
    <Sidebar
      active="analytics"
      onNav={() => {}}
      permissions={permissions}
      identity={{ name: 'Test Admin', email: 'admin@example.com', role: 'support' }}
      onSignOut={() => {}}
      collapsed={collapsed}
      onToggleCollapsed={() => {}}
      compact={false}
      drawerOpen={false}
      onCloseDrawer={() => {}}
    />,
  );
}

describe('Sidebar documentation link', () => {
  it('opens the Notion handbook in a new tab without handing it the opener', () => {
    renderRail();
    const link = screen.getByRole('link', { name: /documentation/i });
    expect(link.getAttribute('href')).toBe(DOCUMENTATION_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('Documentation');
  });

  it('stays reachable (and named) when the rail is collapsed to icons', () => {
    renderRail({ collapsed: true });
    const link = screen.getByRole('link', { name: /documentation/i });
    expect(link.getAttribute('href')).toBe(DOCUMENTATION_URL);
  });

  it('needs no permission — a role with none still sees it', () => {
    renderRail({ permissions: [] });
    expect(screen.getAllByRole('link', { name: /documentation/i })).toHaveLength(1);
  });

  it('points at the Notion handbook over https', () => {
    expect(DOCUMENTATION_URL).toMatch(/^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/);
  });
});
