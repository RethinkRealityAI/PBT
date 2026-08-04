import { createContext, useContext, type ReactNode } from 'react';
import { COLOR } from '../lib/tokens';

// The navigation model moved to ./nav.ts and the rail itself to ./Sidebar.tsx.
// Re-exported here so existing imports keep working.
export type { AdminScreen, NavItem, NavSection, TabDef } from './nav';
export {
  NAV_SECTIONS,
  findNavItem,
  visibleItems,
  visibleSections,
  visibleTabs,
} from './nav';

/**
 * Section tabs.
 *
 * A destination like Analytics or People is one sidebar entry with several
 * tabs. Rather than thread tab props through ten screens, the destination
 * shell publishes them here and `ContextBar` — which every screen already
 * renders — picks them up. Screens stay unaware they are tabbed, and each keeps
 * its own title, range picker, search box, and export button.
 */
export interface SectionTabsValue {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}

const SectionTabsContext = createContext<SectionTabsValue | null>(null);

export function SectionTabsProvider({
  value,
  children,
}: {
  value: SectionTabsValue;
  children: ReactNode;
}) {
  return <SectionTabsContext.Provider value={value}>{children}</SectionTabsContext.Provider>;
}

export function useSectionTabs(): SectionTabsValue | null {
  return useContext(SectionTabsContext);
}

function SectionTabStrip({ value }: { value: SectionTabsValue }) {
  // A single tab is not a choice — a lone pill is just noise.
  if (value.tabs.length < 2) return null;
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        padding: 3,
        borderRadius: 13,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)',
        alignSelf: 'flex-start',
      }}
    >
      {value.tabs.map((tab) => {
        const active = tab.key === value.active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => value.onChange(tab.key)}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--pbt-font)',
              fontSize: 12.5,
              fontWeight: active ? 800 : 600,
              color: active ? COLOR.ink : COLOR.inkMute,
              background: active ? 'rgba(255,255,255,0.95)' : 'transparent',
              boxShadow: active ? '0 2px 8px -4px rgba(60,20,15,0.25)' : 'none',
              transition: 'background 0.14s ease, color 0.14s ease',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export const RANGE_OPTIONS = ['24h', '7d', '28d', '90d'] as const;
export type Range = (typeof RANGE_OPTIONS)[number];

export function ContextBar({
  title,
  subtitle,
  range,
  onRange,
  query,
  onQuery,
  onExport,
  actions,
}: {
  title: string;
  subtitle?: string;
  range?: Range | null;
  onRange?: (r: Range) => void;
  query?: string;
  onQuery?: (q: string) => void;
  onExport?: (() => void) | null;
  /** Screen-specific control rendered alongside search / range / export. */
  actions?: ReactNode;
}) {
  const sectionTabs = useSectionTabs();
  return (
    <div
      style={{
        padding: '20px 32px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxWidth: 1440,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', width: '100%' }}>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: COLOR.ink,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {actions}
        {onQuery && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 40,
              padding: '0 14px',
              minWidth: 180,
              maxWidth: 280,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255,255,255,0.9)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95)',
            }}
          >
            <span style={{ color: COLOR.inkMute, fontSize: 14 }}>⌕</span>
            <input
              value={query ?? ''}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                fontFamily: 'var(--pbt-font)',
                color: COLOR.ink,
                minWidth: 0,
              }}
            />
          </div>
        )}
        {range != null && onRange && (
          <div
            style={{
              display: 'inline-flex',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255,255,255,0.9)',
              padding: 3,
            }}
          >
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => onRange(r)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background:
                    range === r
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                      : 'transparent',
                  color: range === r ? '#fff' : COLOR.inkSoft,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {onExport && (
          <button
            onClick={onExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 40,
              padding: '0 14px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255,255,255,0.9)',
              color: COLOR.inkSoft,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ↓ Export
          </button>
        )}
      </div>
      </div>
      {sectionTabs && <SectionTabStrip value={sectionTabs} />}
    </div>
  );
}

export function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 32px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 1440,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}
