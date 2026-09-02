/**
 * Left navigation rail.
 *
 * Replaces the wrapping pill bar that ran along the top. A vertical rail fits
 * grouped sections without wrapping, keeps the active destination visible
 * while you scroll, and gives the content column its full width back.
 *
 * Three states, one component:
 *   • expanded (default)  — 232px, labels + section headings
 *   • collapsed           — 68px icon rail, labels as native tooltips
 *   • drawer (< 900px)    — hidden, opened over the content with a scrim
 *
 * The collapsed choice is remembered per browser; the drawer is not, because a
 * drawer left open across navigations is a nuisance on a phone.
 */
import { useEffect, useState } from 'react';
import { COLOR } from '../lib/tokens';
import {
  visibleSections,
  type AdminScreen,
  type NavItem,
} from './nav';

const STORAGE_KEY = 'pbt:admin_nav_collapsed';
export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_COLLAPSED_WIDTH = 68;
/** Below this the rail becomes an overlay drawer rather than a column. */
export const SIDEBAR_BREAKPOINT = 900;

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < SIDEBAR_BREAKPOINT,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < SIDEBAR_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Private mode — the preference simply doesn't persist.
    }
  }, [collapsed]);

  // Esc closes the drawer, matching every other overlay in the portal.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const width = compact ? 0 : collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  return { collapsed, setCollapsed, compact, drawerOpen, setDrawerOpen, width };
}

export function Sidebar({
  active,
  onNav,
  permissions,
  identity,
  onSignOut,
  onChangePassword,
  collapsed,
  onToggleCollapsed,
  compact,
  drawerOpen,
  onCloseDrawer,
}: {
  active: AdminScreen;
  onNav: (s: AdminScreen) => void;
  permissions: readonly string[];
  identity: { name: string; email: string | null; role: string };
  onSignOut: () => void;
  onChangePassword: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  compact: boolean;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const sections = visibleSections(permissions);
  // In the drawer, labels are always shown — there's no room-saving to do when
  // the rail is floating over the content anyway.
  const showLabels = compact ? true : !collapsed;
  const width = compact ? SIDEBAR_WIDTH : collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const hidden = compact && !drawerOpen;

  return (
    <>
      {compact && drawerOpen && (
        <div
          onClick={onCloseDrawer}
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 44,
            background: 'rgba(20,5,8,0.35)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        />
      )}

      <nav
        aria-label="Admin sections"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 45,
          width,
          display: 'flex',
          flexDirection: 'column',
          transform: hidden ? `translateX(-${width + 12}px)` : 'translateX(0)',
          transition: 'transform 0.22s cubic-bezier(0.2,0.8,0.2,1), width 0.18s ease',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.72))',
          backdropFilter: 'blur(34px) saturate(190%)',
          WebkitBackdropFilter: 'blur(34px) saturate(190%)',
          borderRight: '0.5px solid rgba(60,20,15,0.09)',
          boxShadow: compact ? '0 24px 60px -20px rgba(60,20,15,0.28)' : 'none',
        }}
      >
        {/* Brand + collapse toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 60,
            padding: showLabels ? '0 12px 0 16px' : '0 0 0 18px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              flexShrink: 0,
              background: 'linear-gradient(135deg, oklch(0.66 0.22 22), oklch(0.50 0.24 18))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 10px -2px oklch(0.55 0.22 18 / 0.4)',
            }}
          >
            P
          </div>
          {showLabels && (
            <>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 800,
                  color: COLOR.ink,
                  letterSpacing: '-0.01em',
                }}
              >
                PBT Admin
              </div>
              <RailButton
                label={compact ? 'Close menu' : 'Collapse sidebar'}
                onClick={compact ? onCloseDrawer : onToggleCollapsed}
              >
                {compact ? '✕' : '⟨'}
              </RailButton>
            </>
          )}
        </div>

        {/* Sections */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: showLabels ? '4px 10px 12px' : '4px 0 12px',
          }}
        >
          {sections.map((section, i) => (
            <div key={section.key} style={{ marginBottom: 10 }}>
              {showLabels ? (
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: COLOR.inkMute,
                    fontFamily: 'var(--pbt-mono)',
                    padding: '10px 8px 6px',
                  }}
                >
                  {section.label}
                </div>
              ) : (
                i > 0 && (
                  <div
                    aria-hidden
                    style={{
                      height: 1,
                      margin: '9px 16px',
                      background: 'rgba(60,20,15,0.08)',
                    }}
                  />
                )
              )}
              {section.items.map((item) => (
                <NavRow
                  key={item.key}
                  item={item}
                  active={active === item.key}
                  showLabel={showLabels}
                  onClick={() => onNav(item.key)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Identity + sign out */}
        <div
          style={{
            flexShrink: 0,
            borderTop: '0.5px solid rgba(60,20,15,0.08)',
            padding: showLabels ? '10px 10px 12px' : '10px 0 12px',
          }}
        >
          {!showLabels && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <RailButton label="Expand sidebar" onClick={onToggleCollapsed}>
                ⟩
              </RailButton>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: showLabels ? '6px 8px' : 0,
              justifyContent: showLabels ? 'flex-start' : 'center',
            }}
          >
            <div
              title={identity.email ?? identity.name}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                flexShrink: 0,
                background: 'linear-gradient(135deg, oklch(0.72 0.10 250), oklch(0.60 0.12 250))',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initials(identity.name)}
            </div>
            {showLabels && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: COLOR.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {identity.name}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: COLOR.inkMute,
                    }}
                  >
                    {identity.role}
                  </div>
                </div>
                <RailButton label="Change password" onClick={onChangePassword}>
                  ✎
                </RailButton>
                <RailButton label="Sign out" onClick={onSignOut}>
                  ⏻
                </RailButton>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

function NavRow({
  item,
  active,
  showLabel,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  showLabel: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={showLabel ? undefined : item.label}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: showLabel ? '100%' : 44,
        margin: showLabel ? '1px 0' : '2px auto',
        height: 34,
        padding: showLabel ? '0 10px' : 0,
        justifyContent: showLabel ? 'flex-start' : 'center',
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--pbt-font)',
        fontSize: 12.5,
        fontWeight: active ? 800 : 600,
        color: active ? '#fff' : COLOR.inkSoft,
        background: active
          ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
          : 'transparent',
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 5px 12px -6px oklch(0.55 0.22 18 / 0.55)'
          : 'none',
        transition: 'background 0.14s ease, color 0.14s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(60,20,15,0.05)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: 'center' }}>
        {item.icon}
      </span>
      {showLabel && <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>}
    </button>
  );
}

function RailButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: 'rgba(60,20,15,0.06)',
        color: COLOR.inkSoft,
        fontSize: 12,
        lineHeight: 1,
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {children}
    </button>
  );
}

/** Menu affordance shown in the content column when the rail is a drawer. */
export function SidebarTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open navigation"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: 12,
        border: '0.5px solid rgba(255,255,255,0.9)',
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        color: COLOR.ink,
        fontSize: 15,
        cursor: 'pointer',
        boxShadow: '0 8px 20px -12px rgba(60,20,15,0.3)',
      }}
    >
      ☰
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
