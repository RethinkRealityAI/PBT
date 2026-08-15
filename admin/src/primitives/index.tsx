/**
 * PBT admin shared primitives.
 * Adapted from the design-handoff JSX prototypes — typed, themed against
 * the main app's tokens, and trimmed of unused variants.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { COLOR, DRIVERS, RADIUS, type DriverKey } from '../lib/tokens';
import { initialsOf } from '../lib/format';
import { Glass } from './Glass';

export { Glass };

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
  s.textContent = `
    @keyframes pbt-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    @keyframes pbt-modal-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes pbt-fade-in { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(s);
}

// ── Modal primitive ──────────────────────────────────────────
//
// Centered glass card on a frosted scrim. Clicking the scrim closes;
// pressing Escape closes; body scroll is locked while open. Same visual
// language as the consumer-app modals so the dashboard feels of a piece.
export function Modal({
  open,
  onClose,
  children,
  width = 720,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  ariaLabel?: string;
}) {
  // Lock body scroll + Esc-to-close while the modal is mounted.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(20,5,8,0.42)',
        backdropFilter: 'blur(10px) saturate(160%)',
        WebkitBackdropFilter: 'blur(10px) saturate(160%)',
        animation: 'pbt-fade-in 0.18s ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: width,
          maxHeight: '88vh',
          borderRadius: 24,
          overflow: 'hidden',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82))',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '0.5px solid rgba(255,255,255,0.95)',
          boxShadow: [
            '0 1px 0 rgba(255,255,255,0.95) inset',
            '0 -1px 0 rgba(255,255,255,0.5) inset',
            '0 32px 80px -20px rgba(20,5,8,0.4)',
            '0 80px 120px -40px rgba(20,5,8,0.5)',
          ].join(', '),
          display: 'flex',
          flexDirection: 'column',
          animation: 'pbt-modal-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Pill button (tab / toggle) ────────────────────────────────
export function PillButton({
  active,
  onClick,
  children,
  size = 'md',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: size === 'sm' ? '6px 12px' : '8px 16px',
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        background: active
          ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
          : 'rgba(255,255,255,0.7)',
        color: active ? '#fff' : COLOR.inkSoft,
        fontWeight: 700,
        fontSize: size === 'sm' ? 12 : 13,
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {children}
    </button>
  );
}

// ── Collapsible (Glass accordion card) ────────────────────────
export function Collapsible({
  title,
  badge,
  accent,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: ReactNode;
  accent?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Glass padding={0} radius={16}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--pbt-font)',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            transition: 'transform 0.18s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            color: COLOR.inkMute,
            fontSize: 12,
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: 800, fontSize: 14, color: COLOR.ink }}>{title}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {accent}
          {badge}
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(60,20,15,0.06)' }}>
          <div style={{ paddingTop: 14 }}>{children}</div>
        </div>
      )}
    </Glass>
  );
}

// ── InfoTip (inline "?" that opens an explainer modal) ────────
// Drop next to a field label or section title when a one-line help string
// isn't enough. `title` names the setting; `children` is the long-form
// explanation (what changing it does, with examples).
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`What does “${title}” do?`}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9999,
          border: `1px solid ${COLOR.border}`,
          background: 'transparent',
          color: COLOR.inkMute,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          padding: 0,
          verticalAlign: 'middle',
          fontFamily: 'var(--pbt-font)',
        }}
      >
        ?
      </button>
      <Modal open={open} onClose={() => setOpen(false)} width={560} ariaLabel={title}>
        <div style={{ padding: 26 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Eyebrow>How this works</Eyebrow>
              <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: COLOR.ink }}>
                {title}
              </h2>
            </div>
            <ModalCloseButton onClose={() => setOpen(false)} />
          </div>
          <div style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.6, color: COLOR.ink }}>
            {children}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.7)',
        color: COLOR.ink,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
      }}
    >
      ×
    </button>
  );
}
