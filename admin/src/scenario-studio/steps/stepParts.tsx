/**
 * Small pieces the five content steps share: the step body rhythm, the
 * "Built-in: X · Use built-in" hint for library scenarios, the
 * finish-the-earlier-steps notice, and a number field with a unit.
 *
 * Built only from the Studio vocabulary (../ui) and admin tokens, inline
 * styles throughout — like everything else in the admin.
 */
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { COLOR } from '../../lib/tokens';
import { STUDIO_STEPS, type StudioDraft, type StudioStepKey } from '../studioModel';
import { stepForMissing } from './knowledgeModel';

/**
 * The vertical rhythm of a step: calm, generous gaps between sections.
 *
 * Deliberately NOT `.pbt-studio-in`: that animation leaves a `transform` on
 * the element, and a transformed ancestor becomes the containing block for
 * `position: fixed` — every inline `Modal` (InfoTip, the upload dialog)
 * would then cover only the step instead of the screen.
 */
export function StepBody({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: 32, minWidth: 0 }}>{children}</div>;
}

/**
 * A tile grid whose tiles STRETCH to fill the row (auto-fit), for small
 * fixed sets — two species side by side, four drivers as a 2×2 — where
 * `TileGrid`'s auto-fill would leave an empty column.
 */
export function FitGrid({ min, gap = 10, children }: { min: number; gap?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}

/** Equality for draft values, treating blank strings and null alike. */
export function sameDraftValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
    if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
    return v;
  };
  return norm(a) === norm(b);
}

/**
 * For a scenario that ships with the app: when a field differs from what it
 * ships with, say what it shipped with and offer to go back. Renders nothing
 * for Studio-written or trainee scenarios, or when the value is unchanged.
 */
export function BuiltInHint<K extends keyof StudioDraft>({
  base,
  draft,
  field,
  patch,
  canWrite,
  format,
  noun,
}: {
  base: StudioDraft | null;
  draft: StudioDraft;
  field: K;
  patch: (p: StudioDraft) => void;
  canWrite: boolean;
  /** How the built-in value reads to a person. */
  format?: (value: StudioDraft[K]) => string;
  /** "breed", "backstory" — for the button's accessible name. */
  noun: string;
}) {
  if (!base) return null;
  const builtIn = base[field];
  if (sameDraftValue(builtIn, draft[field])) return null;
  const shown =
    builtIn === null || builtIn === undefined || (typeof builtIn === 'string' && builtIn.trim() === '')
      ? 'not set'
      : format
        ? format(builtIn)
        : typeof builtIn === 'string' && builtIn.length > 90
          ? `${builtIn.slice(0, 90).trimEnd()}…`
          : String(builtIn);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        flexWrap: 'wrap',
        fontSize: 12,
        color: COLOR.inkMute,
        lineHeight: 1.45,
      }}
    >
      <span>
        <span style={{ fontWeight: 700 }}>Built-in:</span> {shown}
      </span>
      {canWrite && (
        <button
          type="button"
          onClick={() => patch({ [field]: builtIn ?? null } as StudioDraft)}
          aria-label={`Use the built-in ${noun}`}
          style={linkButton}
        >
          ↺ Use built-in
        </button>
      )}
    </div>
  );
}

export const linkButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: COLOR.brand,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--pbt-font)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
};

/** Human step name for a key ("The pet"). */
export function stepLabel(key: StudioStepKey): string {
  return STUDIO_STEPS.find((s) => s.key === key)?.label ?? key;
}

/**
 * "Finish the pet, pushback and owner steps first" — with the missing
 * answers named and a button to each step that fixes them.
 */
export function MissingNotice({
  missing,
  goTo,
  lead,
}: {
  missing: readonly string[];
  goTo: (step: StudioStepKey) => void;
  lead: string;
}) {
  const steps = Array.from(new Set(missing.map(stepForMissing)));
  return (
    <div
      role="status"
      style={{
        display: 'grid',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 14,
        background: COLOR.warnSoft,
        color: 'oklch(0.36 0.1 70)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div>
        <strong style={{ fontWeight: 800 }}>{lead}</strong>{' '}
        Still missing: {missing.join(', ')}.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {steps.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => goTo(s)}
            className="pbt-studio-chip"
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid color-mix(in oklab, oklch(0.62 0.18 70) 35%, transparent)',
              background: 'rgba(255,255,255,0.75)',
              color: COLOR.ink,
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'var(--pbt-font)',
              cursor: 'pointer',
            }}
          >
            Open “{stepLabel(s)}” →
          </button>
        ))}
      </div>
    </div>
  );
}

/** A number input with a unit sitting inside its right edge ("kg"). */
export function UnitInput({
  unit,
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  return (
    <div style={{ position: 'relative', maxWidth: 220 }}>
      <input
        {...rest}
        className="pbt-studio-field"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '11px 44px 11px 13px',
          borderRadius: 12,
          border: '1px solid rgba(60,20,15,0.14)',
          background: 'rgba(255,255,255,0.78)',
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: 'var(--pbt-font)',
          color: COLOR.ink,
          ...style,
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 13,
          fontWeight: 700,
          color: COLOR.inkMute,
          pointerEvents: 'none',
        }}
      >
        {unit}
      </span>
    </div>
  );
}

/** A labelled group of tiles/chips for assistive tech. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ minWidth: 0 }}>
      {children}
    </div>
  );
}

/** Small uppercase-free caption line under a group. */
export function Caption({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'warn' }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        lineHeight: 1.5,
        color: tone === 'warn' ? 'oklch(0.45 0.14 70)' : COLOR.inkMute,
      }}
    >
      {children}
    </div>
  );
}
