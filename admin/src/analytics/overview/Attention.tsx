/**
 * "Needs your attention" — the inbox built by `lib/attention.ts`. Each row is
 * one button (the whole row is the target): what's wrong, the figure behind
 * it, and where it takes you. An honest "All clear" when nothing does.
 */
import { COLOR } from '../../lib/tokens';
import { Panel } from '../ui';
import type { AttentionItem, AttentionTarget, AttentionTone } from '../lib/attention';
import './styles';

const TONE: Record<AttentionTone, { fg: string; bg: string; glyph: string; word: string }> = {
  danger: { fg: 'oklch(0.50 0.19 25)', bg: COLOR.dangerSoft, glyph: '!', word: 'Urgent' },
  warn: { fg: 'oklch(0.50 0.14 70)', bg: COLOR.warnSoft, glyph: '!', word: 'Worth a look' },
  info: { fg: 'oklch(0.45 0.13 250)', bg: COLOR.infoSoft, glyph: 'i', word: 'For your information' },
};

export function AttentionPanel({
  items,
  checked,
  onGo,
}: {
  items: AttentionItem[];
  /** What was checked, for the all-clear line ("practice habits, low scores, problem reports"). */
  checked: string;
  onGo: (target: AttentionTarget) => void;
}) {
  return (
    <Panel
      title="Needs your attention"
      subtitle={items.length ? 'Most important first' : undefined}
      actions={
        items.length > 0 ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(60,20,15,0.06)',
              color: COLOR.inkSoft,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        ) : undefined
      }
    >
      <div className="pbt-ov-cq">
        {items.length === 0 ? (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 4px' }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                background: COLOR.successSoft,
                color: 'oklch(0.42 0.14 145)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink }}>All clear</div>
              <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 3, lineHeight: 1.5 }}>
                Nothing needs you right now. Checked: {checked}.
              </div>
            </div>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: '0 -12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map((it) => {
              const t = TONE[it.tone];
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    className="pbt-ov-inbox-row"
                    onClick={() => onGo(it.action.target)}
                    aria-label={`${t.word}: ${it.title}. ${it.action.label}`}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        background: t.bg,
                        color: t.fg,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: 14,
                        fontFamily: 'var(--pbt-font)',
                      }}
                    >
                      {t.glyph}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.01em' }}>
                        {it.title}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: COLOR.inkMute, marginTop: 3, lineHeight: 1.5 }}>
                        {it.detail}
                      </span>
                    </span>
                    <span
                      className="pbt-ov-go"
                      style={{ fontSize: 12, fontWeight: 750, color: COLOR.brand, whiteSpace: 'nowrap', paddingTop: 2 }}
                    >
                      {it.action.label} →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
