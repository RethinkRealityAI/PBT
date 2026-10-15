/**
 * Small pieces shared by the Trainees roster and a trainee's profile:
 * status / role / "New" badges, the five-skill mini bars, a sortable header,
 * and the container-query layout classes the profile is built from.
 */
import type { CSSProperties, ReactNode } from 'react';
import { StatusPill } from '../../primitives';
import { COLOR, DRIVERS, type DriverKey } from '../../lib/tokens';
import { CHART } from '../ui';
import { SKILL_KEYS, SKILL_LABELS, type SkillKey } from '../lib/metrics';
import { STATUS_HELP, STATUS_LABELS, type TraineeStatus } from '../lib/trainees';
import { roleLabel } from '../lib/traineeRoster';

// ─── Layout (container queries: the content column, not the viewport) ──

if (typeof document !== 'undefined' && !document.getElementById('pbt-trainee-css')) {
  const s = document.createElement('style');
  s.id = 'pbt-trainee-css';
  s.textContent = `
    .pbt-tp { container: tp / inline-size; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .pbt-tp-kpis { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pbt-tp-split, .pbt-tp-cols { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
    .pbt-tp-split { align-items: stretch; }
    .pbt-tp-cols { align-items: start; }
    .pbt-tp-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .pbt-tp-facts { display: grid; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @container tp (min-width: 560px) {
      .pbt-tp-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .pbt-tp-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @container tp (min-width: 900px) {
      .pbt-tp-split, .pbt-tp-cols { grid-template-columns: minmax(0, 1.62fr) minmax(320px, 1fr); }
    }
    .pbt-tq { container: tq / inline-size; min-width: 0; }
    @container tq (max-width: 620px) { .pbt-tq-hide { display: none !important; } }
    @container tq (max-width: 440px) { .pbt-tq-hide-xs { display: none !important; } }
    .pbt-roster-row { cursor: pointer; transition: background 0.14s ease; }
    .pbt-roster-row:hover { background: rgba(60,20,15,0.035); }
    .pbt-rq { container: rq / inline-size; }
    @container rq (max-width: 960px) {
      .pbt-rq-scroll {
        background:
          linear-gradient(to left, rgba(253,251,250,0), rgb(253,251,250) 70%) right / 28px 100% no-repeat local,
          radial-gradient(farthest-side at 100% 50%, rgba(60,20,15,0.14), rgba(60,20,15,0)) right / 14px 100% no-repeat scroll;
      }
      .pbt-roster-sticky { position: sticky; left: 0; z-index: 1; background: rgb(252,250,249); box-shadow: 1px 0 0 ${COLOR.border}; }
      .pbt-roster-row:hover .pbt-roster-sticky { background: rgb(249,245,243); }
    }
    .pbt-name-btn { all: unset; cursor: pointer; font-weight: 750; color: ${COLOR.ink}; border-radius: 4px; }
    .pbt-name-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
    .pbt-name-btn:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; }
    .pbt-sort-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; }
    .pbt-sort-btn:hover { color: ${COLOR.ink}; }
    .pbt-sort-btn:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; }
    .pbt-session-row { all: unset; box-sizing: border-box; display: grid; align-items: center; gap: 12px; width: calc(100% + 20px);
      padding: 10px 10px; margin: 0 -10px; border-radius: 12px; cursor: pointer; transition: background 0.14s ease; }
    .pbt-session-row:hover { background: rgba(60,20,15,0.04); }
    .pbt-session-row:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 1px; }
    /* After .pbt-session-row: its \`all: unset\` would otherwise reset the columns. */
    .pbt-sess-grid { grid-template-columns: 86px minmax(0, 1fr) 116px 64px 84px; }
    @container tq (max-width: 620px) { .pbt-sess-grid { grid-template-columns: 78px minmax(0, 1fr) 84px; } }
    @media (prefers-reduced-motion: reduce) { .pbt-roster-row, .pbt-session-row { transition: none !important; } }
  `;
  document.head.appendChild(s);
}

// ─── Identity bits ─────────────────────────────────────────────────────

export function asDriver(v: string | null | undefined): DriverKey | null {
  return v && v in DRIVERS ? (v as DriverKey) : null;
}

export const STATUS_TONE: Record<TraineeStatus, 'success' | 'warn' | 'danger' | 'neutral'> = {
  active: 'success',
  at_risk: 'warn',
  dormant: 'danger',
  not_started: 'neutral',
};

/** Dot colours for the status filter chips (same meaning as the pills). */
export const STATUS_DOT: Record<TraineeStatus | 'new', string> = {
  active: COLOR.success,
  at_risk: COLOR.warn,
  dormant: COLOR.danger,
  not_started: 'oklch(0.70 0.01 60)',
  new: COLOR.info,
};

export function TraineeStatusPill({ status }: { status: TraineeStatus }) {
  return (
    <span title={STATUS_HELP[status]}>
      <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusPill>
    </span>
  );
}

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: 6,
  fontSize: 10.5,
  fontWeight: 750,
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
  lineHeight: '16px',
};

export function Tag({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'info' | 'muted'; title?: string }) {
  const colors =
    tone === 'info'
      ? { background: COLOR.infoSoft, color: 'oklch(0.42 0.14 245)' }
      : tone === 'muted'
        ? { background: 'rgba(60,20,15,0.06)', color: COLOR.inkMute }
        : { background: 'oklch(0.95 0.01 40)', color: COLOR.inkSoft, border: '0.5px solid rgba(60,20,15,0.08)' };
  return (
    <span title={title} style={{ ...tagStyle, ...colors }}>
      {children}
    </span>
  );
}

export function NewTag() {
  return (
    <Tag tone="info" title="Joined in the last 14 days">
      New
    </Tag>
  );
}

export function RoleTag({ role }: { role: string | null }) {
  const label = roleLabel(role);
  if (!label) return null;
  return <Tag title="Also has admin portal access">{label}</Tag>;
}

export function DisabledTag() {
  return (
    <Tag tone="muted" title="This account is switched off and can't sign in">
      Disabled
    </Tag>
  );
}

// ─── Five-skill mini bars ──────────────────────────────────────────────

/**
 * The five ACT skills as five thin columns, the weakest one picked out in
 * the "needs work" colour with its name beside it — readable at a glance in
 * a table row; the exact numbers are in the title and the profile.
 */
export function SkillMiniBars({
  skills,
  weakest,
}: {
  skills: Record<SkillKey, number | null>;
  weakest: SkillKey | null;
}) {
  const known = SKILL_KEYS.filter((k) => skills[k] != null);
  if (known.length === 0) return <span style={{ color: COLOR.inkMute, fontSize: 12.5 }}>—</span>;
  const summary = SKILL_KEYS.map((k) => `${SKILL_LABELS[k]} ${skills[k] == null ? '—' : Math.round(skills[k] as number)}`).join(' · ');
  const H = 22;
  return (
    <span title={summary} aria-label={`Skills: ${summary}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={5 * 5 + 4 * 3} height={H} aria-hidden="true" style={{ flexShrink: 0, overflow: 'visible' }}>
        {SKILL_KEYS.map((k, i) => {
          const v = skills[k];
          const h = v == null ? 0 : Math.max(2, (Math.max(0, Math.min(100, v)) / 100) * H);
          return (
            <g key={k}>
              <rect x={i * 8} y={0} width={5} height={H} rx={2} fill={CHART.track} />
              {v != null && (
                <rect x={i * 8} y={H - h} width={5} height={h} rx={2} fill={k === weakest ? COLOR.warn : 'oklch(0.68 0.09 250)'} />
              )}
            </g>
          );
        })}
      </svg>
      {weakest && skills[weakest] != null && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft }}>{SKILL_LABELS[weakest]}</span>
          <span style={{ fontSize: 11, color: COLOR.inkMute }}>weakest · {Math.round(skills[weakest] as number)}</span>
        </span>
      )}
    </span>
  );
}

// ─── Sortable header ───────────────────────────────────────────────────

export function SortHeader<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = 'left',
  title,
  style,
  className,
}: {
  label: string;
  sortKey: K;
  active: K;
  dir: 'asc' | 'desc';
  onSort: (k: K) => void;
  align?: 'left' | 'right';
  title?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const on = sortKey === active;
  return (
    <th
      className={className}
      scope="col"
      aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ ...thStyle, textAlign: align, ...style }}
    >
      <button type="button" className="pbt-sort-btn" onClick={() => onSort(sortKey)} title={title} style={{ color: on ? COLOR.ink : COLOR.inkMute }}>
        {label}
        <span aria-hidden="true" style={{ fontSize: 8, opacity: on ? 1 : 0.35, width: 8 }}>
          {on ? (dir === 'asc' ? '▲' : '▼') : '▼'}
        </span>
      </button>
    </th>
  );
}

export const thStyle: CSSProperties = {
  padding: '10px 12px',
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: COLOR.inkMute,
  fontFamily: 'var(--pbt-mono)',
  whiteSpace: 'nowrap',
  borderBottom: `1px solid ${COLOR.border}`,
};

export const tdStyle: CSSProperties = {
  padding: '12px 12px',
  fontSize: 13,
  color: COLOR.inkSoft,
  borderBottom: `1px solid ${COLOR.borderSoft}`,
  verticalAlign: 'middle',
};

/** Muted inline text. */
export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ color: COLOR.inkMute, fontSize: 11.5, ...style }}>{children}</span>;
}
