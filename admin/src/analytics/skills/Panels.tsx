/**
 * The Skills tab's smaller panels: difficulty, score distribution, the
 * language / who / animal / scenario-source splits, how owners felt, and
 * what trainees said.
 */
import type { ReactNode } from 'react';
import { COLOR } from '../../lib/tokens';
import { fmtAgo } from '../../lib/format';
import { DIFFICULTY_LEVELS, type DifficultyScoreBucket } from '../../lib/difficulty';
import { AdminDifficultyMeter } from '../../primitives/DifficultyMeter';
import { BarList, CHART, DeltaChip, Panel, ShareBar } from '../ui';
import type { Delta } from '../lib/period';
import { sentimentWord, type FeedbackSummary, type SplitRowStats } from '../lib/skills';
import { SCENARIO_SOURCE_HINTS, SCENARIO_SOURCE_LABELS } from '../lib/metrics';
import type { ScenarioSource } from '../../../../src/shared/analytics/contract';
import { Columns } from '../overview/charts';
import { LANGUAGE_NONE, LANGUAGE_NONE_HELP, WHO_FILTER_LABELS, languageLabel } from '../lib/who';
import '../overview/styles';

function fmtScore(v: number | null): string {
  return v == null ? '—' : String(Math.round(v));
}

// ─── Difficulty ─────────────────────────────────────────────────────────

export function DifficultyPanel({
  buckets,
  unknown,
  leftEarly,
}: {
  buckets: DifficultyScoreBucket[];
  unknown: number;
  /** Per level: every session played at it (finished or not) and the share left early. */
  leftEarly: Map<number, { sessions: number; leftEarlyPct: number | null }>;
}) {
  const any = buckets.some((b) => b.count > 0);
  return (
    <Panel
      title="By difficulty"
      subtitle="Average score against each level of owner"
      footnote={
        <>
          Every level is scored to the same standard, so lower averages against harder owners are expected — read them as context,
          not weaker training.
          {unknown > 0 && ` ${unknown} scored session${unknown === 1 ? '' : 's'} didn’t record a level and ${unknown === 1 ? 'is' : 'are'} left out here.`}
        </>
      }
    >
      {!any ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '8px 0' }}>No scored sessions recorded a difficulty in this window.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {DIFFICULTY_LEVELS.map((level) => {
            const b = buckets.find((x) => x.level === level) as DifficultyScoreBucket;
            const pct = b.avgScore == null ? 0 : Math.max(0, Math.min(100, b.avgScore));
            return (
              <div
                key={level}
                style={{ display: 'grid', gridTemplateColumns: '128px minmax(0, 1fr) 30px 92px', gap: 12, alignItems: 'center' }}
              >
                <AdminDifficultyMeter level={level} />
                <div style={{ height: 10, borderRadius: 4, background: CHART.track }}>
                  <div style={{ width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%`, height: '100%', borderRadius: 4, background: CHART.primary }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: b.avgScore == null ? COLOR.inkMute : COLOR.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtScore(b.avgScore)}
                </span>
                <span style={{ fontSize: 11, color: COLOR.inkMute, whiteSpace: 'nowrap', lineHeight: 1.35 }}>
                  {b.count} scored
                  {(() => {
                    const le = leftEarly.get(level);
                    return le && le.sessions > 0 && le.leftEarlyPct != null ? (
                      <span style={{ display: 'block' }}>{Math.round(le.leftEarlyPct)}% left early</span>
                    ) : null;
                  })()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─── Distribution ───────────────────────────────────────────────────────

const BIN_LABELS = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'];

export function DistributionPanel({ bins }: { bins: number[] }) {
  const total = bins.reduce((a, b) => a + b, 0);
  const solid = bins.slice(7).reduce((a, b) => a + b, 0);
  const data = bins.map((value, i) => ({ label: BIN_LABELS[i], value }));
  return (
    <Panel
      title="Score distribution"
      subtitle="How many scored sessions landed in each 10-point band"
      footnote={
        total > 0 ? (
          <>
            <strong style={{ color: COLOR.inkSoft }}>{Math.round((solid / total) * 100)}%</strong> scored 70 or more (Solid or Strong) ·{' '}
            {total} scored session{total === 1 ? '' : 's'}
          </>
        ) : undefined
      }
    >
      {total === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '8px 0' }}>No scored sessions in this window.</div>
      ) : (
        <Columns
          data={data}
          ariaLabel={`Score distribution: ${data.map((d) => `${d.label}: ${d.value}`).join(', ')}`}
          tooltipLabel={(d) => `${d.value} session${d.value === 1 ? '' : 's'} scored ${d.label}`}
        />
      )}
    </Panel>
  );
}

// ─── Language, who, animal & source ────────────────────────────────────

function splitRows(rows: SplitRowStats[], label: (key: string) => ReactNode) {
  return rows.map((r) => ({
    key: r.key,
    label: label(r.key),
    value: r.avgScore ?? 0,
    display: r.avgScore == null ? '—' : Math.round(r.avgScore),
    // Say what the average rests on — and how many sessions had no score at all.
    sub: r.scored === r.sessions ? `${r.scored} scored` : `${r.scored} scored of ${r.sessions}`,
  }));
}

function SplitList({ title, rows }: { title: string; rows: ReturnType<typeof splitRows> }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: COLOR.inkMute, marginBottom: 10 }}>{title}</div>
      <BarList rows={rows} max={100} emptyText="No sessions." />
    </div>
  );
}

const WHO_HINTS: Record<string, string> = {
  signed_in: 'Trainees practising with an account',
  anonymous: 'Practice without an account — counted by session, never as a person',
};

export function SplitsPanel({
  languages,
  who,
  animals,
  sources,
  rebuilt,
}: {
  languages: SplitRowStats[];
  who: SplitRowStats[];
  animals: SplitRowStats[];
  sources: SplitRowStats[];
  /** Rebuilt anonymous sessions in the window (counted, never averaged, no animal). */
  rebuilt: number;
}) {
  return (
    <Panel
      title="Score by group"
      subtitle="Average score — does practice go better in one language, with an account, or for one kind of scenario?"
      footnote={
        rebuilt > 0
          ? `${rebuilt} anonymous session${rebuilt === 1 ? '' : 's'} from before 15 Oct 2026 ${rebuilt === 1 ? 'was' : 'were'} rebuilt from app activity: ${rebuilt === 1 ? 'it shows' : 'they show'} in the “of …” counts, but ${rebuilt === 1 ? 'has' : 'have'} no score or animal.`
          : undefined
      }
    >
      <div className="pbt-ov-cq">
        <div className="pbt-ov-two pbt-ov-two-tight" style={{ rowGap: 24 }}>
          <SplitList
            title="By language"
            rows={splitRows(languages, (k) =>
              k === LANGUAGE_NONE ? <span title={LANGUAGE_NONE_HELP}>{languageLabel(k)}</span> : languageLabel(k),
            )}
          />
          <SplitList
            title="By who practised"
            rows={splitRows(who, (k) => (
              <span title={WHO_HINTS[k]}>{WHO_FILTER_LABELS[k as 'signed_in' | 'anonymous'] ?? k}</span>
            ))}
          />
          <SplitList title="By animal" rows={splitRows(animals, (k) => (k === 'cat' ? 'Cats' : 'Dogs'))} />
          <SplitList
            title="By where the scenario came from"
            rows={splitRows(sources, (k) => (
              <span title={SCENARIO_SOURCE_HINTS[k as ScenarioSource]}>
                {SCENARIO_SOURCE_LABELS[k as ScenarioSource] ?? k}
              </span>
            ))}
          />
        </div>
      </div>
    </Panel>
  );
}

// ─── How owners felt ───────────────────────────────────────────────────

function signed(v: number): string {
  const r = Math.round(v * 100) / 100;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`;
}

export function OwnersFeltPanel({
  mood,
  wonDelta,
  compareLabel,
  shift,
}: {
  mood: { green: number; yellow: number; red: number; total: number };
  wonDelta: Delta | null | undefined;
  compareLabel?: string;
  shift: { start: number | null; end: number | null; count: number };
}) {
  const pos = (v: number) => `${((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100}%`;
  const won = mood.total > 0 ? Math.round((mood.green / mood.total) * 100) : null;
  return (
    <Panel
      title="How owners felt"
      subtitle="Where the AI owner ended up — the point of handling pushback"
      footnote="The owner’s mood on its last message, over finished sessions. Sentiment runs from −1 (upset) to +1 (happy), first and last scored turn."
    >
      {mood.total === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '8px 0' }}>No finished sessions recorded the owner’s mood.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, fontWeight: 780, color: COLOR.ink, letterSpacing: '-0.03em' }}>{won}%</span>
              <span style={{ fontSize: 12.5, color: COLOR.inkSoft }}>won over</span>
              {wonDelta !== undefined &&
                (wonDelta ? (
                  <DeltaChip delta={wonDelta} compareLabel={compareLabel} />
                ) : (
                  <span style={{ fontSize: 11, color: COLOR.inkMute }}>No earlier data to compare</span>
                ))}
            </div>
            <ShareBar
              parts={[
                { key: 'green', label: 'Won over', value: mood.green, color: COLOR.success },
                { key: 'yellow', label: 'Undecided', value: mood.yellow, color: COLOR.warn },
                { key: 'red', label: 'Still upset', value: mood.red, color: COLOR.danger },
              ]}
            />
          </div>
          {shift.count > 0 && shift.start != null && shift.end != null && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.inkSoft, marginBottom: 12 }}>
                Owners start <strong style={{ color: COLOR.ink }}>{sentimentWord(shift.start)}</strong> ({signed(shift.start)}) and end{' '}
                <strong style={{ color: COLOR.ink }}>{sentimentWord(shift.end)}</strong> ({signed(shift.end)}) on average
              </div>
              <div
                role="img"
                aria-label={`Average owner sentiment moves from ${signed(shift.start)} to ${signed(shift.end)} on a scale from minus 1 to plus 1`}
                style={{ position: 'relative', height: 26 }}
              >
                <div style={{ position: 'absolute', left: 0, right: 0, top: 11, height: 4, borderRadius: 2, background: CHART.track }} />
                <div style={{ position: 'absolute', left: '50%', top: 6, width: 1, height: 14, background: 'rgba(60,20,15,0.18)' }} />
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    height: 2,
                    left: shift.end >= shift.start ? pos(shift.start) : pos(shift.end),
                    width: `${(Math.abs(shift.end - shift.start) / 2) * 100}%`,
                    background: CHART.primary,
                  }}
                />
                <span
                  title={`Start ${signed(shift.start)}`}
                  style={{ position: 'absolute', top: 6, left: `calc(${pos(shift.start)} - 7px)`, width: 14, height: 14, borderRadius: '50%', background: '#fff', border: `2px solid ${CHART.primary}` }}
                />
                <span
                  title={`End ${signed(shift.end)}`}
                  style={{ position: 'absolute', top: 5, left: `calc(${pos(shift.end)} - 8px)`, width: 16, height: 16, borderRadius: '50%', background: CHART.primary, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(60,20,15,0.25)' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: COLOR.inkMute, marginTop: 4 }}>
                <span>−1 upset</span>
                <span>neutral</span>
                <span>happy +1</span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: COLOR.inkSoft }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${CHART.primary}` }} />
                  First turn
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: CHART.primary }} />
                  Last turn
                </span>
                <span style={{ color: COLOR.inkMute }}>{shift.count} scored sessions</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Trainee feedback ──────────────────────────────────────────────────

/** Rating change on a 1–5 scale, one decimal ("▲ 0.3"). */
function RatingDelta({ cur, prev, compareLabel }: { cur: number | null; prev: number | null | undefined; compareLabel?: string }) {
  if (prev === undefined) return null;
  if (cur == null || prev == null) return <span style={{ fontSize: 10.5, color: COLOR.inkMute }}>no earlier ratings</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const fg = dir === 'flat' ? COLOR.inkSoft : dir === 'up' ? 'oklch(0.42 0.14 145)' : 'oklch(0.48 0.18 25)';
  const bg = dir === 'flat' ? 'oklch(0.95 0.008 40)' : dir === 'up' ? COLOR.successSoft : COLOR.dangerSoft;
  return (
    <span
      title={compareLabel ? `${dir === 'flat' ? 'No change' : `${dir === 'up' ? '+' : '−'}${Math.abs(d).toFixed(1)}`} ${compareLabel}` : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 999, background: bg, color: fg, fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap' }}
    >
      <span aria-hidden="true" style={{ fontSize: 8 }}>
        {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}
      </span>
      {dir === 'flat' ? 'No change' : Math.abs(d).toFixed(1)}
    </span>
  );
}

function Meter({
  label,
  value,
  prev,
  compareLabel,
}: {
  label: string;
  value: number | null;
  prev: number | null | undefined;
  compareLabel?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, ((value - 1) / 4) * 100));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: COLOR.inkSoft, flex: 1, minWidth: 0 }}>{label}</span>
        <RatingDelta cur={value} prev={prev} compareLabel={compareLabel} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.ink, fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
          {value == null ? '—' : value.toFixed(1)}
          <span style={{ fontSize: 10.5, fontWeight: 600, color: COLOR.inkMute }}> / 5</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: CHART.primarySoft, marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: CHART.primary }} />
      </div>
    </div>
  );
}

export interface CommentView {
  id: string;
  text: string;
  at: number;
  who: { id: string; name: string } | null;
  about: string | null;
}

export function FeedbackPanel({
  cur,
  prev,
  compareLabel,
  comments,
  onOpenProfile,
  onOpenFeedback,
}: {
  cur: FeedbackSummary;
  prev: FeedbackSummary | null;
  compareLabel?: string;
  comments: CommentView[];
  onOpenProfile: (id: string) => void;
  onOpenFeedback: () => void;
}) {
  return (
    <Panel
      title="What trainees said"
      subtitle={`${cur.count} rating${cur.count === 1 ? '' : 's'} after sessions · 1 to 5`}
      actions={
        <button type="button" className="pbt-link" onClick={onOpenFeedback} style={{ fontSize: 12 }}>
          All feedback →
        </button>
      }
    >
      {cur.count === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '8px 0' }}>No one rated a session in this window.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Meter label="How realistic the owner felt" value={cur.realism} prev={prev ? prev.realism : undefined} compareLabel={compareLabel} />
            <Meter label="How believable the AI was" value={cur.aiQuality} prev={prev ? prev.aiQuality : undefined} compareLabel={compareLabel} />
            <Meter label="How comfortable it felt" value={cur.comfort} prev={prev ? prev.comfort : undefined} compareLabel={compareLabel} />
          </div>
          {comments.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: COLOR.inkMute, marginBottom: 8 }}>Latest comments</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {comments.map((c) => (
                  <li key={c.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${CHART.primarySoft}` }}>
                    <div style={{ fontSize: 12.5, color: COLOR.ink, lineHeight: 1.5 }}>“{c.text}”</div>
                    <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 2 }}>
                      {c.who ? (
                        <button type="button" className="pbt-link" onClick={() => onOpenProfile(c.who!.id)} style={{ fontSize: 11 }}>
                          {c.who.name}
                        </button>
                      ) : (
                        'Anonymous'
                      )}
                      {c.about && ` · ${c.about}`} · {fmtAgo(c.at)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
