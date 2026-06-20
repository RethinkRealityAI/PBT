import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import { EmptyState, Kpi, LoadingShimmer, StatusPill } from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { usePlatformReports } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';

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

  const stats = useMemo(() => {
    const d = reports.data;
    return {
      total: d.length,
      bugs: d.filter((r) => r.kind === 'bug').length,
      suggestions: d.filter((r) => r.kind === 'suggestion').length,
      open: d.filter((r) => r.status === 'open').length,
    };
  }, [reports.data]);

  const filtered = reports.data.filter((r) =>
    !query
      ? true
      : `${r.message} ${r.screen ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

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

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1.8fr 110px 110px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Type', 'Message', 'Screen', 'Time'].map((h) => (
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
                gridTemplateColumns: '110px 1.8fr 110px 110px',
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
