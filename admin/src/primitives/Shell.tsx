import type { ReactNode } from 'react';
import { COLOR, RADIUS } from '../lib/tokens';

export type AdminScreen =
  | 'overview'
  | 'users'
  | 'sessions'
  | 'scenarios'
  | 'analyzer'
  | 'quality';

export interface NavItem {
  key: AdminScreen;
  label: string;
  icon: string; // emoji glyph; keeps the admin app dependency-free.
}

export const ADMIN_NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: '✦' },
  { key: 'users', label: 'Users', icon: '◔' },
  { key: 'sessions', label: 'Sessions', icon: '◇' },
  { key: 'scenarios', label: 'Scenarios', icon: '▤' },
  { key: 'analyzer', label: 'Pet Analyzer', icon: '✿' },
  { key: 'quality', label: 'AI Quality', icon: '✺' },
];

export function FloatingNav({
  active,
  onNav,
  counts,
}: {
  active: AdminScreen;
  onNav: (s: AdminScreen) => void;
  counts?: Partial<Record<AdminScreen, number>>;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 14,
        zIndex: 30,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 24px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 6,
          borderRadius: RADIUS.xl,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.62))',
          backdropFilter: 'blur(36px) saturate(200%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%)',
          border: '0.5px solid rgba(255,255,255,0.95)',
          boxShadow: [
            '0 1px 0 rgba(255,255,255,0.98) inset',
            '0 12px 32px -12px rgba(60,20,15,0.16)',
            '0 28px 60px -28px rgba(60,20,15,0.18)',
          ].join(', '),
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px 0 8px',
            height: 40,
            borderRight: '0.5px solid rgba(60,20,15,0.08)',
            marginRight: 4,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background:
                'linear-gradient(135deg, oklch(0.66 0.22 22), oklch(0.50 0.24 18))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 13,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 10px -2px oklch(0.55 0.22 18 / 0.4)',
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: COLOR.ink,
              letterSpacing: '-0.01em',
            }}
          >
            PBT Admin
          </div>
        </div>
        {ADMIN_NAV.map((item) => {
          const isActive = active === item.key;
          const count = counts?.[item.key];
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 40,
                padding: '0 14px',
                borderRadius: 16,
                background: isActive
                  ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                  : 'transparent',
                color: isActive ? '#fff' : COLOR.inkSoft,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                boxShadow: isActive
                  ? 'inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 14px -6px oklch(0.55 0.22 18 / 0.55)'
                  : 'none',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(60,20,15,0.05)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
              {count != null && count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: isActive
                      ? 'rgba(255,255,255,0.25)'
                      : 'oklch(0.94 0.02 20)',
                    color: isActive ? '#fff' : 'oklch(0.45 0.04 20)',
                    minWidth: 18,
                    textAlign: 'center',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
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
}: {
  title: string;
  subtitle?: string;
  range?: Range | null;
  onRange?: (r: Range) => void;
  query?: string;
  onQuery?: (q: string) => void;
  onExport?: (() => void) | null;
}) {
  return (
    <div
      style={{
        padding: '20px 32px 0',
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        maxWidth: 1440,
        margin: '0 auto',
        width: '100%',
      }}
    >
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
