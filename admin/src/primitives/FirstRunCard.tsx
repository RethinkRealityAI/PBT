/**
 * First-run guidance.
 *
 * Several admin screens are only legible if you already know the model behind
 * them — what a flag rule's priority does, what "seed" pulls from, what a
 * simulation weight changes. A one-time card explains it in place, then gets
 * out of the way permanently.
 *
 * Dismissal is per-`id` and local to the browser: this is orientation, not
 * account state, so it isn't worth a round trip or a column.
 */
import { useState, type ReactNode } from 'react';
import { COLOR, RADIUS } from '../lib/tokens';
import { Glass } from './Glass';
import { Eyebrow } from './index';

const PREFIX = 'pbt:admin:firstrun:';

export function firstRunKey(id: string): string {
  return `${PREFIX}${id}`;
}

function readDismissed(id: string): boolean {
  try {
    return localStorage.getItem(firstRunKey(id)) === '1';
  } catch {
    // Private mode / blocked storage: show the card rather than crash. Worst
    // case someone dismisses it once per session.
    return false;
  }
}

export function FirstRunCard({
  id,
  title,
  children,
}: {
  /** Stable slug — becomes the storage key. Don't rename it casually. */
  id: string;
  title: string;
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(id));
  if (dismissed) return null;

  return (
    <Glass
      padding={16}
      radius={RADIUS.lg}
      style={{
        border: `1px solid color-mix(in oklab, ${COLOR.brand} 22%, transparent)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow style={{ color: COLOR.brand }}>Getting started</Eyebrow>
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              fontWeight: 800,
              color: COLOR.ink,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: COLOR.inkSoft,
            }}
          >
            {children}
          </div>
        </div>
        <button
          type="button"
          className="pbt-btn"
          aria-label={`Dismiss “${title}” tip`}
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(firstRunKey(id), '1');
            } catch {
              /* storage blocked — the card just returns next session */
            }
          }}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.7)',
            color: COLOR.inkMute,
            cursor: 'pointer',
            fontSize: 15,
            lineHeight: 1,
            fontFamily: 'var(--pbt-font)',
          }}
        >
          ×
        </button>
      </div>
    </Glass>
  );
}
