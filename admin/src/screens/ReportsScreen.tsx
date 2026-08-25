import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import { EmptyState, Kpi, LoadingShimmer, StatusPill } from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { setReportStatus, usePlatformReports } from '../data/queries';
import type { PlatformReportRow } from '../data/types';
import { useCan } from '../primitives/access';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';

type ReportStatus = PlatformReportRow['status'];

const REPORT_STATUSES: readonly ReportStatus[] = ['open', 'triaged', 'resolved', 'dismissed'];

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Open',
  triaged: 'Triaged',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_TONE: Record<ReportStatus, 'warn' | 'info' | 'success' | 'neutral'> = {
  open: 'warn',
  triaged: 'info',
  resolved: 'success',
  dismissed: 'neutral',
};

/** The actions that make sense from each status — a linear triage workflow with a way back. */
const NEXT_ACTIONS: Record<ReportStatus, { to: ReportStatus; label: string }[]> = {
  open: [
    { to: 'triaged', label: 'Triage' },
    { to: 'dismissed', label: 'Dismiss' },
  ],
  triaged: [
    { to: 'resolved', label: 'Resolve' },
    { to: 'dismissed', label: 'Dismiss' },
  ],
  resolved: [{ to: 'open', label: 'Reopen' }],
  dismissed: [{ to: 'open', label: 'Reopen' }],
};

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
  const can = useCan();
  const canTriage = can('reports.write');

  // useQuery has no refetch — mirror successful status writes locally so the
  // table reflects reality without a full range re-fetch.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ReportStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      reports.data.map((r) => ({
        ...r,
        status: statusOverrides[r.id] ?? r.status,
      })),
    [reports.data, statusOverrides],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      bugs: rows.filter((r) => r.kind === 'bug').length,
      suggestions: rows.filter((r) => r.kind === 'suggestion').length,
      open: rows.filter((r) => r.status === 'open').length,
    }),
    [rows],
  );

  const filtered = rows.filter((r) =>
    !query
      ? true
      : `${r.message} ${r.screen ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  const applyStatus = async (id: string, status: ReportStatus) => {
    setSavingId(id);
    setActionError(null);
    try {
      const updated = await setReportStatus(id, status);
      // Trust the server's echo only if it's a real status; otherwise apply
      // the requested one (a harness/proxy may answer with a generic ok).
      const next = updated && REPORT_STATUSES.includes(updated.status) ? updated.status : status;
      setStatusOverrides((prev) => ({ ...prev, [id]: next }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setSavingId(null);
    }
  };

  const gridColumns = canTriage
    ? '96px 1.6fr 96px 92px 96px 168px'
    : '110px 1.8fr 110px 110px 96px';
  const headers = canTriage
    ? ['Type', 'Message', 'Screen', 'Time', 'Status', 'Actions']
    : ['Type', 'Message', 'Screen', 'Time', 'Status'];

  return (
    <>
      <ContextBar
        title="Platform Reports"
        subtitle="Bug reports & suggestions"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {reports.loading ? (
            Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
          ) : (
            <>
              <Kpi label="Reports" value={stats.total} icon="✎" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
              <Kpi label="Open" value={stats.open} icon="◷" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
              <Kpi label="Bugs" value={stats.bugs} icon="⚠" accent={COLOR.dangerSoft} sparkColor={COLOR.danger} />
              <Kpi label="Suggestions" value={stats.suggestions} icon="✦" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
            </>
          )}
        </div>

        {actionError && (
          <Glass padding={14} radius={14}>
            <div style={{ fontSize: 12, color: COLOR.danger, fontWeight: 600 }}>{actionError}</div>
          </Glass>
        )}

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridColumns,
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {headers.map((h) => (
              <div
                key={h}
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
                gridTemplateColumns: gridColumns,
                padding: '12px 22px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <StatusPill tone={r.kind === 'bug' ? 'danger' : 'info'}>
                {r.kind === 'bug' ? 'Bug' : 'Idea'}
              </StatusPill>
              <div style={{ fontSize: 12.5, color: COLOR.ink, lineHeight: 1.4 }}>{r.message}</div>
              <div style={{ fontSize: 11, color: COLOR.inkSoft }}>{r.screen ?? '—'}</div>
              <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                {fmtAgo(new Date(r.created_at).getTime())}
              </div>
              <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
              {canTriage && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {NEXT_ACTIONS[r.status].map(({ to, label }) => (
                    <button
                      key={to}
                      onClick={() => void applyStatus(r.id, to)}
                      disabled={savingId === r.id}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '5px 10px',
                        borderRadius: 8,
                        border: '0.5px solid rgba(60,20,15,0.14)',
                        background: 'rgba(255,255,255,0.7)',
                        color: COLOR.ink,
                        cursor: savingId === r.id ? 'wait' : 'pointer',
                        opacity: savingId === r.id ? 0.55 : 1,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!reports.loading && filtered.length === 0 && (
            <EmptyState title="No reports yet" subtitle="Bug reports and suggestions land here for triage." />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
