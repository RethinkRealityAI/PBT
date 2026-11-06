/**
 * Analytics → ECHO: who took the ECHO style quiz, what styles came out, and
 * how much of it to trust.
 *
 * Workshops sometimes tell trainees to "just click A" through the quiz to
 * get into the app. Those results pollute every ECHO number, so this tab
 * flags rushed and straight-lined quizzes (`src/shared/analytics/
 * echoQuality.ts`, thresholds adjustable here and applied live), leaves them
 * out of the distributions by default, and lets an admin with
 * `insights.review` include or exclude a quiz by hand.
 *
 * Top to bottom: data-quality controls (thresholds, include toggles, what is
 * left out and why) · KPIs vs the previous period · filters · style
 * distributions · question diagnostics · every quiz (expandable answers,
 * review actions) · CSV export of exactly the filtered quizzes, per quiz or
 * per answer. Numbers come from `lib/echo.ts`; nothing is derived inline.
 */
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { AnalyticsTabProps } from './AnalyticsDestination';
import type { EchoQuizRow, EchoReviewResponse, EchoReviewStatus, TraineeDirectoryEntry } from '../../../src/shared/analytics/contract';
import { ECHO_THRESHOLD_LIMITS, type EchoThresholds } from '../../../src/shared/analytics/echoQuality';
import { QUIZ_QUESTIONS } from '../../../src/data/quizQuestions';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { EmptyState, LoadingShimmer } from '../primitives';
import { Glass } from '../primitives/Glass';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { useToast } from '../primitives/Toast';
import { useAccess } from '../primitives/access';
import { postJson } from '../lib/api';
import { invalidate } from '../data/cache';
import { COLOR, DRIVERS, DRIVER_KEYS, type DriverKey } from '../lib/tokens';
import { useEchoReport, useTraineeDirectory } from './data';
import { AutoGrid, BarList, CHART, FreshnessNote, GhostButton, Panel, SelectFilter, ShareBar, SplitRow, StatTile } from './ui';
import { compareWords, hasComparison, pctDelta, pointsDelta, rangeWords } from './lib/period';
import { downloadCsv, toCsv } from './lib/csv';
import { displayName } from './lib/trainees';
import { DEVICE_HELP, WHO_FILTER_LABELS, languageLabel, type WhoFilter } from './lib/who';
import { localStamp } from './lib/sessionsExplorer';
import {
  ECHO_FLAG_FILTER_LABELS,
  ECHO_SOURCE_LABELS,
  NO_ECHO_FILTERS,
  REVIEW_LABELS,
  activeEchoFilterCount,
  assessAll,
  completionsOverTime,
  driverMatrix,
  echoAnswersCsv,
  echoKpis,
  echoQuizCsv,
  echoSplits,
  exclusionCounts,
  exclusionReason,
  filterEcho,
  flagWords,
  fmtMs,
  fmtPct,
  inPopulation,
  isCounted,
  primaryCounts,
  questionDiagnostics,
  secondaryCounts,
  splitEchoByPeriod,
  tallyWords,
  whoWords,
  type DriverCounts,
  type EchoFilters,
  type EchoFlagFilter,
  type EchoStaffFilter,
  type EchoView,
} from './lib/echo';
import { resetEchoOptions, setEchoOptions, useEchoOptions } from './echoSettings';

const PAGE = 50;

export function EchoTab({ range, onRange, query, onQuery }: AnalyticsTabProps) {
  const toast = useToast();
  const { can } = useAccess();
  const report = useEchoReport();
  // Names (and who is staff) come from the directory, which needs
  // `sessions.read` — without it, quizzes read "Unknown trainee".
  const directory = useTraineeDirectory(can('sessions.read'));
  const options = useEchoOptions();
  const [filters, setFilters] = useState<EchoFilters>({ ...NO_ECHO_FILTERS });
  const [overrides, setOverrides] = useState<Map<string, EchoQuizRow>>(() => new Map());
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const people = useMemo(() => {
    const m = new Map<string, TraineeDirectoryEntry>();
    for (const e of directory.data.rows) m.set(e.user_id, e);
    return m;
  }, [directory.data.rows]);
  const person = (id: string) => people.get(id);

  const rows = useMemo(
    () => report.data.rows.map((r) => overrides.get(r.id) ?? r),
    [report.data.rows, overrides],
  );

  const m = useMemo(() => {
    const now = report.updatedAt ?? Date.now();
    const views = assessAll(rows, options.thresholds, (id) => people.get(id));
    const { current, previous } = splitEchoByPeriod(views, range, now);
    const filtered = filterEcho(current, filters, query, (id) => people.get(id));
    const filteredPrev = filterEcho(previous, filters, query, (id) => people.get(id));
    const population = filtered.filter((v) => inPopulation(v, options));
    const counted = population.filter((v) => isCounted(v, options));
    return {
      inWindow: current.length,
      filtered,
      population,
      counted,
      kpis: echoKpis(population),
      kpisPrev: hasComparison(range) ? echoKpis(filteredPrev.filter((v) => inPopulation(v, options))) : null,
      excluded: exclusionCounts(filtered, options),
      primary: primaryCounts(counted),
      secondary: secondaryCounts(counted),
      matrix: driverMatrix(counted),
      overTime: completionsOverTime(counted, range, now),
      splits: echoSplits(counted),
      questions: questionDiagnostics(population, options.thresholds),
      withAnswers: population.filter((v) => v.row.answers && v.row.answers.length > 0).length,
    };
  }, [rows, options, people, range, filters, query, report.updatedAt]);

  const sorted = useMemo(() => [...m.filtered].sort((a, b) => b.at - a.at), [m.filtered]);
  const canReview = report.data.can_review;
  const comparable = hasComparison(range);
  const compareLabel = comparable ? compareWords(range) : undefined;
  const nameOf = (id: string) => {
    const e = people.get(id);
    return e ? displayName(e) : 'Unknown trainee';
  };

  const review = async (row: EchoQuizRow, status: EchoReviewStatus, note: string) => {
    setBusy(row.id);
    try {
      const res = await postJson<EchoReviewResponse>('admin-analytics', { op: 'echo-review', id: row.id, status, note });
      setOverrides((prev) => new Map(prev).set(row.id, res.row));
      invalidate('analytics:echo');
      toast({ message: status === 'auto' ? 'Back to the automatic flags.' : status === 'include' ? 'Quiz included.' : 'Quiz excluded.', tone: 'success' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'The review was not saved.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const exportQuizzes = () => {
    const { header, rows: out } = echoQuizCsv(sorted, {
      nameOf,
      emailOf: directory.data.emails ? (id) => people.get(id)?.email ?? null : undefined,
      options,
    });
    downloadCsv(`pbt-echo-quizzes-${range}-${stamp}.csv`, toCsv(header, out));
  };
  const exportAnswers = () => {
    const { header, rows: out } = echoAnswersCsv(sorted, { nameOf, options });
    downloadCsv(`pbt-echo-answers-${range}-${stamp}.csv`, toCsv(header, out));
  };

  const loading = report.loading;
  const k = m.kpis;
  const p = m.kpisPrev;

  return (
    <>
      <ContextBar
        title="ECHO"
        subtitle="Communication styles from the ECHO quiz — and how far to trust them"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
        actions={
          <>
            <FreshnessNote updatedAt={report.updatedAt} refreshing={report.refreshing} onRefresh={() => { report.refetch(); directory.refetch(); }} />
            <GhostButton onClick={exportQuizzes} disabled={loading || sorted.length === 0} title="The quizzes below, one row each, with their quality metrics and flags">
              <span aria-hidden="true">↓</span> Export quizzes
            </GhostButton>
            <GhostButton onClick={exportAnswers} disabled={loading || sorted.length === 0} title="One row per answer of the quizzes below (long format)">
              <span aria-hidden="true">↓</span> Export answers
            </GhostButton>
          </>
        }
      />
      <ScreenShell>
        <QueryBoundary queries={[report]} title="Couldn’t load the ECHO quizzes" showLoading={false}>
          {loading ? (
            <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <LoadingShimmer height={120} />
              <LoadingShimmer height={110} />
              <LoadingShimmer height={420} />
            </div>
          ) : (
            <>
              <QualityControls
                thresholds={options.thresholds}
                includeFlagged={options.includeFlagged}
                includeStaff={options.includeStaff}
                includeBackfill={options.includeBackfill}
                excluded={m.excluded}
                shown={m.filtered.length}
                counted={m.counted.length}
              />

              <HistoryNote recordingSince={report.data.recording_since} history={report.data.history} />

              {m.inWindow === 0 ? (
                <Glass padding={0} radius={20}>
                  <EmptyState
                    title={`No ECHO quizzes ${rangeWords(range)}`}
                    subtitle="Quizzes appear here as soon as someone finishes the ECHO quiz."
                    action={range !== 'all' ? <GhostButton onClick={() => onRange('all')}>Show all time</GhostButton> : undefined}
                  />
                </Glass>
              ) : (
                <>
                  <AutoGrid min={200}>
                    <StatTile
                      label="Quizzes completed"
                      value={k.completed.toLocaleString('en-US')}
                      delta={p ? pctDelta(k.completed, p.completed) : undefined}
                      compareLabel={compareLabel}
                      hint={`${rangeWords(range)}, flagged included${options.includeStaff ? '' : ', staff left out'}`}
                    />
                    <StatTile
                      label="People"
                      value={k.people.toLocaleString('en-US')}
                      delta={p ? pctDelta(k.people, p.people) : undefined}
                      compareLabel={compareLabel}
                      hint={`Signed-in trainees · plus ${k.devices.toLocaleString('en-US')} anonymous ${k.devices === 1 ? 'device' : 'devices'}${p ? ` (${p.devices} before)` : ''}`}
                    />
                    <StatTile
                      label="Flagged"
                      value={k.flaggedPct == null ? '—' : `${Math.round(k.flaggedPct)}%`}
                      delta={p ? pointsDelta(k.flaggedPct, p.flaggedPct) : undefined}
                      goodWhen="down"
                      compareLabel={compareLabel}
                      hint={`${k.rushed} rushed · ${k.straightLined} straight-lined · ${k.pattern} pattern match (a quiz can be more than one)`}
                    />
                    <StatTile
                      label="Median completion time"
                      value={fmtMs(k.medianTotalMs)}
                      delta={p && k.medianTotalMs != null && p.medianTotalMs != null ? pctDelta(k.medianTotalMs, p.medianTotalMs) : undefined}
                      goodWhen="neither"
                      compareLabel={compareLabel}
                      hint="Quizzes recorded by the app (backfilled profiles have no timings)"
                    />
                  </AutoGrid>

                  <EchoFilterBar
                    filters={filters}
                    onChange={(f) => {
                      setFilters(f);
                      setLimit(PAGE);
                    }}
                    onClear={() => {
                      setFilters({ ...NO_ECHO_FILTERS });
                      if (query) onQuery('');
                    }}
                    active={activeEchoFilterCount(filters) + (query.trim() ? 1 : 0)}
                  />

                  <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                    <Panel
                      title="Primary style"
                      subtitle={`${m.counted.length.toLocaleString('en-US')} counted ${m.counted.length === 1 ? 'quiz' : 'quizzes'}`}
                    >
                      <DriverBars counts={m.primary} />
                    </Panel>
                    <Panel title="Secondary style" subtitle="The runner-up style of the same quizzes">
                      <DriverBars counts={m.secondary} />
                    </Panel>
                  </SplitRow>

                  <SplitRow ratio="minmax(0, 1fr) minmax(0, 1.3fr)">
                    <Panel title="Primary × secondary" subtitle="How styles pair up — rows are the primary style">
                      <MatrixTable matrix={m.matrix} />
                    </Panel>
                    <Panel title="Completions over time" subtitle={`Counted quizzes by primary style, per ${m.overTime.granularity}`}>
                      <StackedBars points={m.overTime.points} />
                    </Panel>
                  </SplitRow>

                  <Panel title="Style mix by group" subtitle="Primary style share among counted quizzes — by who took it, the app language and where the result came from">
                    <AutoGrid min={260}>
                      <SplitList title="Who" groups={m.splits.who} />
                      <SplitList title="Language" groups={m.splits.language} />
                      <SplitList title="Source" groups={m.splits.source} />
                    </AutoGrid>
                  </Panel>

                  <Panel
                    title="Question diagnostics"
                    subtitle={`Letter share and time per question across ${m.withAnswers.toLocaleString('en-US')} ${m.withAnswers === 1 ? 'quiz' : 'quizzes'} with recorded answers — flagged included, so rushing hotspots show`}
                    footnote="A letter far above 25 % on one question can mean a confusing or leading question — or a room told to click it. Backfilled profiles carry no answers."
                  >
                    <QuestionTable rows={m.questions} fastMs={options.thresholds.fastMs} />
                  </Panel>

                  <Glass padding={0} radius={20} style={{ overflow: 'hidden' }}>
                    {sorted.length === 0 ? (
                      <EmptyState
                        title="No quizzes match"
                        subtitle="No quiz in this window fits these filters."
                        action={<GhostButton onClick={() => setFilters({ ...NO_ECHO_FILTERS })}>Clear filters</GhostButton>}
                      />
                    ) : (
                      <>
                        <ResultsTable
                          rows={sorted.slice(0, limit)}
                          options={options}
                          whoOf={(r) => whoWords(r, person)}
                          open={open}
                          onToggle={(id) => setOpen((cur) => (cur === id ? null : id))}
                          canReview={canReview}
                          busy={busy}
                          onReview={review}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 18px', fontSize: 12, color: COLOR.inkMute }}>
                          <span>
                            Showing <strong style={{ color: COLOR.ink }}>{Math.min(limit, sorted.length)}</strong> of{' '}
                            <strong style={{ color: COLOR.ink }}>{sorted.length.toLocaleString('en-US')}</strong> quizzes
                            {!canReview && ' · reviewing quizzes needs the “Review ECHO quiz data” permission'}
                          </span>
                          {sorted.length > limit && (
                            <GhostButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, sorted.length - limit)} more</GhostButton>
                          )}
                        </div>
                      </>
                    )}
                  </Glass>
                  {report.data.truncated && (
                    <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>More quizzes exist than one report reads; the oldest are not listed.</div>
                  )}
                </>
              )}
            </>
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

// ─── Data-quality controls ─────────────────────────────────────────────

function NumberControl({
  label,
  value,
  unit,
  limits,
  scale = 1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  limits: { min: number; max: number; step: number };
  scale?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, fontWeight: 700, color: COLOR.inkMute, minWidth: 0 }}>
      {label}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          className="pbt-focusable"
          value={value / scale}
          min={limits.min / scale}
          max={limits.max / scale}
          step={limits.step / scale}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n * scale);
          }}
          style={{
            width: 84,
            height: 32,
            padding: '0 8px',
            borderRadius: 10,
            border: '0.5px solid rgba(60,20,15,0.12)',
            background: 'rgba(255,255,255,0.8)',
            color: COLOR.ink,
            fontSize: 13,
            fontWeight: 650,
            fontFamily: 'var(--pbt-font)',
          }}
        />
        <span style={{ fontWeight: 600 }}>{unit}</span>
      </span>
    </label>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label title={hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 650, color: COLOR.inkSoft }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function QualityControls({
  thresholds,
  includeFlagged,
  includeStaff,
  includeBackfill,
  excluded,
  shown,
  counted,
}: {
  thresholds: EchoThresholds;
  includeFlagged: boolean;
  includeStaff: boolean;
  includeBackfill: boolean;
  excluded: ReturnType<typeof exclusionCounts>;
  shown: number;
  counted: number;
}) {
  const parts = [
    excluded.flagged ? `${excluded.flagged} flagged by the rules` : null,
    excluded.reviewed ? `${excluded.reviewed} excluded by an admin` : null,
    excluded.staff ? `${excluded.staff} by portal staff` : null,
    excluded.backfill ? `${excluded.backfill} backfilled ${excluded.backfill === 1 ? 'profile' : 'profiles'}` : null,
  ].filter(Boolean);
  return (
    <Panel
      title="Data quality"
      subtitle="A quiz is flagged when it was rushed or answered with the same letter over and over. Flagged quizzes are left out of the charts unless you include them; the table always lists them."
      actions={<GhostButton onClick={resetEchoOptions}>Reset to defaults</GhostButton>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <NumberControl
            label="Rushed: median time per answer under"
            value={thresholds.fastMs}
            unit="s"
            scale={1000}
            limits={ECHO_THRESHOLD_LIMITS.fastMs}
            onChange={(fastMs) => setEchoOptions({ thresholds: { ...thresholds, fastMs } })}
          />
          <NumberControl
            label="Straight-lined: one letter at least"
            value={thresholds.sameLetterPct}
            unit="% of answers"
            limits={ECHO_THRESHOLD_LIMITS.sameLetterPct}
            onChange={(sameLetterPct) => setEchoOptions({ thresholds: { ...thresholds, sameLetterPct } })}
          />
          <NumberControl
            label="…or a same-letter run of"
            value={thresholds.runLength}
            unit="questions"
            limits={ECHO_THRESHOLD_LIMITS.runLength}
            onChange={(runLength) => setEchoOptions({ thresholds: { ...thresholds, runLength } })}
          />
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Toggle label="Include flagged quizzes" checked={includeFlagged} onChange={(v) => setEchoOptions({ includeFlagged: v })} hint="An admin’s Exclude still wins." />
          <Toggle label="Include portal staff" checked={includeStaff} onChange={(v) => setEchoOptions({ includeStaff: v })} hint="Accounts with an admin role — they often take the quiz to test the app." />
          <Toggle
            label="Include backfilled profiles"
            checked={includeBackfill}
            onChange={(v) => setEchoOptions({ includeBackfill: v })}
            hint="Signed-in profiles from before answers were recorded: style and tally only. Only an exact all-same-letter tally can be flagged."
          />
        </div>
        <div role="status" style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.5 }}>
          <strong style={{ color: COLOR.ink }}>{counted.toLocaleString('en-US')}</strong> of {shown.toLocaleString('en-US')} quizzes in view are counted
          {parts.length > 0 ? ` — left out: ${parts.join(', ')}.` : '.'}
        </div>
      </div>
    </Panel>
  );
}

function HistoryNote({ recordingSince, history }: { recordingSince: string | null; history: { before: string; visits: number; under_30s: number } | null }) {
  const since = recordingSince ? new Date(recordingSince).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.55, padding: '0 4px' }}>
      <strong style={{ color: COLOR.inkSoft }}>About older data.</strong>{' '}
      {since ? `Answers and timings are recorded from ${since}.` : 'Answers and timings are recorded from this release on.'} Before that, anonymous quiz results
      were not recorded at all, and signed-in profiles kept only their style and tally (listed here as backfilled profiles).
      {history && history.visits > 0 && (
        <>
          {' '}
          For context: the quiz screen was visited {history.visits.toLocaleString('en-US')} times before then, and{' '}
          {history.under_30s.toLocaleString('en-US')} of those visits lasted under 30 seconds — these are screen visits, not quiz results, and say nothing about how anyone answered.
        </>
      )}
    </div>
  );
}

// ─── Filters ───────────────────────────────────────────────────────────

function EchoFilterBar({ filters, onChange, onClear, active }: { filters: EchoFilters; onChange: (f: EchoFilters) => void; onClear: () => void; active: number }) {
  return (
    <div role="group" aria-label="Filter the quizzes" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <SelectFilter
        label="Who"
        value={filters.who}
        onChange={(v) => onChange({ ...filters, who: v as WhoFilter })}
        options={(Object.keys(WHO_FILTER_LABELS) as WhoFilter[]).map((k) => ({ value: k, label: WHO_FILTER_LABELS[k] }))}
      />
      <SelectFilter
        label="Primary"
        value={filters.primary}
        onChange={(v) => onChange({ ...filters, primary: v as EchoFilters['primary'] })}
        options={[{ value: 'all', label: 'Any style' }, ...DRIVER_KEYS.map((d) => ({ value: d, label: d }))]}
      />
      <SelectFilter
        label="Quality"
        value={filters.flag}
        onChange={(v) => onChange({ ...filters, flag: v as EchoFlagFilter })}
        options={(Object.keys(ECHO_FLAG_FILTER_LABELS) as EchoFlagFilter[]).map((k) => ({ value: k, label: ECHO_FLAG_FILTER_LABELS[k] }))}
      />
      <SelectFilter
        label="Language"
        value={filters.locale}
        onChange={(v) => onChange({ ...filters, locale: v })}
        options={[{ value: 'all', label: 'Any' }, ...['en', 'fr', 'none'].map((k) => ({ value: k, label: languageLabel(k) }))]}
      />
      <SelectFilter
        label="Source"
        value={filters.source}
        onChange={(v) => onChange({ ...filters, source: v as EchoFilters['source'] })}
        options={[{ value: 'all', label: 'Any' }, { value: 'app', label: ECHO_SOURCE_LABELS.app }, { value: 'profile_backfill', label: ECHO_SOURCE_LABELS.profile_backfill }]}
      />
      <SelectFilter
        label="Staff"
        value={filters.staff}
        onChange={(v) => onChange({ ...filters, staff: v as EchoStaffFilter })}
        options={[
          { value: 'all', label: 'Everyone' },
          { value: 'trainees', label: 'Not staff' },
          { value: 'staff', label: 'Portal staff only' },
        ]}
      />
      {active > 0 && (
        <button type="button" className="pbt-link" onClick={onClear} style={{ fontSize: 12 }}>
          Clear {active} {active === 1 ? 'filter' : 'filters'}
        </button>
      )}
    </div>
  );
}

// ─── Charts ────────────────────────────────────────────────────────────

function DriverBars({ counts }: { counts: DriverCounts }) {
  const total = DRIVER_KEYS.reduce((n, d) => n + counts[d], 0);
  return (
    <BarList
      emptyText="No counted quizzes in view."
      rows={
        total === 0
          ? []
          : DRIVER_KEYS.map((d) => ({
              key: d,
              label: d,
              value: counts[d],
              display: `${counts[d]} · ${Math.round((counts[d] / total) * 100)}%`,
              color: DRIVERS[d].color,
            }))
      }
    />
  );
}

const cell: CSSProperties = { padding: '7px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 };

function MatrixTable({ matrix }: { matrix: Map<string, number> }) {
  const max = Math.max(1, ...matrix.values());
  if (matrix.size === 0) return <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>No counted quizzes in view.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%' }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Quizzes by primary (rows) and secondary (columns) style</caption>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: COLOR.inkMute, fontSize: 11 }}>Primary ↓ / secondary →</th>
            {DRIVER_KEYS.map((d) => (
              <th key={d} scope="col" style={{ ...cell, color: DRIVERS[d].color, fontSize: 11.5 }}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DRIVER_KEYS.map((p) => (
            <tr key={p}>
              <th scope="row" style={{ ...cell, textAlign: 'left', color: DRIVERS[p].color, fontSize: 11.5 }}>
                {p}
              </th>
              {DRIVER_KEYS.map((s) => {
                const n = matrix.get(`${p}|${s}`) ?? 0;
                return (
                  <td
                    key={s}
                    title={`${p} primary, ${s} secondary: ${n}`}
                    style={{
                      ...cell,
                      borderRadius: 8,
                      background: p === s ? 'transparent' : n === 0 ? CHART.track : `color-mix(in oklab, ${DRIVERS[p].color} ${Math.round(12 + (n / max) * 60)}%, white)`,
                      color: n / max > 0.6 ? '#fff' : COLOR.ink,
                      fontWeight: 700,
                    }}
                  >
                    {p === s ? '·' : n}
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

function StackedBars({ points }: { points: Array<{ label: string; counts: DriverCounts; total: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  const every = Math.max(1, Math.ceil(points.length / 8));
  if (points.every((p) => p.total === 0)) return <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>No counted quizzes in this window.</div>;
  return (
    <div>
      <div role="img" aria-label="Completed quizzes over time, stacked by primary style" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
        {points.map((p, i) => (
          <div key={i} title={`${p.label}: ${p.total}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column-reverse', height: `${(p.total / max) * 100}%` }}>
            {DRIVER_KEYS.map((d) =>
              p.counts[d] > 0 ? <div key={d} style={{ height: `${(p.counts[d] / Math.max(1, p.total)) * 100}%`, background: DRIVERS[d].color, minHeight: 2 }} /> : null,
            )}
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 2, marginTop: 6 }}>
        {points.map((p, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: COLOR.inkMute, whiteSpace: 'nowrap', overflow: 'visible' }}>
            {i % every === 0 ? p.label : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
        {DRIVER_KEYS.map((d) => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: COLOR.inkSoft }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: DRIVERS[d].color }} />
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

function SplitList({ title, groups }: { title: string; groups: Array<{ key: string; label: string; total: number; counts: DriverCounts }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR.inkMute }}>{title}</div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>Nothing in view.</div>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, marginBottom: 6 }}>
              {g.label} <span style={{ color: COLOR.inkMute, fontWeight: 600 }}>· {g.total}</span>
            </div>
            <ShareBar height={10} parts={DRIVER_KEYS.map((d) => ({ key: d, label: d, value: g.counts[d], color: DRIVERS[d].color }))} />
          </div>
        ))
      )}
    </div>
  );
}

function QuestionTable({ rows, fastMs }: { rows: ReturnType<typeof questionDiagnostics>; fastMs: number }) {
  const th: CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: COLOR.inkMute, whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '8px 10px', fontSize: 12.5, color: COLOR.inkSoft, verticalAlign: 'middle', borderTop: `1px solid ${COLOR.border}` };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Question</th>
            <th style={th}>A · B · C · D</th>
            <th style={{ ...th, textAlign: 'right' }}>Median time</th>
            <th style={{ ...th, textAlign: 'right' }}>Under {fmtMs(fastMs)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id}>
              <td style={{ ...td, fontWeight: 800, color: COLOR.ink }}>{q.id}</td>
              <td style={{ ...td, maxWidth: 360 }} title={q.prompt}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.prompt}</span>
              </td>
              <td style={{ ...td, minWidth: 200 }}>
                {q.answered === 0 ? (
                  '—'
                ) : (
                  <div style={{ display: 'flex', gap: 2, height: 14, borderRadius: 4, overflow: 'hidden' }} title={(['A', 'B', 'C', 'D'] as const).map((l) => `${l} ${fmtPct(q.share[l])}`).join(' · ')}>
                    {(['A', 'B', 'C', 'D'] as const).map((l, i) => (
                      <div
                        key={l}
                        style={{
                          width: `${q.share[l] * 100}%`,
                          background: ['oklch(0.62 0.12 20)', 'oklch(0.70 0.10 70)', 'oklch(0.62 0.10 245)', 'oklch(0.62 0.10 150)'][i],
                          color: '#fff',
                          fontSize: 9.5,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {q.share[l] >= 0.12 ? `${l} ${Math.round(q.share[l] * 100)}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMs(q.medianMs)}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(q.fastShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Results table ─────────────────────────────────────────────────────

function Chip({ children, tone }: { children: ReactNode; tone: 'warn' | 'danger' | 'info' | 'mute' | 'success' }) {
  const map = {
    warn: [COLOR.warnSoft, 'oklch(0.45 0.14 70)'],
    danger: [COLOR.dangerSoft, 'oklch(0.48 0.18 25)'],
    info: [COLOR.infoSoft, COLOR.info],
    mute: ['rgba(60,20,15,0.06)', COLOR.inkMute],
    success: [COLOR.successSoft, 'oklch(0.42 0.14 145)'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

function ResultsTable({
  rows,
  options,
  whoOf,
  open,
  onToggle,
  canReview,
  busy,
  onReview,
}: {
  rows: EchoView[];
  options: ReturnType<typeof useEchoOptions>;
  whoOf: (r: EchoQuizRow) => string;
  open: string | null;
  onToggle: (id: string) => void;
  canReview: boolean;
  busy: string | null;
  onReview: (row: EchoQuizRow, status: EchoReviewStatus, note: string) => void;
}) {
  const th: CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: COLOR.inkMute, whiteSpace: 'nowrap', position: 'sticky', top: 0 };
  const td: CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: COLOR.inkSoft, borderTop: `1px solid ${COLOR.border}`, verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
        <thead>
          <tr>
            <th style={th}>When</th>
            <th style={th}>Who</th>
            <th style={th}>Source</th>
            <th style={th}>Primary / secondary</th>
            <th style={th}>Tally</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={{ ...th, textAlign: 'right' }}>Median / answer</th>
            <th style={{ ...th, textAlign: 'right' }}>Same letter</th>
            <th style={{ ...th, textAlign: 'right' }}>Longest run</th>
            <th style={th}>Flags</th>
            <th style={th}>Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const r = v.row;
            const mt = v.a.metrics;
            const reason = exclusionReason(v, options);
            const expanded = open === r.id;
            return (
              <Fragment key={r.id}>
                <tr style={{ background: expanded ? 'rgba(255,255,255,0.6)' : undefined }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" className="pbt-link" aria-expanded={expanded} onClick={() => onToggle(r.id)} style={{ fontSize: 12.5 }}>
                      <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {localStamp(r.created_at)}
                    </button>
                  </td>
                  <td style={td} title={r.user_id ? undefined : DEVICE_HELP}>
                    <span style={{ color: COLOR.ink, fontWeight: 650 }}>{whoOf(r)}</span>
                    {v.staff && (
                      <>
                        {' '}
                        <Chip tone="mute">Staff</Chip>
                      </>
                    )}
                  </td>
                  <td style={td}>{r.source === 'app' ? 'App' : 'Backfilled'}</td>
                  <td style={td}>
                    <span style={{ color: DRIVERS[r.primary_driver as DriverKey]?.color ?? COLOR.ink, fontWeight: 750 }}>{r.primary_driver}</span>
                    {r.secondary_driver && <span style={{ color: COLOR.inkMute }}> / {r.secondary_driver}</span>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{tallyWords(r.tally)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMs(r.total_ms)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMs(mt.medianMs)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{mt.maxLetterShare == null ? '—' : `${fmtPct(mt.maxLetterShare)} ${mt.maxLetter}`}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{mt.answered > 0 ? `${mt.longestRun} ${mt.runLetter ?? ''}` : '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {flagWords(v.a).map((w) => (
                        <Chip key={w} tone="warn">
                          {w}
                        </Chip>
                      ))}
                      {!v.a.autoFlagged && <Chip tone="success">Clean</Chip>}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11.5, color: reason ? 'oklch(0.48 0.18 25)' : COLOR.inkMute, fontWeight: 700 }}>
                        {reason ? 'Not counted' : 'Counted'}
                        {r.review_status !== 'auto' && ` · ${REVIEW_LABELS[r.review_status].toLowerCase()}`}
                      </span>
                      {canReview && (
                        <ReviewButtons row={r} busy={busy === r.id} onReview={(s) => onReview(r, s, '')} />
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={11} style={{ ...td, background: 'rgba(255,255,255,0.45)' }}>
                      <QuizDetail view={v} canReview={canReview} busy={busy === r.id} onReview={(s, note) => onReview(r, s, note)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewButtons({ row, busy, onReview }: { row: EchoQuizRow; busy: boolean; onReview: (s: EchoReviewStatus) => void }) {
  const btn = (status: EchoReviewStatus, label: string) => (
    <button
      type="button"
      className="pbt-btn pbt-focusable"
      disabled={busy || row.review_status === status}
      onClick={() => onReview(status)}
      aria-pressed={row.review_status === status}
      style={{
        padding: '3px 9px',
        borderRadius: 8,
        border: '0.5px solid rgba(60,20,15,0.14)',
        background: row.review_status === status ? 'rgba(60,20,15,0.08)' : 'rgba(255,255,255,0.85)',
        color: COLOR.inkSoft,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: busy || row.review_status === status ? 'default' : 'pointer',
        fontFamily: 'var(--pbt-font)',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {btn('include', 'Include')}
      {btn('exclude', 'Exclude')}
      {btn('auto', 'Reset')}
    </div>
  );
}

function QuizDetail({ view, canReview, busy, onReview }: { view: EchoView; canReview: boolean; busy: boolean; onReview: (s: EchoReviewStatus, note: string) => void }) {
  const r = view.row;
  const [note, setNote] = useState(r.review_note ?? '');
  const prompts = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q.prompt]));
  const answers = [...(r.answers ?? [])].sort((a, b) => a.q - b.q);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {answers.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>
          A backfilled profile: only the style and tally were stored, so there are no answers or timings to show.
          {view.a.flags.pattern && ` Its tally is exactly what answering “${view.a.metrics.fingerprint}” to every question produces.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 6 }}>
          {answers.map((a) => (
            <div key={a.q} title={a.q === 16 ? 'Tie-breaker' : prompts.get(a.q)} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
              <span style={{ width: 26, color: COLOR.inkMute, fontWeight: 700 }}>{a.q === 16 ? 'TB' : `Q${a.q}`}</span>
              <span style={{ fontWeight: 800, color: COLOR.ink }}>{a.letter}</span>
              <span style={{ color: DRIVERS[a.driver as DriverKey]?.color ?? COLOR.inkSoft, fontWeight: 650 }}>{a.driver}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: a.ms < 2000 ? 'oklch(0.48 0.18 25)' : COLOR.inkSoft }}>{fmtMs(a.ms)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
        {r.undo_count != null && `${r.undo_count} ${r.undo_count === 1 ? 'undo' : 'undos'} · `}
        {r.taken_at && `device clock ${localStamp(r.taken_at)} · `}
        {r.locale && `${languageLabel(r.locale.slice(0, 2))} · `}
        {r.reviewed_at && `last reviewed ${localStamp(r.reviewed_at)}`}
        {r.review_note && ` · note: “${r.review_note}”`}
      </div>
      {canReview && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="pbt-focusable"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note (optional) — e.g. “Workshop 4 Nov, told to click A”"
            aria-label="Review note"
            style={{
              flex: '1 1 260px',
              minWidth: 0,
              height: 32,
              padding: '0 10px',
              borderRadius: 10,
              border: '0.5px solid rgba(60,20,15,0.12)',
              background: 'rgba(255,255,255,0.85)',
              fontSize: 12.5,
              fontFamily: 'var(--pbt-font)',
            }}
          />
          <GhostButton onClick={() => onReview('include', note)} disabled={busy}>
            Include with note
          </GhostButton>
          <GhostButton onClick={() => onReview('exclude', note)} disabled={busy}>
            Exclude with note
          </GhostButton>
        </div>
      )}
    </div>
  );
}
