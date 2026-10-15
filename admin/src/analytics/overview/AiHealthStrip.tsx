/**
 * One compact row of AI health on the Overview (only for viewers who can
 * read AI quality): typical reply time, failure rate, spend in the window
 * and the monthly run-rate — with the way into the AI quality tab.
 */
import { Glass } from '../../primitives/Glass';
import { Eyebrow } from '../../primitives';
import { COLOR } from '../../lib/tokens';
import { fmtMoney } from '../../lib/format';
import { AI_ALERTS, type AiHealth } from '../lib/attention';
import './styles';

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'bad' | null }) {
  return (
    <div style={{ padding: '14px 20px', minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 780, color: COLOR.ink, letterSpacing: '-0.02em' }}>{value}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: tone ? 750 : 500,
            color: tone === 'bad' ? 'oklch(0.50 0.19 25)' : tone === 'ok' ? 'oklch(0.42 0.14 145)' : COLOR.inkMute,
          }}
        >
          {sub}
        </span>
      </div>
    </div>
  );
}

export function AiHealthStrip({ health, windowWords, onOpen }: { health: AiHealth; windowWords: string; onOpen: () => void }) {
  const failingTone = health.failureRate == null ? null : health.failureRate > AI_ALERTS.errorRatePct ? 'bad' : 'ok';
  const median = health.medianMs;
  return (
    <Glass padding={0} radius={18} className="pbt-ov-cq">
      <section aria-label="AI health">
        <div className="pbt-ov-strip">
          <Cell
            label="Typical AI reply"
            value={median == null ? '—' : `${(median / 1000).toFixed(1)}s`}
            sub={median == null ? 'no AI calls' : median <= 2000 ? 'quick — aim under 2s' : 'slower than the 2s aim'}
            tone={median == null ? null : median <= 2000 ? 'ok' : 'bad'}
          />
          <Cell
            label="AI failures"
            value={health.failureRate == null ? '—' : `${health.failureRate.toFixed(1)}%`}
            sub={
              health.failureRate == null
                ? 'no AI calls'
                : failingTone === 'bad'
                  ? `above the ${AI_ALERTS.errorRatePct}% alert level`
                  : `${health.failures} of ${health.calls.toLocaleString('en-US')} calls`
            }
            tone={failingTone}
          />
          <Cell label="AI cost" value={fmtMoney(health.costUsd)} sub={windowWords} />
          <Cell
            label="Monthly run-rate"
            value={health.projectedMonthlyUsd == null ? '—' : fmtMoney(health.projectedMonthlyUsd)}
            sub="at this pace"
          />
          <div style={{ padding: '14px 20px' }}>
            <button type="button" className="pbt-link" onClick={onOpen} style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
              AI quality →
            </button>
          </div>
        </div>
      </section>
    </Glass>
  );
}
