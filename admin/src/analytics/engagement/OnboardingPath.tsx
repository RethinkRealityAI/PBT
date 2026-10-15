/**
 * The onboarding path as a stepped funnel: distinct people per screen, with
 * what changed between steps. It counts who REACHED each screen in the
 * window, not a strict sequence — a trainee who joined earlier starts at
 * Home — so a later step can be bigger; that reads as people joining the
 * path, never as a negative drop.
 */
import type { EngagementReport } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { CHART, Panel } from '../ui';
import { biggestDrop, onboardingFunnel } from '../lib/engagementFeatures';

function people(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;
}

export function OnboardingPath({ screens }: { screens: EngagementReport['screens'] }) {
  const steps = onboardingFunnel(screens);
  const drop = biggestDrop(steps);
  const dropIndex = drop ? steps.indexOf(drop) : -1;
  const empty = steps.every((s) => s.people === 0);

  return (
    <Panel
      title="Onboarding path"
      subtitle={
        empty
          ? 'From the welcome screen to a first scorecard'
          : drop && dropIndex > 0
            ? `Biggest drop: ${steps[dropIndex - 1].label} → ${drop.label} (${people(-(drop.change as number))} didn’t continue)`
            : 'From the welcome screen to a first scorecard'
      }
      footnote="Counts the people who reached each screen in this window — not a strict sequence. Trainees who joined earlier start at Home, so later steps can be larger."
    >
      {empty ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '12px 0' }}>Nobody opened these screens in this window.</div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {steps.map((s, i) => {
            const width = s.ofMax ?? 0;
            const isDrop = i === dropIndex;
            return (
              <li key={s.screen}>
                {i > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '112px 1fr',
                      gap: 12,
                      alignItems: 'center',
                      minHeight: 20,
                    }}
                  >
                    <span />
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: isDrop ? 750 : 600,
                        color: isDrop ? 'oklch(0.48 0.18 25)' : COLOR.inkMute,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span aria-hidden="true" style={{ width: 1, height: 12, background: CHART.grid, marginLeft: 6 }} />
                      {s.change == null || s.change === 0
                        ? 'No change'
                        : s.change < 0
                          ? `${people(-s.change)} didn’t continue${s.dropPct != null ? ` · ${Math.round(s.dropPct)}%` : ''}`
                          : `+${s.change.toLocaleString('en-US')} already onboarded`}
                    </span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: COLOR.inkSoft, whiteSpace: 'nowrap' }}>{s.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 4, background: CHART.track }}>
                      <div
                        style={{
                          width: `${width > 0 ? Math.max(width, 1.5) : 0}%`,
                          height: '100%',
                          borderRadius: 4,
                          background: CHART.primary,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 750,
                        color: COLOR.ink,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 28,
                        textAlign: 'right',
                      }}
                    >
                      {s.people.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
