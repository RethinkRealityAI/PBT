/**
 * PBT admin shared primitives.
 * Adapted from the design-handoff JSX prototypes — typed, themed against
 * the main app's tokens, and trimmed of unused variants.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { COLOR, DRIVERS, RADIUS, type DriverKey } from '../lib/tokens';
import { initialsOf } from '../lib/format';

export { Glass } from './Glass';

// ── Sparkline ─────────────────────────────────────────────────
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = COLOR.brand,
  fill = true,
}: SparklineProps) {
  const uid = useMemo(() => `sp-${Math.random().toString(36).slice(2, 8)}`, []);
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const w = width;
  const h = height;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const linePath = pts
    .map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1))
    .join(' ');
  const fillPath = `${linePath} L${w},${h} L0,${h} Z`;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={fillPath} fill={`url(#${uid})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── KPI tile ─────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: string | number;
  delta?: number;
  sparkData?: number[];
  sparkColor?: string;
  accent?: string;
  icon?: ReactNode;
}

export function Kpi({
  label,
  value,
  delta,
  sparkData,
  sparkColor,
  accent,
  icon,
}: KpiProps) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: RADIUS.xl,
        padding: 20,
        minHeight: 140,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 100%)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: [
          '0 1px 0 rgba(255,255,255,0.95) inset',
          '0 8px 24px -10px rgba(60,20,15,0.10)',
        ].join(', '),
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Eyebrow>{label}</Eyebrow>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: COLOR.ink,
              letterSpacing: '-0.03em',
              marginTop: 8,
              lineHeight: 1,
            }}
          >
            {value}
          </div>
          {delta != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                fontSize: 11,
                fontWeight: 800,
                color: delta >= 0 ? COLOR.success : COLOR.danger,
              }}
            >
              <span style={{ fontSize: 9 }}>{delta >= 0 ? '▲' : '▼'}</span>
              {Math.abs(delta)}%
              <span style={{ color: COLOR.inkMute, fontWeight: 600 }}>
                {' '}
                vs last week
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: accent ?? COLOR.brandSoft,
              color: sparkColor ?? COLOR.brand,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 18,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      {sparkData && sparkData.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Sparkline
            data={sparkData}
            width={260}
            height={32}
            color={sparkColor ?? COLOR.brand}
          />
        </div>
      )}
    </div>
  );
}

// ── Status pill / chip ───────────────────────────────────────
type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: 'oklch(0.94 0.01 60)', fg: 'oklch(0.40 0.02 60)' },
  success: { bg: COLOR.successSoft, fg: 'oklch(0.40 0.14 145)' },
  warn: { bg: COLOR.warnSoft, fg: 'oklch(0.45 0.14 70)' },
  danger: { bg: COLOR.dangerSoft, fg: 'oklch(0.48 0.18 25)' },
  info: { bg: COLOR.infoSoft, fg: 'oklch(0.42 0.14 245)' },
};

export function StatusPill({
  tone = 'neutral',
  dot = true,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: t.fg,
          }}
        />
      )}
      {children}
    </span>
  );
}

// ── Driver chip ──────────────────────────────────────────────
export function DriverChip({ driver }: { driver: DriverKey | null }) {
  if (!driver) return <StatusPill tone="neutral" dot={false}>—</StatusPill>;
  const d = DRIVERS[driver];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px 3px 4px',
        borderRadius: 999,
        background: d.soft,
        color: d.color,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: d.color,
          color: '#fff',
          fontSize: 9,
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {d.glyph}
      </span>
      {d.key}
    </span>
  );
}

// ── Avatar ───────────────────────────────────────────────────
export function Avatar({
  name,
  driver,
  size = 32,
}: {
  name: string | null;
  driver: DriverKey | null;
  size?: number;
}) {
  const d = driver ? DRIVERS[driver] : DRIVERS.Activator;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${d.color}, color-mix(in oklab, ${d.color} 55%, white))`,
        color: '#fff',
        fontSize: size * 0.4,
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          '0 2px 6px -2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.45)',
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}

// ── Score badge ──────────────────────────────────────────────
export function ScoreBadge({
  score,
  size = 'md',
}: {
  score: number | null | undefined;
  size?: 'md' | 'lg';
}) {
  if (score == null)
    return (
      <span style={{ color: COLOR.inkMute, fontWeight: 600, fontSize: 13 }}>
        —
      </span>
    );
  const tone: Tone =
    score >= 85 ? 'success' : score >= 70 ? 'info' : score >= 55 ? 'warn' : 'danger';
  const t = TONE[tone];
  const big = size === 'lg';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: big ? 56 : 40,
        height: big ? 32 : 24,
        padding: big ? '0 10px' : '0 8px',
        borderRadius: 8,
        background: t.bg,
        color: t.fg,
        fontSize: big ? 16 : 12,
        fontWeight: 800,
      }}
    >
      {score}
    </span>
  );
}

// ── Eyebrow / SectionTitle ────────────────────────────────────
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        color: COLOR.inkMute,
        fontFamily: 'var(--pbt-mono)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: COLOR.ink,
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────
export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        color: COLOR.inkMute,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: COLOR.inkSoft }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

// ── Loading state (for query.loading) ────────────────────────
export function LoadingShimmer({ height = 120 }: { height?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: RADIUS.xl,
        background:
          'linear-gradient(90deg, rgba(255,255,255,0.6), rgba(255,255,255,0.85), rgba(255,255,255,0.6))',
        backgroundSize: '200% 100%',
        animation: 'pbt-shimmer 1.4s linear infinite',
        border: '0.5px solid rgba(255,255,255,0.9)',
      }}
    />
  );
}

// One-time keyframes injection for shimmer.
if (typeof document !== 'undefined' && !document.getElementById('pbt-admin-kf')) {
  const s = document.createElement('style');
  s.id = 'pbt-admin-kf';
  s.textContent = `@keyframes pbt-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`;
  document.head.appendChild(s);
}
