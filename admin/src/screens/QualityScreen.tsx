import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import {
  EmptyState,
  Eyebrow,
  Kpi,
  LoadingShimmer,
  ScoreBadge,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAdminSessions, useAiCalls } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo, fmtMoney } from '../lib/format';

export function QualityScreen({
  range,
  onRange,
}: {
  range: Range;
  onRange: (r: Range) => void;
}) {
  const sessions = useAdminSessions(range, 1000);
  const aiCalls = useAiCalls(range, 5000);

  const stats = useMemo(() => {
    const s = sessions.data;
    const c = aiCalls.data;
    const flagged = s.filter((x) => x.flagged);
    const lowScore = s.filter(
      (x) => x.score_overall != null && x.score_overall < 60,
    );
    const slow = c.filter((x) => x.latency_ms > 2200);
    const refused = c.filter((x) => x.refusal);
    const errored = c.filter((x) => x.error != null);
    const totalCost = c.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
    const totalTokens = c.reduce(
      (a, x) => a + (x.tokens_in ?? 0) + (x.tokens_out ?? 0),
      0,
    );
    const flagReasons: Record<string, number> = {};
    for (const f of flagged) {
      const r = f.flag_reason ?? 'Unspecified';
      flagReasons[r] = (flagReasons[r] ?? 0) + 1;
    }
    // Per-model latency rollup
    const byModel = new Map<string, { calls: number; latency: number; cost: number }>();
    for (const call of c) {
      const m = byModel.get(call.model_id) ?? { calls: 0, latency: 0, cost: 0 };
      m.calls++;
      m.latency += call.latency_ms;
      m.cost += Number(call.cost_usd ?? 0);
      byModel.set(call.model_id, m);
    }
    return {
      flagged,
      lowScore,
      slow,
      refused,
      errored,
      totalCost,
      totalTokens,
      flagReasons,
      byModel,
    };
  }, [sessions.data, aiCalls.data]);

  return (
    <>
      <ContextBar
        title="AI Quality"
        subtitle="Flags, low scores, latency outliers, refusals"
        range={range}
        onRange={onRange}
      />
      <ScreenShell>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          {sessions.loading || aiCalls.loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <LoadingShimmer key={i} height={140} />
            ))
          ) : (
            <>
              <Kpi
                label="Flagged sessions"
                value={stats.flagged.length}
                icon="⚑"
                accent={COLOR.dangerSoft}
                sparkColor={COLOR.danger}
              />
              <Kpi
                label="Low scores (<60)"
                value={stats.lowScore.length}
                icon="↓"
                accent={COLOR.warnSoft}
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Slow responses"
                value={stats.slow.length}
                icon="◷"
                accent="oklch(0.94 0.06 70)"
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Refusals / errors"
                value={`${stats.refused.length}/${stats.errored.length}`}
                icon="✕"
                accent={COLOR.dangerSoft}
                sparkColor={COLOR.danger}
              />
            </>
          )}
        </div>

        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Flag reason breakdown"
            subtitle="What's tripping the quality heuristics"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
              marginTop: 16,
            }}
          >
            {Object.entries(stats.flagReasons)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, n]) => (
                <Glass
                  key={reason}
                  padding={14}
                  radius={12}
                  shine={false}
                  style={{ background: COLOR.dangerSoft }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color: 'oklch(0.45 0.18 25)',
                    }}
                  >
                    {n}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'oklch(0.40 0.14 25)',
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {reason}
                  </div>
                </Glass>
              ))}
            {Object.keys(stats.flagReasons).length === 0 && (
              <EmptyState title="Nothing flagged in this window" />
            )}
          </div>
        </Glass>

        <Glass padding={0} radius={20}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            <SectionTitle
              title="Per-model performance"
              subtitle="Latency / cost rollup by Gemini model"
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 100px 110px 110px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Model', 'Calls', 'Avg latency', 'Cost'].map((h) => (
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
          {Array.from(stats.byModel.entries()).map(([model, v]) => (
            <div
              key={model}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 110px 110px',
                padding: '12px 22px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                {model}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLOR.inkSoft,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {v.calls}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color:
                    v.latency / v.calls > 2000 ? COLOR.warn : COLOR.inkSoft,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {Math.round(v.latency / v.calls)}ms
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLOR.inkSoft,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {fmtMoney(v.cost)}
              </div>
            </div>
          ))}
          {stats.byModel.size === 0 && (
            <EmptyState title="No AI calls in this window" />
          )}
        </Glass>

        <Glass padding={0} radius={20}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <SectionTitle title="All flagged sessions" />
            <Eyebrow>{stats.flagged.length} total</Eyebrow>
          </div>
          {stats.flagged.slice(0, 30).map((s) => (
            <div
              key={s.id}
              style={{
                padding: '14px 24px',
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.4fr 80px 90px 80px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div style={{ fontSize: 13, color: COLOR.ink, fontWeight: 600 }}>
                {s.scenario_summary ?? s.pushback_id ?? '—'}
              </div>
              <StatusPill tone="warn">{s.flag_reason ?? '—'}</StatusPill>
              <div
                style={{
                  fontSize: 12,
                  color: COLOR.inkSoft,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {s.turns ?? 0} turns
              </div>
              <ScoreBadge score={s.score_overall} />
              <div
                style={{
                  fontSize: 11,
                  color: COLOR.inkMute,
                  textAlign: 'right',
                }}
              >
                {fmtAgo(new Date(s.created_at).getTime())}
              </div>
            </div>
          ))}
          {stats.flagged.length === 0 && (
            <EmptyState title="No flagged sessions" />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
