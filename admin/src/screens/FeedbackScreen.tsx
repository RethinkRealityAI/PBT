import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import { EmptyState, Kpi, LoadingShimmer } from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useSessionFeedback } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: COLOR.inkMute }}>—</span>;
  return (
    <span style={{ fontFamily: 'var(--pbt-mono)', color: COLOR.brand, fontWeight: 700 }}>
      {'★'.repeat(value)}
      <span style={{ color: COLOR.inkMute }}>{'★'.repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

export function FeedbackScreen({
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
  const feedback = useSessionFeedback(range, 1000);

  const stats = useMemo(() => {
    const d = feedback.data;
    return {
      total: d.length,
      realism: avg(d.map((f) => f.realism ?? 0).filter(Boolean)),
      aiQuality: avg(d.map((f) => f.ai_quality ?? 0).filter(Boolean)),
      comfort: avg(d.map((f) => f.comfort ?? 0).filter(Boolean)),
      withComment: d.filter((f) => f.comment?.trim()).length,
    };
  }, [feedback.data]);

  const filtered = feedback.data.filter((f) =>
    !query
      ? true
      : `${f.comment ?? ''} ${f.scenario_summary ?? ''} ${f.pushback_id ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
  );

  return (
    <>
      <ContextBar
        title="Session Feedback"
        subtitle="Rate-the-simulation responses"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {feedback.loading ? (
            Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
          ) : (
            <>
              <Kpi label="Responses" value={stats.total} icon="✺" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
              <Kpi label="Avg realism" value={stats.realism.toFixed(1)} icon="◇" accent={COLOR.infoSoft} sparkColor={COLOR.info} />
              <Kpi label="Avg AI quality" value={stats.aiQuality.toFixed(1)} icon="✦" accent={COLOR.successSoft} sparkColor={COLOR.success} />
              <Kpi label="Avg comfort" value={stats.comfort.toFixed(1)} icon="◔" accent={COLOR.warnSoft} sparkColor={COLOR.warn} />
            </>
          )}
        </div>

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 90px 90px 1.6fr 110px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Realism', 'AI', 'Comfort', 'Comment / scenario', 'Time'].map((h) => (
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
          {filtered.slice(0, 150).map((f) => (
            <div
              key={f.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 90px 90px 1.6fr 110px',
                padding: '12px 22px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div style={{ fontSize: 12 }}><Stars value={f.realism} /></div>
              <div style={{ fontSize: 12 }}><Stars value={f.ai_quality} /></div>
              <div style={{ fontSize: 12 }}><Stars value={f.comfort} /></div>
              <div style={{ fontSize: 12.5, color: COLOR.ink, lineHeight: 1.4 }}>
                {f.comment?.trim() ? (
                  <span>{f.comment}</span>
                ) : (
                  <span style={{ color: COLOR.inkMute }}>{f.scenario_summary ?? '—'}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                {fmtAgo(new Date(f.created_at).getTime())}
              </div>
            </div>
          ))}
          {!feedback.loading && filtered.length === 0 && (
            <EmptyState title="No feedback yet" subtitle="Responses appear here once users rate a session." />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
