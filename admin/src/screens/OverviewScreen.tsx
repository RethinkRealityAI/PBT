import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import {
  Avatar,
  DriverChip,
  Eyebrow,
  Kpi,
  LoadingShimmer,
  ScoreBadge,
  SectionTitle,
  Sparkline,
  StatusPill,
} from '../primitives';
import {
  ContextBar,
  ScreenShell,
  type AdminScreen,
  type Range,
} from '../primitives/Shell';
import { QueryBoundary } from '../primitives/QueryBoundary';
import {
  useAdminSessions,
  useAdminUsers,
  useAiCalls,
  useUserScenarios,
} from '../data/queries';
import { COLOR, DRIVER_KEYS, DRIVERS, type DriverKey } from '../lib/tokens';
import { fmtAgo, fmtMoney, fmtNumber } from '../lib/format';
import { PUSHBACK_LABELS, labelOf } from '../lib/labels';

export function OverviewScreen({
  range,
  onRange,
  onNav,
}: {
  range: Range;
  onRange: (r: Range) => void;
  onNav: (s: AdminScreen, tab?: string) => void;
}) {
  const users = useAdminUsers();
  // Same row cap as Insights — a smaller cap here made the two screens report
  // different session counts for the same window.
  const sessions = useAdminSessions(range, 2000);
  const aiCalls = useAiCalls(range);
  const scenarios = useUserScenarios();

  const ready = !users.loading && !sessions.loading && !aiCalls.loading;

  const stats = useMemo(() => {
    const sList = sessions.data;
    const completed = sList.filter((s) => s.completed);
    const flagged = sList.filter((s) => s.flagged).length;
    // A session with no score at all must not drag the average toward zero —
    // it is missing, not bad.
    const scored = completed
      .map((s) => s.score_overall)
      .filter((v): v is number => v != null);
    const avgScore = scored.length
      ? Math.round(scored.reduce((a, v) => a + v, 0) / scored.length)
      : 0;
    const completionRate = sList.length
      ? Math.round((completed.length / sList.length) * 100)
      : 0;

    // Median, not mean: a handful of cold-start calls would otherwise pull the
    // number well above what people actually wait for.
    const medianLatency = medianOf(aiCalls.data.map((c) => c.latency_ms));
    const totalTokens = aiCalls.data.reduce(
      (a, c) => a + c.tokens_in + c.tokens_out,
      0,
    );
    const totalCost = aiCalls.data.reduce((a, c) => a + Number(c.cost_usd), 0);

    // Per-day session count + score over the active range.
    const days =
      range === '24h' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 28;
    const sessionsByDay = Array.from({ length: days }, () => 0);
    const scoreByDay: number[][] = Array.from({ length: days }, () => []);
    const usersByDay: Set<string>[] = Array.from({ length: days }, () => new Set());
    const now = Date.now();
    for (const s of sList) {
      const ageDays = Math.floor(
        (now - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (ageDays >= 0 && ageDays < days) {
        sessionsByDay[days - 1 - ageDays]++;
        usersByDay[days - 1 - ageDays].add(s.user_id);
        if (s.score_overall != null)
          scoreByDay[days - 1 - ageDays].push(s.score_overall);
      }
    }
    const avgScoreByDay = scoreByDay.map((arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0,
    );
    // Distinct active users per day — feeds the Active users KPI sparkline
    // with real movement instead of a flat single point.
    const activeUsersByDay = usersByDay.map((s) => s.size);

    // Driver distribution from primary driver of users.
    const driverDist: Record<DriverKey, number> = {
      Activator: 0,
      Energizer: 0,
      Analyzer: 0,
      Harmonizer: 0,
    };
    for (const u of users.data) {
      if (u.echo_primary && u.echo_primary in driverDist) {
        driverDist[u.echo_primary]++;
      }
    }

    return {
      // People who actually ran a session in the selected window — this is what
      // the "Active people" tile claims, so it is what it counts.
      activeUsers: new Set(sList.map((s) => s.user_id)).size,
      sessions: sList.length,
      completed: completed.length,
      flagged,
      avgScore,
      completionRate,
      medianLatency,
      totalTokens,
      totalCost,
      sessionsByDay,
      avgScoreByDay,
      activeUsersByDay,
      driverDist,
    };
  }, [users.data, sessions.data, aiCalls.data, range]);

  const totalDrivers = DRIVER_KEYS.reduce(
    (a, k) => a + stats.driverDist[k],
    0,
  );

  return (
    <>
      <ContextBar
        title="Overview"
        subtitle="Platform health & usage"
        range={range}
        onRange={onRange}
      />
      <ScreenShell>
        <QueryBoundary
          queries={[users, sessions, aiCalls, scenarios]}
          title="Couldn't load the dashboard"
          showLoading={false}
        >
          {/* KPI row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}
          >
            {ready ? (
              <>
                <Kpi
                  label={`Active people · ${rangeWords(range)}`}
                  value={stats.activeUsers}
                  icon="◔"
                  accent={COLOR.brandSoft}
                  sparkColor={COLOR.brand}
                  sparkData={stats.activeUsersByDay}
                />
                <Kpi
                  label={`Sessions · ${rangeWords(range)}`}
                  value={stats.sessions}
                  icon="◇"
                  accent="oklch(0.94 0.04 245)"
                  sparkColor={COLOR.info}
                  sparkData={stats.sessionsByDay}
                />
                <Kpi
                  label="Average score"
                  value={stats.avgScore || '—'}
                  icon="✺"
                  accent={COLOR.successSoft}
                  sparkColor={COLOR.success}
                  sparkData={stats.avgScoreByDay}
                />
                <Kpi
                  label="Sessions finished"
                  value={`${stats.completionRate}%`}
                  icon="✓"
                  accent="oklch(0.94 0.06 70)"
                  sparkColor={COLOR.warn}
                />
              </>
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <LoadingShimmer key={i} height={140} />
              ))
            )}
          </div>

          {/* AI telemetry strip */}
          <Glass padding={0} radius={20}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
              }}
            >
              {[
                {
                  label: 'Typical AI reply time',
                  value: stats.medianLatency
                    ? `${(stats.medianLatency / 1000).toFixed(1)}s`
                    : '—',
                  sub: 'aim for under 2 seconds',
                  tone:
                    stats.medianLatency && stats.medianLatency < 2000
                      ? ('success' as const)
                      : ('warn' as const),
                },
                {
                  label: `AI usage · ${rangeWords(range)}`,
                  value: fmtNumber(stats.totalTokens),
                  sub: 'chunks of text read + written',
                  tone: 'neutral' as const,
                },
                {
                  label: `Estimated AI cost · ${rangeWords(range)}`,
                  value: fmtMoney(stats.totalCost),
                  sub: 'every AI reply and score in this window',
                  tone: 'neutral' as const,
                },
                {
                  label: 'Flagged sessions',
                  value: stats.flagged,
                  sub: stats.sessions
                    ? `${Math.round((stats.flagged / stats.sessions) * 100)}% of sessions`
                    : '—',
                  tone:
                    stats.flagged > 10
                      ? ('warn' as const)
                      : ('neutral' as const),
                },
              ].map((m, i) => (
                <div
                  key={m.label}
                  style={{
                    padding: 20,
                    borderRight:
                      i < 3 ? '0.5px solid rgba(60,20,15,0.06)' : 'none',
                  }}
                >
                  <Eyebrow>{m.label}</Eyebrow>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: COLOR.ink,
                        letterSpacing: '-0.025em',
                      }}
                    >
                      {m.value}
                    </div>
                    <StatusPill tone={m.tone} dot={false}>
                      {m.sub}
                    </StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </Glass>

          {/* Two-column: trend + driver distribution */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: 16,
            }}
          >
            <Glass padding={24} radius={20}>
              <SectionTitle
                title="Session activity"
                subtitle={`Sessions per day · ${rangeWords(range)}`}
              />
              <div style={{ marginTop: 16 }}>
                <Sparkline
                  data={stats.sessionsByDay}
                  width={800}
                  height={140}
                  color={COLOR.brand}
                />
              </div>
            </Glass>
            <Glass padding={24} radius={20}>
              <SectionTitle
                title="ECHO drivers"
                subtitle={`Main communication style · ${totalDrivers} people`}
              />
              <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
                {DRIVER_KEYS.map((k) => {
                  const n = stats.driverDist[k];
                  const pct = totalDrivers ? (n / totalDrivers) * 100 : 0;
                  return (
                    <div
                      key={k}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <DriverChip driver={k} />
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'oklch(0.95 0.01 20)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: DRIVERS[k].color,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: COLOR.inkSoft,
                          minWidth: 36,
                          textAlign: 'right',
                        }}
                      >
                        {n}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Glass>
          </div>

          {/* Recent flagged */}
          <Glass padding={0} radius={20}>
            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              }}
            >
              <SectionTitle
                title="Needs review"
                subtitle="Sessions flagged for attention, or scored under 60"
              />
              <button
                onClick={() => onNav('analytics', 'quality')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: COLOR.brand,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'var(--pbt-font)',
                }}
              >
                View all →
              </button>
            </div>
            {sessions.data
              .filter((s) => s.flagged || (s.score_overall ?? 100) < 60)
              .slice(0, 5)
              .map((s) => {
                const u = users.data.find((x) => x.user_id === s.user_id);
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: '14px 24px',
                      display: 'grid',
                      gridTemplateColumns: '32px 1.5fr 1.6fr 1fr 80px 80px',
                      alignItems: 'center',
                      gap: 16,
                      borderTop: '0.5px solid rgba(60,20,15,0.04)',
                    }}
                  >
                    <Avatar
                      name={u?.display_name ?? null}
                      driver={u?.echo_primary ?? s.driver}
                      size={28}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: COLOR.ink,
                        }}
                      >
                        {u?.display_name ?? 'Anonymous'}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
                      {s.scenario_summary ??
                        (s.pushback_id
                          ? labelOf(PUSHBACK_LABELS, s.pushback_id)
                          : '—')}
                    </div>
                    <StatusPill tone="warn">
                      {s.flag_reason ?? 'Low score'}
                    </StatusPill>
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
                );
              })}
            {!sessions.loading &&
              sessions.data.filter(
                (s) => s.flagged || (s.score_overall ?? 100) < 60,
              ).length === 0 && (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: COLOR.inkMute,
                    fontSize: 13,
                  }}
                >
                  Nothing to review in this window.
                </div>
              )}
          </Glass>

          {/* Live counts */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 16,
            }}
          >
            <Glass padding={20} radius={16}>
              <Eyebrow>Built scenarios</Eyebrow>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: COLOR.ink,
                  marginTop: 6,
                }}
              >
                {scenarios.data.length}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLOR.inkMute,
                  marginTop: 4,
                }}
              >
                {scenarios.data.filter((s) => s.is_public).length} public
              </div>
            </Glass>
            <Glass padding={20} radius={16}>
              <Eyebrow>AI requests</Eyebrow>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: COLOR.ink,
                  marginTop: 6,
                }}
              >
                {fmtNumber(aiCalls.data.length)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLOR.inkMute,
                  marginTop: 4,
                }}
              >
                {aiCalls.data.filter((c) => c.refusal).length} declined to
                answer · {aiCalls.data.filter((c) => c.error).length} failed
              </div>
            </Glass>
            <Glass padding={20} radius={16}>
              <Eyebrow>How far people get</Eyebrow>
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {[
                  { label: 'Joined', count: users.data.length },
                  {
                    label: 'Trained once',
                    count: new Set(sessions.data.map((s) => s.user_id)).size,
                  },
                  {
                    label: 'Trained 3+ times',
                    count: countRepeat(sessions.data, 3),
                  },
                  {
                    label: 'Built a scenario',
                    count: new Set(scenarios.data.map((s) => s.creator_id)).size,
                  },
                ].map((row) => (
                  <FunnelRow
                    key={row.label}
                    label={row.label}
                    count={row.count}
                    max={users.data.length || 1}
                  />
                ))}
              </div>
            </Glass>
          </div>
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

/** Middle value of an unsorted list; 0 when there is nothing to measure. */
function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The range picker's keys ('7d', '28d'…) are shorthand for us, not for the
 * reader — every tile that counts something over a window spells it out.
 */
function rangeWords(range: Range): string {
  switch (range) {
    case '24h':
      return 'last 24 hours';
    case '7d':
      return 'last 7 days';
    case '28d':
      return 'last 28 days';
    case '90d':
      return 'last 90 days';
    case 'all':
      return 'all time';
  }
}

function countRepeat(
  sessions: { user_id: string }[],
  threshold: number,
): number {
  const counts = new Map<string, number>();
  for (const s of sessions)
    counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1);
  let n = 0;
  for (const v of counts.values()) if (v >= threshold) n++;
  return n;
}

function FunnelRow({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = max ? (count / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          minWidth: 110,
          fontSize: 12,
          color: COLOR.inkSoft,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 16,
          borderRadius: 8,
          background: 'oklch(0.96 0.01 20)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, oklch(0.66 0.22 22), oklch(0.55 0.20 22))`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <div
        style={{
          minWidth: 28,
          textAlign: 'right',
          fontSize: 12,
          fontWeight: 700,
          color: COLOR.ink,
        }}
      >
        {count}
      </div>
    </div>
  );
}
