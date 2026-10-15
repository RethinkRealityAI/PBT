/**
 * Analytics building blocks — the one visual vocabulary every Analytics tab
 * draws with, so seven tabs read as one product rather than seven screens.
 *
 * Chart rules (from the data-viz method this portal follows):
 *   - thin marks: bars ≤ 24px with a 4px rounded data end, 2px lines;
 *   - one series = one colour; colour follows the entity, never its rank;
 *   - sequential magnitude = one hue light → dark (`heatColor`), never a
 *     rainbow; status colours (good / watch / poor) only where the colour
 *     MEANS that, and always beside a word;
 *   - text never wears the series colour — a swatch beside it carries identity;
 *   - every chart has its numbers reachable without hovering (a value at the
 *     bar end, a table, or the tile itself).
 *
 * Styling stays inline like the rest of the admin app; the few states inline
 * styles can't express (hover, focus) use the shared `pbt-*` classes.
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Glass } from '../primitives/Glass';
import { Eyebrow, Sparkline } from '../primitives';
import { COLOR } from '../lib/tokens';
import { formatDelta, type Delta } from './lib/period';

// ─── Palette ────────────────────────────────────────────────────────────

/**
 * Chart colours. Identity hues are fixed per entity (a mode, an outcome) and
 * reused everywhere that entity appears; `muted` is the de-emphasis grey for
 * "everything else".
 */
export const CHART = {
  primary: COLOR.info,
  primarySoft: 'oklch(0.93 0.04 250)',
  accent: COLOR.brand,
  muted: 'oklch(0.80 0.015 40)',
  mutedSoft: 'oklch(0.95 0.008 40)',
  grid: 'rgba(60,20,15,0.07)',
  axis: COLOR.inkMute,
  track: 'oklch(0.955 0.008 40)',
  /** Team / benchmark reference marks. */
  benchmark: 'oklch(0.35 0.03 30)',
} as const;

/** Score bands — status colours, used only where the colour means good/poor. */
export function bandColor(score: number): string {
  return score >= 85 ? COLOR.success : score >= 70 ? COLOR.info : score >= 55 ? COLOR.warn : COLOR.danger;
}

export function bandWord(score: number): string {
  return score >= 85 ? 'Strong' : score >= 70 ? 'Solid' : score >= 55 ? 'Developing' : 'Needs work';
}

/**
 * Sequential one-hue ramp (blue, light → dark) for magnitude: heat grids,
 * calendars. `t` in [0, 1]; 0 renders the empty track so "none" reads as
 * absence rather than as the lightest amount.
 */
export function heatColor(t: number): string {
  if (!(t > 0)) return CHART.track;
  const k = Math.max(0, Math.min(1, t));
  const l = 0.9 - k * 0.42; // 0.90 → 0.48
  const c = 0.04 + k * 0.13; // 0.04 → 0.17
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 255)`;
}

export const tooltipStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.97)',
  border: '0.5px solid rgba(60,20,15,0.12)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 20px -8px rgba(60,20,15,0.22)',
  padding: '8px 10px',
};

// ─── Layout ─────────────────────────────────────────────────────────────

/**
 * Responsive grid: as many `min`-wide columns as fit. Replaces the fixed
 * `repeat(4, 1fr)` rows that crushed tiles under 1100px.
 */
export function AutoGrid({
  min = 220,
  gap = 16,
  children,
  style,
}: {
  min?: number;
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Two-up row that stacks under ~960px. `ratio` is the left share, e.g. "1.4fr 1fr". */
export function SplitRow({
  ratio = '1fr 1fr',
  children,
  minLeft = 420,
}: {
  ratio?: string;
  children: ReactNode;
  minLeft?: number;
}) {
  return (
    <div
      className="pbt-split-row"
      style={
        {
          display: 'grid',
          gridTemplateColumns: ratio,
          gap: 16,
          alignItems: 'stretch',
          '--pbt-split-min': `${minLeft}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('pbt-analytics-css')) {
  const s = document.createElement('style');
  s.id = 'pbt-analytics-css';
  s.textContent = `
    @media (max-width: 1080px) { .pbt-split-row { grid-template-columns: 1fr !important; } }
    .pbt-sortable { cursor: pointer; user-select: none; }
    .pbt-sortable:hover { color: ${COLOR.ink} !important; }
    .pbt-heat-cell { transition: transform 0.12s ease, box-shadow 0.12s ease; }
    .pbt-heat-cell:hover { transform: scale(1.18); box-shadow: 0 0 0 2px #fff, 0 2px 8px -2px rgba(60,20,15,0.35); z-index: 1; }
    .pbt-link { color: ${COLOR.brand}; font-weight: 700; background: none; border: none; cursor: pointer; padding: 0; font: inherit; }
    .pbt-link:hover { text-decoration: underline; }
    .pbt-link:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; border-radius: 4px; }
    @keyframes pbt-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .pbt-rise { animation: pbt-rise 0.35s ease both; }
    @media (prefers-reduced-motion: reduce) { .pbt-rise, .pbt-heat-cell { animation: none !important; transition: none !important; } }
  `;
  document.head.appendChild(s);
}

/**
 * A titled analytics card. `actions` sit top-right (a toggle, "View all");
 * `footnote` is the small print that says what was left out and why.
 */
export function Panel({
  title,
  subtitle,
  actions,
  footnote,
  children,
  padding = 22,
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  padding?: number;
  id?: string;
}) {
  const headingId = useId();
  return (
    <Glass padding={padding} radius={20} style={{ minWidth: 0 }}>
      <section aria-labelledby={headingId} id={id} style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h3
              id={headingId}
              style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.02em' }}
            >
              {title}
            </h3>
            {subtitle && <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 3, lineHeight: 1.45 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </header>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {footnote && <div style={{ fontSize: 11, color: COLOR.inkMute, lineHeight: 1.5 }}>{footnote}</div>}
      </section>
    </Glass>
  );
}

// ─── Figures ────────────────────────────────────────────────────────────

/**
 * Delta vs the previous period of the same length. Colour = direction ×
 * whether up is good for THIS metric (`goodWhen`), and it always carries the
 * arrow and the words, never colour alone.
 */
export function DeltaChip({
  delta,
  goodWhen = 'up',
  compareLabel,
  size = 'sm',
}: {
  delta: Delta | null;
  goodWhen?: 'up' | 'down' | 'neither';
  compareLabel?: string;
  size?: 'sm' | 'xs';
}) {
  if (!delta) return null;
  const { text, direction } = formatDelta(delta);
  const good =
    direction === 'flat' || goodWhen === 'neither'
      ? null
      : (direction === 'up') === (goodWhen === 'up');
  const fg = good == null ? COLOR.inkSoft : good ? 'oklch(0.42 0.14 145)' : 'oklch(0.48 0.18 25)';
  const bg = good == null ? 'oklch(0.95 0.008 40)' : good ? COLOR.successSoft : COLOR.dangerSoft;
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■';
  return (
    <span
      title={compareLabel ? `${text} ${compareLabel}` : text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'xs' ? '1px 6px' : '2px 8px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: size === 'xs' ? 10.5 : 11,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 8 }}>
        {arrow}
      </span>
      {text}
      {compareLabel && size === 'sm' && (
        <span style={{ fontWeight: 600, color: COLOR.inkMute, marginLeft: 2 }}>{compareLabel}</span>
      )}
    </span>
  );
}

/**
 * Headline number tile: label · value · delta vs previous period · trend.
 * `hint` is the one-line definition of what was counted — a bare number
 * invites the wrong reading.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  goodWhen = 'up',
  compareLabel,
  trend,
  trendColor = CHART.primary,
  hint,
  onClick,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: Delta | null;
  goodWhen?: 'up' | 'down' | 'neither';
  compareLabel?: string;
  trend?: number[];
  trendColor?: string;
  hint?: string;
  onClick?: () => void;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: emphasis ? 38 : 30,
            fontWeight: 750,
            color: COLOR.ink,
            letterSpacing: '-0.035em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.inkMute }}>{unit}</span>}
      </div>
      <div style={{ minHeight: 20, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {delta !== undefined && delta !== null ? (
          <DeltaChip delta={delta} goodWhen={goodWhen} compareLabel={compareLabel} />
        ) : delta === null && compareLabel ? (
          <span style={{ fontSize: 11, color: COLOR.inkMute }}>No earlier data to compare</span>
        ) : null}
      </div>
      {trend && trend.length > 1 && (
        <div style={{ marginTop: 8 }} aria-hidden="true">
          <Sparkline data={trend} width={260} height={30} color={trendColor} />
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 8, lineHeight: 1.4 }}>{hint}</div>}
    </>
  );
  const style: CSSProperties = {
    position: 'relative',
    borderRadius: 18,
    padding: '18px 18px 16px',
    minWidth: 0,
    textAlign: 'left',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.6) 100%)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '0.5px solid rgba(255,255,255,0.9)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 8px 24px -12px rgba(60,20,15,0.12)',
    fontFamily: 'var(--pbt-font)',
  };
  if (onClick) {
    return (
      <button type="button" className="pbt-btn" onClick={onClick} style={{ ...style, cursor: 'pointer', width: '100%' }}>
        {body}
      </button>
    );
  }
  return <div style={style}>{body}</div>;
}

/** Small label/value pair for dense rails ("Median length · 4m 12s"). */
export function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 18, fontWeight: 750, color: COLOR.ink, marginTop: 5, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Bars ───────────────────────────────────────────────────────────────

export interface BarListRow {
  key: string;
  label: ReactNode;
  value: number;
  /** What prints at the bar end; defaults to the value. */
  display?: ReactNode;
  /** Secondary text under/after the label. */
  sub?: ReactNode;
  color?: string;
  /** A reference tick drawn across the bar (e.g. the team average), same scale. */
  benchmark?: number | null;
  onClick?: () => void;
}

/**
 * Horizontal bar list — the workhorse for "which X has the most Y". Bars
 * share one scale (`max`, default = the largest value) so two lists on a page
 * can be read against each other when they pass the same max.
 */
export function BarList({
  rows,
  max,
  color = CHART.primary,
  emptyText = 'Nothing to show yet.',
  barHeight = 10,
}: {
  rows: BarListRow[];
  max?: number;
  color?: string;
  emptyText?: string;
  barHeight?: number;
}) {
  if (rows.length === 0) return <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '12px 0' }}>{emptyText}</div>;
  const top = max ?? Math.max(...rows.map((r) => Math.max(r.value, r.benchmark ?? 0)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((r) => {
        const pct = top > 0 ? Math.max(0, Math.min(100, (r.value / top) * 100)) : 0;
        const bench = r.benchmark != null && top > 0 ? Math.max(0, Math.min(100, (r.benchmark / top) * 100)) : null;
        const content = (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 650, color: COLOR.inkSoft, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
                {r.sub && <span style={{ fontWeight: 500, color: COLOR.inkMute, marginLeft: 6, fontSize: 11.5 }}>{r.sub}</span>}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {r.display ?? r.value}
              </span>
            </div>
            <div style={{ position: 'relative', height: barHeight, borderRadius: 4, background: CHART.track, marginTop: 5 }}>
              <div
                style={{
                  width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: r.color ?? color,
                  transition: 'width 0.6s ease',
                }}
              />
              {bench != null && (
                <span
                  title="Team average"
                  style={{
                    position: 'absolute',
                    top: -3,
                    bottom: -3,
                    left: `calc(${bench}% - 1px)`,
                    width: 2,
                    borderRadius: 1,
                    background: CHART.benchmark,
                    boxShadow: '0 0 0 1.5px rgba(255,255,255,0.9)',
                  }}
                />
              )}
            </div>
          </>
        );
        return r.onClick ? (
          <button
            key={r.key}
            type="button"
            onClick={r.onClick}
            className="pbt-focusable pbt-row-hover"
            style={{ all: 'unset', cursor: 'pointer', display: 'block', borderRadius: 8, padding: '2px 4px', margin: '-2px -4px' }}
          >
            {content}
          </button>
        ) : (
          <div key={r.key}>{content}</div>
        );
      })}
    </div>
  );
}

/** A stacked share bar (outcome mix, mode split) with its legend under it. */
export function ShareBar({
  parts,
  height = 12,
}: {
  parts: Array<{ key: string; label: string; value: number; color: string }>;
  height?: number;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height, borderRadius: 6, overflow: 'hidden', background: CHART.track }}>
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <div
                key={p.key}
                title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
                style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: 3 }}
              />
            ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
        {parts.map((p) => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COLOR.inkSoft }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.label}
            <strong style={{ color: COLOR.ink, fontVariantNumeric: 'tabular-nums' }}>{p.value}</strong>
            {total > 0 && <span style={{ color: COLOR.inkMute }}>{Math.round((p.value / total) * 100)}%</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Legend row for multi-series charts. */
export function Legend({ items }: { items: Array<{ label: string; color: string; shape?: 'dot' | 'line' | 'tick' }> }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COLOR.inkSoft }}>
          <span
            aria-hidden="true"
            style={
              i.shape === 'line'
                ? { width: 14, height: 2, borderRadius: 1, background: i.color }
                : i.shape === 'tick'
                  ? { width: 2, height: 12, borderRadius: 1, background: i.color }
                  : { width: 8, height: 8, borderRadius: '50%', background: i.color }
            }
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ─── Heat grid ──────────────────────────────────────────────────────────

/**
 * A rows × columns heat grid (weekday × hour, objection × skill). Cell colour
 * is one-hue sequential by default; pass `colorFor` for a scale that means
 * something else (a score band). Every cell's value is in its title and, with
 * `showValues`, printed in the cell.
 */
export function HeatGrid({
  rows,
  cols,
  value,
  colorFor,
  titleFor,
  cellSize = 22,
  showValues = false,
  formatValue = (v: number) => String(Math.round(v)),
  rowLabelWidth = 64,
  colLabelEvery = 1,
}: {
  rows: Array<{ key: string; label: ReactNode }>;
  cols: Array<{ key: string; label: string }>;
  value: (rowKey: string, colKey: string) => number | null;
  colorFor?: (v: number | null) => string;
  titleFor?: (rowKey: string, colKey: string, v: number | null) => string;
  cellSize?: number;
  showValues?: boolean;
  formatValue?: (v: number) => string;
  rowLabelWidth?: number;
  colLabelEvery?: number;
}) {
  let max = 0;
  for (const r of rows) for (const c of cols) max = Math.max(max, value(r.key, c.key) ?? 0);
  const color = colorFor ?? ((v: number | null) => heatColor(v != null && max > 0 ? v / max : 0));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table role="grid" style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            <th style={{ width: rowLabelWidth }} />
            {cols.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLOR.inkMute,
                  textAlign: 'center',
                  padding: '0 0 4px',
                  minWidth: cellSize,
                  whiteSpace: 'nowrap',
                }}
              >
                {i % colLabelEvery === 0 ? c.label : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th
                scope="row"
                style={{
                  fontSize: 11,
                  fontWeight: 650,
                  color: COLOR.inkSoft,
                  textAlign: 'left',
                  paddingRight: 8,
                  whiteSpace: 'nowrap',
                  maxWidth: rowLabelWidth * 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {r.label}
              </th>
              {cols.map((c) => {
                const v = value(r.key, c.key);
                const bg = color(v);
                const dark = isDarkFill(bg);
                return (
                  <td
                    key={c.key}
                    className="pbt-heat-cell"
                    title={titleFor ? titleFor(r.key, c.key, v) : `${c.label}: ${v ?? '—'}`}
                    style={{
                      position: 'relative',
                      width: showValues ? undefined : cellSize,
                      minWidth: cellSize,
                      height: cellSize,
                      borderRadius: 5,
                      background: bg,
                      textAlign: 'center',
                      fontSize: 11,
                      fontWeight: 750,
                      color: dark ? '#fff' : COLOR.inkSoft,
                      fontVariantNumeric: 'tabular-nums',
                      padding: showValues ? '0 6px' : 0,
                    }}
                  >
                    {showValues && v != null ? formatValue(v) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rough luminance test on the oklch strings this file produces. */
function isDarkFill(color: string): boolean {
  const m = /oklch\(\s*([\d.]+)/.exec(color);
  return m ? Number(m[1]) < 0.62 : false;
}

/** Scale key for a sequential heat grid: "Less ▢▢▢▢▢ More". */
export function HeatScale({ less = 'Less', more = 'More' }: { less?: string; more?: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: COLOR.inkMute }}>
      {less}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <span key={t} aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: t === 0 ? CHART.track : heatColor(t) }} />
      ))}
      {more}
    </div>
  );
}

// ─── Controls ───────────────────────────────────────────────────────────

/** Filter chips with counts (segments, statuses). One row, above what it scopes. */
export function ChipFilter<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ key: K; label: string; count?: number; tone?: string }>;
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            className="pbt-btn"
            onClick={() => onChange(o.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              borderRadius: 999,
              border: active ? '0.5px solid rgba(60,20,15,0.12)' : '0.5px solid rgba(255,255,255,0.9)',
              background: active ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.55)',
              boxShadow: active ? '0 2px 10px -4px rgba(60,20,15,0.25)' : 'none',
              color: active ? COLOR.ink : COLOR.inkSoft,
              fontWeight: active ? 800 : 650,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'var(--pbt-font)',
            }}
          >
            {o.tone && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: o.tone }} />}
            {o.label}
            {o.count != null && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: active ? COLOR.brandSoft : 'rgba(60,20,15,0.06)',
                  color: active ? COLOR.brand : COLOR.inkMute,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A compact native select styled to match the glass controls. */
export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: COLOR.inkMute }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pbt-focusable"
        style={{
          height: 32,
          padding: '0 8px',
          borderRadius: 10,
          border: '0.5px solid rgba(60,20,15,0.12)',
          background: 'rgba(255,255,255,0.8)',
          color: COLOR.ink,
          fontSize: 12.5,
          fontWeight: 600,
          fontFamily: 'var(--pbt-font)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Secondary glass button (Export CSV, Refresh). */
export function GhostButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="pbt-btn"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 13px',
        borderRadius: 11,
        background: 'rgba(255,255,255,0.75)',
        border: '0.5px solid rgba(60,20,15,0.1)',
        color: COLOR.inkSoft,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {children}
    </button>
  );
}

/** "Showing the data from …" line — when it was fetched, with a refresh. */
export function FreshnessNote({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  updatedAt: number | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const [, tick] = useState(0);
  if (updatedAt == null) return null;
  const secs = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const when = secs < 45 ? 'just now' : secs < 3600 ? `${Math.round(secs / 60)} min ago` : 'over an hour ago';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: COLOR.inkMute }}>
      {refreshing ? 'Refreshing…' : `Updated ${when}`}
      {onRefresh && !refreshing && (
        <button
          type="button"
          className="pbt-link"
          onClick={() => {
            onRefresh();
            tick((n) => n + 1);
          }}
          style={{ fontSize: 11.5 }}
        >
          Refresh
        </button>
      )}
    </span>
  );
}
