/**
 * The Overview's opening card: the narrative (what happened, in a sentence
 * or three) beside the team's practice habit (who's active, slipping,
 * dormant, not started) — the 30-second answer before any chart.
 */
import { Glass } from '../../primitives/Glass';
import { Eyebrow } from '../../primitives';
import { COLOR } from '../../lib/tokens';
import { CHART } from '../ui';
import type { NarrativeSentence } from '../lib/narrative';
import { narrativeText } from '../lib/narrative';
import { STATUS_HELP, STATUS_LABELS, type TraineeStatus } from '../lib/trainees';
import './styles';

/** Status colours mean good → poor and always sit beside their word. */
export const STATUS_COLORS: Record<TraineeStatus, string> = {
  active: COLOR.success,
  at_risk: COLOR.warn,
  dormant: COLOR.danger,
  not_started: CHART.muted,
};

const ORDER: TraineeStatus[] = ['active', 'at_risk', 'dormant', 'not_started'];

export function NarrativeHero({
  eyebrow,
  sentences,
  team,
  onOpenProfile,
  onOpenTrainees,
}: {
  eyebrow: string;
  sentences: NarrativeSentence[];
  team: Record<TraineeStatus, number>;
  onOpenProfile: (userId: string) => void;
  onOpenTrainees: () => void;
}) {
  const total = ORDER.reduce((a, k) => a + team[k], 0);
  return (
    <Glass padding={0} radius={22} className="pbt-ov-cq pbt-rise">
      <div className="pbt-ov-hero">
        <div style={{ padding: '26px 30px 28px', minWidth: 0 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <p
            aria-label={narrativeText(sentences)}
            style={{
              margin: '12px 0 0',
              fontSize: 19,
              lineHeight: 1.6,
              fontWeight: 450,
              letterSpacing: '-0.012em',
              color: COLOR.inkSoft,
              maxWidth: '62ch',
              textWrap: 'pretty',
            }}
          >
            {sentences.map((s, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {s.map((seg, j) =>
                  typeof seg === 'string' ? (
                    <span key={j}>{seg}</span>
                  ) : seg.userId ? (
                    <button
                      key={j}
                      type="button"
                      className="pbt-link"
                      onClick={() => onOpenProfile(seg.userId as string)}
                      style={{ fontWeight: 700 }}
                    >
                      {seg.text}
                    </button>
                  ) : (
                    <strong key={j} style={{ color: COLOR.ink, fontWeight: 750 }}>
                      {seg.text}
                    </strong>
                  ),
                )}
              </span>
            ))}
          </p>
        </div>
        <div style={{ padding: '24px 26px 24px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Eyebrow>Your team</Eyebrow>
            <span style={{ fontSize: 12, color: COLOR.inkMute }}>
              <strong style={{ color: COLOR.ink, fontWeight: 800 }}>{total}</strong> {total === 1 ? 'person' : 'people'}
            </span>
          </div>
          <div
            role="img"
            aria-label={ORDER.map((k) => `${STATUS_LABELS[k]}: ${team[k]}`).join(', ')}
            style={{ display: 'flex', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden', background: CHART.track }}
          >
            {total > 0 &&
              ORDER.filter((k) => team[k] > 0).map((k) => (
                <div key={k} style={{ width: `${(team[k] / total) * 100}%`, minWidth: 4, background: STATUS_COLORS[k] }} />
              ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 14px' }}>
            {ORDER.map((k) => (
              <div key={k} title={STATUS_HELP[k]} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[k], flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: COLOR.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {STATUS_LABELS[k]}
                </span>
                <strong style={{ marginLeft: 'auto', fontSize: 13, color: COLOR.ink, fontVariantNumeric: 'tabular-nums' }}>{team[k]}</strong>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: COLOR.inkMute, lineHeight: 1.45 }}>
            Active = practised in the last 7 days · At risk = 8–21 days ago. Doesn’t change with the date range.
          </div>
          <div>
            <button type="button" className="pbt-link" onClick={onOpenTrainees} style={{ fontSize: 12.5 }}>
              See everyone →
            </button>
          </div>
        </div>
      </div>
    </Glass>
  );
}
