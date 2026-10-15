/**
 * Analytics → Sessions: every practice conversation in the window, with its
 * transcript and score (`#/analytics/sessions`; `…/sessions/<id>` opens one).
 *
 * Replaces the old Sessions screen, which named trainees through
 * `admin-users` (`team.read`) — an Analyst saw nothing at all. Names now come
 * from the trainee directory (`sessions.read`). The list is the window's
 * session SUMMARIES (no transcripts); a session's transcript is fetched only
 * when it is opened.
 *
 * Layout, top to bottom: one filter row (outcome chips with counts + the
 * selects), a slim summary strip for exactly the filtered rows, then the
 * sortable table, 50 rows at a time.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalyticsTabProps } from './AnalyticsDestination';
import type { SessionSummary, TraineeDirectoryEntry } from '../../../src/shared/analytics/contract';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { EmptyState, LoadingShimmer } from '../primitives';
import { Glass } from '../primitives/Glass';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { useAccess } from '../primitives/access';
import { useToast } from '../primitives/Toast';
import { downloadRagExport } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { useSessionSummaries, useTraineeDirectory } from './data';
import { Fact, GhostButton } from './ui';
import { rangeWords, splitByPeriod, windows } from './lib/period';
import { sessionStats } from './lib/metrics';
import { displayName } from './lib/trainees';
import { downloadCsv, toCsv } from './lib/csv';
import {
  NO_FILTERS,
  activeFilterCount,
  filterSessions,
  fmtLength,
  sessionsCsv,
  sortSessions,
  type SessionFilters,
  type SortDir,
  type SortKey,
} from './lib/sessionsExplorer';
import { SessionFilterBar } from './sessions/SessionFilterBar';
import { SessionsTable, type TableRowPerson } from './sessions/SessionsTable';
import { SessionDetail } from './sessions/SessionDetail';

const PAGE = 50;

export function SessionsTab({ range, onRange, query, onQuery, recordId, onOpen }: AnalyticsTabProps) {
  const { can } = useAccess();
  const toast = useToast();
  const summaries = useSessionSummaries(range);
  const directory = useTraineeDirectory();

  const [filters, setFilters] = useState<SessionFilters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'when', dir: 'desc' });
  const [limit, setLimit] = useState(PAGE);

  const people = useMemo(() => {
    const m = new Map<string, TraineeDirectoryEntry>();
    for (const e of directory.data.rows) m.set(e.user_id, e);
    return m;
  }, [directory.data.rows]);

  const nameOf = useCallback(
    (userId: string) => {
      const e = people.get(userId);
      if (e) return displayName(e);
      return directory.loading ? 'Loading…' : 'Unknown trainee';
    },
    [people, directory.loading],
  );

  const personOf = useCallback(
    (userId: string): TableRowPerson => {
      const e = people.get(userId);
      return { name: nameOf(userId), driver: e?.echo_primary ?? null, known: Boolean(e) };
    },
    [people, nameOf],
  );

  const current = useMemo(() => splitByPeriod(summaries.data.rows, range).current, [summaries.data.rows, range]);
  const { rows: filtered, chipBase } = useMemo(
    () => filterSessions(current, filters, query, nameOf),
    [current, filters, query, nameOf],
  );
  const sorted = useMemo(() => sortSessions(filtered, sort.key, sort.dir), [filtered, sort]);
  const stats = useMemo(() => sessionStats(filtered), [filtered]);
  const hintsKnown = filtered.some((s) => s.hints_used != null);

  // A new question starts at the top of the list.
  useEffect(() => setLimit(PAGE), [filters, query, range, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const exportCsv = () => {
    const { header, rows } = sessionsCsv(sorted, {
      nameOf: (id) => {
        const e = people.get(id);
        return e ? displayName(e) : 'Unknown trainee';
      },
      emailOf: directory.data.emails ? (id) => people.get(id)?.email ?? null : undefined,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`pbt-sessions-${range}-${stamp}.csv`, toCsv(header, rows));
  };

  const exportTranscripts = () => {
    void downloadRagExport({
      since: range === 'all' ? undefined : new Date(windows(range).current.start).toISOString(),
      completedOnly: filters.outcome === 'finished',
      limit: 5000,
    }).catch((err: unknown) => {
      toast({ message: err instanceof Error ? err.message : 'The transcript download failed.', tone: 'error' });
    });
  };

  const openSummary: SessionSummary | null = recordId ? summaries.data.rows.find((s) => s.id === recordId) ?? null : null;

  const loading = summaries.loading;
  const anyInWindow = current.length > 0;

  return (
    <>
      <ContextBar
        title="Sessions"
        subtitle="Every practice conversation, with its transcript and score"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
        actions={
          <>
            <GhostButton
              onClick={exportCsv}
              disabled={loading || filtered.length === 0}
              title="Download the sessions below as a spreadsheet — one row each, with skill scores"
            >
              <span aria-hidden="true">↓</span> Export CSV
            </GhostButton>
            {can('rag.export') && (
              <GhostButton
                onClick={exportTranscripts}
                title="Downloads one JSONL line per session — full transcripts, scores and scenario details — for use in another tool."
              >
                <span aria-hidden="true">↓</span> Download transcripts (.jsonl)
              </GhostButton>
            )}
          </>
        }
      />
      <ScreenShell>
        <QueryBoundary queries={[summaries, directory]} title="Couldn’t load the sessions" showLoading={false}>
          {loading ? (
            <SessionsSkeleton />
          ) : !anyInWindow ? (
            <Glass padding={0} radius={20}>
              <EmptyState
                title={`No practice sessions in the ${rangeWords(range)}`}
                subtitle={
                  range === 'all'
                    ? 'Sessions appear here as soon as a trainee finishes or leaves a conversation.'
                    : 'Nobody practised in this window. Widen it to see earlier sessions.'
                }
                action={range !== 'all' ? <GhostButton onClick={() => onRange('all')}>Show all time</GhostButton> : undefined}
              />
            </Glass>
          ) : (
            <>
              <SessionFilterBar
                rows={current}
                chipBase={chipBase}
                filters={filters}
                onChange={setFilters}
                onClear={() => {
                  setFilters(NO_FILTERS);
                  if (query) onQuery('');
                }}
                active={activeFilterCount(filters) + (query.trim() ? 1 : 0)}
              />

              <Glass padding={0} radius={18}>
                <div
                  role="group"
                  aria-label="Summary of the sessions shown"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  {[
                    {
                      label: 'Sessions',
                      value: stats.sessions.toLocaleString('en-US'),
                      sub: `${stats.activeTrainees} ${stats.activeTrainees === 1 ? 'trainee' : 'trainees'}`,
                    },
                    {
                      label: 'Finished',
                      value: stats.finishRate == null ? '—' : `${Math.round(stats.finishRate)}%`,
                      sub: `${stats.finished} of ${stats.sessions}`,
                    },
                    {
                      label: 'Average score',
                      value: stats.avgScore == null ? '—' : Math.round(stats.avgScore),
                      sub:
                        stats.scored === 0
                          ? 'No scored sessions'
                          : `${stats.scored} scored${stats.scoringFailed ? ` · ${stats.scoringFailed} failed` : ''}`,
                    },
                    {
                      label: 'Median length',
                      value: stats.medianMinutes == null ? '—' : fmtLength(stats.medianMinutes * 60),
                      sub: 'Per session',
                    },
                    {
                      label: 'Coach hints',
                      value: hintsKnown ? stats.hintsUsed.toLocaleString('en-US') : '—',
                      sub: !hintsKnown
                        ? 'Not available'
                        : stats.hintsUsed === 0
                          ? 'None asked for'
                          : (() => {
                              const n = filtered.filter((s) => (s.hints_used ?? 0) > 0).length;
                              return `In ${n} ${n === 1 ? 'session' : 'sessions'}`;
                            })(),
                    },
                  ].map((f) => (
                    <div
                      key={f.label}
                      style={{
                        padding: '14px 18px',
                        minWidth: 0,
                        // Hairlines left and above each cell; the strip clips the
                        // outer ones, so a wrapped row never starts with a stray rule.
                        boxShadow: '-1px 0 0 rgba(60,20,15,0.07), 0 -1px 0 rgba(60,20,15,0.07)',
                      }}
                    >
                      <Fact label={f.label} value={f.value} sub={f.sub} />
                    </div>
                  ))}
                </div>
              </Glass>

              {filtered.length === 0 ? (
                <Glass padding={0} radius={20}>
                  <EmptyState
                    title="No sessions match"
                    subtitle={`Nothing in the ${rangeWords(range)} fits these filters${query.trim() ? ' and search' : ''}.`}
                    action={
                      <GhostButton
                        onClick={() => {
                          setFilters(NO_FILTERS);
                          if (query) onQuery('');
                        }}
                      >
                        Clear filters
                      </GhostButton>
                    }
                  />
                </Glass>
              ) : (
                <Glass padding={0} radius={20} style={{ overflow: 'hidden' }}>
                  <SessionsTable
                    rows={sorted.slice(0, limit)}
                    personOf={personOf}
                    sort={sort}
                    onSort={onSort}
                    onOpenSession={(id) => onOpen('sessions', id)}
                    onOpenTrainee={(id) => onOpen('trainees', id)}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: '12px 18px',
                      fontSize: 12,
                      color: COLOR.inkMute,
                    }}
                  >
                    <span>
                      Showing <strong style={{ color: COLOR.ink }}>{Math.min(limit, sorted.length)}</strong> of{' '}
                      <strong style={{ color: COLOR.ink }}>{sorted.length.toLocaleString('en-US')}</strong>{' '}
                      {sorted.length === 1 ? 'session' : 'sessions'}
                      {stats.scoringFailed > 0 && ' · scoring failures are left out of the average score'}
                    </span>
                    {sorted.length > limit && (
                      <GhostButton onClick={() => setLimit((n) => n + PAGE)}>
                        Show {Math.min(PAGE, sorted.length - limit)} more
                      </GhostButton>
                    )}
                  </div>
                </Glass>
              )}
              {summaries.data.truncated && (
                <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
                  This window holds more sessions than one request returns, so the oldest are not listed. Pick a shorter
                  window to see them.
                </div>
              )}
            </>
          )}
        </QueryBoundary>

        {recordId && (
          <SessionDetail
            id={recordId}
            summary={openSummary}
            personOf={(userId) => people.get(userId) ?? null}
            onClose={() => onOpen('sessions')}
            onViewTrainee={(userId) => onOpen('trainees', userId)}
          />
        )}
      </ScreenShell>
    </>
  );
}

function SessionsSkeleton() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        Loading sessions…
      </span>
      <LoadingShimmer height={36} />
      <LoadingShimmer height={76} />
      <LoadingShimmer height={520} />
    </div>
  );
}
