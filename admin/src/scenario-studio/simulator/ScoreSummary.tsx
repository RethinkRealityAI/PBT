/**
 * Test drive — the compact scorecard shown when a simulated conversation
 * has been scored.
 *
 * It answers the admin's real question — "does this scenario work?" — in a
 * plain verdict line first, then shows the evidence (overall ring, the five
 * ACT-first bars, the scorer's critique, a stronger line, key moments).
 *
 * Honest by construction: when the scorer didn't answer (`report === null`)
 * there is no ring and no zeroes — just what happened and a Retry.
 */
import { forwardRef, useId, useState, type ReactNode } from 'react';
import type { ChatMessage, ScoreReport } from '../../../../src/services/types';
import { STUDIO_STEP_LABELS } from '../../../../src/shared/ai/scenarioAgent';
import { Glass } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { COLOR, RADIUS } from '../../lib/tokens';
import { Kicker } from '../ui';
import type { StudioStepKey } from '../studioModel';
import {
  BAND_META,
  SCORE_DIMENSIONS,
  clampScore,
  scoreColor,
  verdictFor,
  type SimError,
} from './simulatorModel';

export interface ScoreSummaryProps {
  /** The real scorecard, or null when scoring didn't come back. */
  report: ScoreReport | null;
  messages: readonly ChatMessage[];
  /** Why the scorer call failed, when it threw (rate limit, network…). */
  failure?: SimError | null;
  /** False when the draft changed during the run — it tested an older version. */
  countsAsTested: boolean;
  retrying?: boolean;
  onRetryScore: () => void;
  onRunAgain: () => void;
  goTo: (step: StudioStepKey) => void;
}

/**
 * The heading receives focus when the result lands (see Simulator), so the
 * forwarded ref points at it rather than at the card.
 */
export const ScoreSummary = forwardRef<HTMLHeadingElement, ScoreSummaryProps>(function ScoreSummary(
  { report, messages, failure, countsAsTested, retrying = false, onRetryScore, onRunAgain, goTo },
  headingRef,
) {
  const titleId = useId();

  if (!report) {
    return (
      <Glass padding={0} radius={RADIUS.xl} className="pbt-studio-in">
        <section aria-labelledby={titleId} style={{ padding: '20px 22px', display: 'grid', gap: 14 }}>
          <Kicker>Test result</Kicker>
          <h3
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', color: COLOR.ink, outline: 'none' }}
          >
            {countsAsTested
              ? 'Scoring didn’t come back this time — the conversation still counts as tested.'
              : 'Scoring didn’t come back this time.'}
          </h3>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
            {failure?.rateLimited
              ? failure.reason
              : failure
                ? `The scorer couldn’t be reached (${failure.reason}). Nothing is lost — try scoring again.`
                : 'The scorer answered without a score. Nothing is lost — try scoring again.'}
          </div>
          <Actions>
            <Button tone="primary" onClick={onRetryScore} busy={retrying}>
              Retry scoring
            </Button>
            <Button onClick={onRunAgain}>Run another test</Button>
            <Button onClick={() => goTo('publish')} style={{ marginLeft: 'auto' }}>
              Looks good → Publish
            </Button>
          </Actions>
        </section>
      </Glass>
    );
  }

  const overall = clampScore(report.overall);
  const band = BAND_META[report.band] ?? BAND_META.poor;
  const verdict = verdictFor(report, messages);
  const moments = (report.keyMoments ?? []).filter((m) => m && (m.label || m.quote)).slice(0, 4);

  return (
    <Glass padding={0} radius={RADIUS.xl} className="pbt-studio-in">
      <section aria-labelledby={titleId} style={{ padding: '20px 22px', display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <ScoreRing value={overall} color={band.color} bandWord={band.word} />
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'grid', gap: 6 }}>
            <Kicker>Test result</Kicker>
            <h3
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.3,
                fontWeight: 700,
                letterSpacing: '-0.015em',
                color: COLOR.ink,
                outline: 'none',
              }}
            >
              {verdict.headline}
            </h3>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft }}>{verdict.detail}</div>
            {verdict.fix && (
              <div>
                <button
                  type="button"
                  className="pbt-focusable"
                  onClick={() => goTo(verdict.fix!.step)}
                  style={linkButton}
                >
                  {verdict.fix.label} on {STUDIO_STEP_LABELS[verdict.fix.step]} →
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 9 }} aria-label="Score by skill" role="group">
          {SCORE_DIMENSIONS.map((d) => (
            <DimensionBar key={d.key} label={d.label} value={clampScore(report[d.key])} />
          ))}
        </div>

        {report.critique?.trim() && (
          <Block title="What the scorer said">
            <Clamped text={report.critique.trim()} />
          </Block>
        )}

        {report.betterAlternative?.trim() && (
          <Block title="A stronger line to try">
            <blockquote
              style={{
                margin: 0,
                padding: '10px 14px',
                borderRadius: RADIUS.md,
                borderLeft: `3px solid ${COLOR.success}`,
                background: COLOR.successSoft,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: COLOR.ink,
              }}
            >
              {report.betterAlternative.trim()}
            </blockquote>
          </Block>
        )}

        {moments.length > 0 && (
          <Block title="Key moments">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {moments.map((m, i) => {
                const win = m.type === 'win';
                return (
                  <li
                    key={`${m.type}-${i}`}
                    title={m.quote ? `“${m.quote}”` : undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 11px',
                      borderRadius: 999,
                      background: win ? COLOR.successSoft : COLOR.dangerSoft,
                      color: win ? 'oklch(0.38 0.13 145)' : 'oklch(0.45 0.17 25)',
                      fontSize: 12.5,
                      fontWeight: 650,
                      lineHeight: 1.35,
                    }}
                  >
                    <span aria-hidden>{win ? '✓' : '✕'}</span>
                    <span>
                      <span style={visuallyHidden}>{win ? 'Win: ' : 'Miss: '}</span>
                      {m.label || m.quote}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Block>
        )}

        {!countsAsTested && (
          <InlineAlert tone="warn">
            The scenario changed during this run, so it doesn’t count as the test for the current
            version. Run another test to check it.
          </InlineAlert>
        )}

        <Actions>
          <Button onClick={onRunAgain}>Run another test</Button>
          <Button tone="primary" onClick={() => goTo('publish')} style={{ marginLeft: 'auto' }}>
            Looks good → Publish
          </Button>
        </Actions>
      </section>
    </Glass>
  );
});

// ── Pieces ───────────────────────────────────────────────────

const linkButton = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: COLOR.brand,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'var(--pbt-font)',
  cursor: 'pointer',
} as const;

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function Actions({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingTop: 14,
        borderTop: `1px solid ${COLOR.border}`,
      }}
    >
      {children}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{title}</div>
      {children}
    </div>
  );
}

/** The overall score as a ring, with the band word under the number. */
export function ScoreRing({ value, color, bandWord }: { value: number; color: string; bandWord: string }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div
      role="img"
      aria-label={`Overall score ${value} out of 100 — ${bandWord}`}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(60,20,15,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: COLOR.ink }}>{value}</span>
        <span
          style={{
            marginTop: 4,
            fontFamily: 'var(--pbt-mono)',
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color,
          }}
        >
          {bandWord}
        </span>
      </div>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 108px) 1fr 32px', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 650, color: COLOR.inkSoft }}>{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        style={{ height: 8, borderRadius: 999, background: 'rgba(60,20,15,0.07)', overflow: 'hidden' }}
      >
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
      <span
        style={{
          fontFamily: 'var(--pbt-mono)',
          fontSize: 12,
          fontWeight: 700,
          color: COLOR.ink,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Long critique collapsed to ~4 lines with a "Show more" toggle. */
function Clamped({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  const id = useId();
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div
        id={id}
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: COLOR.inkSoft,
          whiteSpace: 'pre-wrap',
          ...(long && !open
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }
            : null),
        }}
      >
        {text}
      </div>
      {long && (
        <div>
          <button
            type="button"
            className="pbt-focusable"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            style={linkButton}
          >
            {open ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}
