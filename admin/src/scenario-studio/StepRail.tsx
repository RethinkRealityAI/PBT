/**
 * The Studio's stepper.
 *
 * Seven numbered steps. A step whose answers are in shows ✓, one that needs a
 * look shows !, an optional one sits on a dotted bubble until it's used. These
 * are not a locked wizard: every step is one click away in any order — the
 * rail is how an admin sees where the scenario stands at a glance.
 *
 * Two shapes: a vertical rail beside the step on wide screens, and a row of
 * scrollable chips above it on narrow ones.
 */
import { useEffect, useRef } from 'react';
import { COLOR } from '../lib/tokens';
import type { StepStatus, StudioStepKey } from './studioModel';

export interface RailStep {
  key: StudioStepKey;
  label: string;
  status: StepStatus;
  detail?: string;
}

const STATUS_WORD: Record<StepStatus, string> = {
  done: 'Done',
  todo: 'To do',
  attention: 'Needs a look',
  optional: 'Optional',
};

function Bubble({
  index,
  status,
  active,
  size,
}: {
  index: number;
  status: StepStatus;
  active: boolean;
  size: number;
}) {
  const done = status === 'done';
  const attention = status === 'attention';
  const optional = status === 'optional';
  return (
    <span
      aria-hidden
      style={{
        position: 'relative',
        zIndex: 1,
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 999,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--pbt-mono)',
        fontSize: size > 24 ? 12 : 11,
        fontWeight: 800,
        background: done
          ? COLOR.success
          : attention
            ? COLOR.warnSoft
            : active
              ? '#fff'
              : 'rgba(255,255,255,0.85)',
        color: done ? '#fff' : attention ? 'oklch(0.45 0.14 70)' : active ? COLOR.brand : COLOR.inkMute,
        border: done
          ? `1.5px solid ${COLOR.success}`
          : attention
            ? `1.5px solid ${COLOR.warn}`
            : `1.5px ${optional ? 'dashed' : 'solid'} ${active ? COLOR.brand : 'rgba(60,20,15,0.22)'}`,
        boxShadow: active
          ? `0 0 0 3px color-mix(in oklab, ${COLOR.brand} 20%, transparent)`
          : 'none',
      }}
    >
      {done ? '✓' : attention ? '!' : index + 1}
    </span>
  );
}

function ariaLabelFor(step: RailStep, index: number): string {
  const word = STATUS_WORD[step.status];
  return `Step ${index + 1}: ${step.label} — ${word}${step.detail ? `. ${step.detail}` : ''}`;
}

export function StepRail({
  steps,
  active,
  onSelect,
  orientation,
}: {
  steps: RailStep[];
  active: StudioStepKey;
  onSelect: (key: StudioStepKey) => void;
  orientation: 'vertical' | 'horizontal';
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the current chip in view when the row scrolls sideways.
  useEffect(() => {
    if (orientation !== 'horizontal') return;
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }, [active, orientation]);

  if (orientation === 'horizontal') {
    return (
      <nav aria-label="Scenario steps" className="pbt-studio-scroll" style={{ overflowX: 'auto', margin: '0 -4px' }}>
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '4px 4px 8px',
            display: 'flex',
            gap: 8,
            width: 'max-content',
          }}
        >
          {steps.map((s, i) => {
            const on = s.key === active;
            return (
              <li key={s.key}>
                <button
                  ref={on ? activeRef : undefined}
                  type="button"
                  className="pbt-studio-chip"
                  aria-current={on ? 'step' : undefined}
                  aria-label={ariaLabelFor(s, i)}
                  title={s.detail}
                  onClick={() => onSelect(s.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 14px 5px 5px',
                    borderRadius: 999,
                    border: `1px solid ${on ? COLOR.brand : 'rgba(60,20,15,0.10)'}`,
                    background: on ? `color-mix(in oklab, ${COLOR.brand} 9%, white)` : 'rgba(255,255,255,0.72)',
                    color: COLOR.ink,
                    fontFamily: 'var(--pbt-font)',
                    fontSize: 12.5,
                    fontWeight: on ? 800 : 650,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Bubble index={i} status={s.status} active={on} size={24} />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Scenario steps">
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {steps.map((s, i) => {
          const on = s.key === active;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} style={{ position: 'relative' }}>
              {!last && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 23,
                    top: 40,
                    bottom: -8,
                    width: 2,
                    borderRadius: 2,
                    background:
                      s.status === 'done'
                        ? `color-mix(in oklab, ${COLOR.success} 45%, transparent)`
                        : 'rgba(60,20,15,0.10)',
                  }}
                />
              )}
              <button
                type="button"
                className="pbt-row-hover pbt-focusable"
                aria-current={on ? 'step' : undefined}
                aria-label={ariaLabelFor(s, i)}
                onClick={() => onSelect(s.key)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 14,
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--pbt-font)',
                  background: on ? 'rgba(255,255,255,0.92)' : 'transparent',
                  boxShadow: on ? '0 6px 18px -12px rgba(60,20,15,0.35)' : 'none',
                }}
              >
                <Bubble index={i} status={s.status} active={on} size={28} />
                <span style={{ minWidth: 0, paddingTop: 2 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13.5,
                      fontWeight: on ? 800 : 700,
                      color: on ? COLOR.ink : COLOR.inkSoft,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      color: s.status === 'attention' ? 'oklch(0.45 0.14 70)' : COLOR.inkMute,
                    }}
                  >
                    {s.detail ?? STATUS_WORD[s.status]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
