import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import { EmptyState, Kpi, LoadingShimmer, StatusPill } from '../primitives';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useToast } from '../primitives/Toast';
import { useCan } from '../primitives/access';
import { setReportStatus, usePlatformReports } from '../data/queries';
import { labelOf, SCREEN_LABELS } from '../lib/labels';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';

/** Triage states, in the order someone works them. */
const STATUSES = ['open', 'triaged', 'resolved', 'dismissed'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABELS: Record<Status, string> = {
  open: 'Needs a look',
  triaged: 'Looking into it',
  resolved: 'Sorted',
  dismissed: 'No action needed',
};

const STATUS_TONES: Record<Status, 'warn' | 'info' | 'success' | 'neutral'> = {
  open: 'warn',
  triaged: 'info',
  resolved: 'success',
  dismissed: 'neutral',
};

function isStatus(v: string | null | undefined): v is Status {
  return !!v && (STATUSES as readonly string[]).includes(v);
}

export function ReportsScreen({
  range,
  onRange,
  query,
  onQuery,
}: {
  range: Range;
  onRange: (r: Range) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const reports = usePlatformReports(range, 1000);
  const toast = useToast();
  const canTriage = useCan()('reports.read');
  // Status the admin has just set, held locally so a row updates the moment it
  // is actioned rather than waiting for the next range refetch.
  const [pending, setPending] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const statusOf = (id: string, raw: string | null): Status =>
    pending[id] ?? (isStatus(raw) ? raw : 'open');

  const rows = useMemo(
    () =>
      reports.data.map((r) => ({ ...r, _status: statusOf(r.id, r.status) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports.data, pending],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      bugs: rows.filter((r) => r.kind === 'bug').length,
      suggestions: rows.filter((r) => r.kind === 'suggestion').length,
      open: rows.filter((r) => r._status === 'open').length,
    }),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (!showDone && (r._status === 'resolved' || r._status === 'dismissed')) return false;
    if (!query) return true;
    return `${r.message} ${r.screen ?? ''}`.toLowerCase().includes(query.toLowerCase());
  });

  async function move(id: string, status: Status) {
    setBusy(id);
    try {
      await setReportStatus(id, status);
      setPending((p) => ({ ...p, [id]: status }));
      toast({ message: `Marked “${STATUS_LABELS[status]}”.`, tone: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update';
      toast({ message: `Couldn’t update this report — ${message}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const GRID = '104px 1.6fr 130px 96px 150px 190px';

  return (
    <>
      <ContextBar
        title="Problem reports"
        subtitle="What people told us is broken or could be better — work the list and mark each one off"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <QueryBoundary query={reports} title="Couldn’t load the reports" showLoading={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {reports.loading ? (
              Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
            ) : (
              <>
                <Kpi label="Reports" value={stats.total} icon="✎" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
                <Kpi label="Still to look at" value={stats.open} icon="◷" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
                <Kpi label="Something's broken" value={stats.bugs} icon="⚠" accent={COLOR.dangerSoft} sparkColor={COLOR.danger} />
                <Kpi label="Ideas" value={stats.suggestions} icon="✦" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
              </>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              margin: '14px 0 -4px',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12.5,
                color: COLOR.inkSoft,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
              />
              Show ones already dealt with
            </label>
          </div>

          <Glass padding={0} radius={20}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                padding: '14px 22px',
                gap: 12,
                background: 'rgba(255,255,255,0.5)',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              }}
            >
              {['Type', 'What they said', 'Where', 'When', 'Status', ''].map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.10em',
                    color: COLOR.inkMute,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
            {filtered.slice(0, 200).map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  padding: '12px 22px',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                  opacity: busy === r.id ? 0.55 : 1,
                }}
              >
                <StatusPill tone={r.kind === 'bug' ? 'danger' : 'info'}>
                  {r.kind === 'bug' ? 'Broken' : 'Idea'}
                </StatusPill>
                <div style={{ fontSize: 12.5, color: COLOR.ink, lineHeight: 1.4 }}>{r.message}</div>
                <div style={{ fontSize: 11, color: COLOR.inkSoft }}>
                  {r.screen ? labelOf(SCREEN_LABELS, r.screen) : '—'}
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                  {fmtAgo(new Date(r.created_at).getTime())}
                </div>
                <StatusPill tone={STATUS_TONES[r._status]}>
                  {STATUS_LABELS[r._status]}
                </StatusPill>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {canTriage &&
                    (
                      [
                        r._status === 'open' ? (['triaged', 'On it'] as const) : null,
                        r._status !== 'resolved' ? (['resolved', 'Sorted'] as const) : null,
                        r._status !== 'dismissed' ? (['dismissed', 'No action'] as const) : null,
                      ].filter(Boolean) as ReadonlyArray<readonly [Status, string]>
                    ).map(([next, label]) => (
                      <button
                        key={next}
                        disabled={busy !== null}
                        onClick={() => void move(r.id, next)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 9,
                          border: `0.5px solid ${COLOR.borderSoft}`,
                          background: 'rgba(255,255,255,0.7)',
                          color: COLOR.inkSoft,
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: busy !== null ? 'default' : 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {!reports.loading && filtered.length === 0 && (
              <EmptyState
                title={rows.length === 0 ? 'Nothing reported yet' : 'Nothing left to look at'}
                subtitle={
                  rows.length === 0
                    ? 'When someone uses “Report a problem” in the app, it appears here.'
                    : 'Every report in this period has been dealt with. Tick “Show ones already dealt with” to see them.'
                }
              />
            )}
          </Glass>
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}
