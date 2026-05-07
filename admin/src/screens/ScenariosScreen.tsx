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
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { useUserScenarios } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';

export function ScenariosScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const scenarios = useUserScenarios(500);

  const filtered = useMemo(
    () =>
      scenarios.data.filter((s) =>
        !query
          ? true
          : `${s.title} ${s.breed ?? ''} ${s.pushback_id ?? ''}`
              .toLowerCase()
              .includes(query.toLowerCase()),
      ),
    [scenarios.data, query],
  );

  const topByPushback = useMemo(() => {
    const groups = new Map<string, { count: number; plays: number; scores: number[] }>();
    for (const s of scenarios.data) {
      const key = s.pushback_id ?? s.title;
      const g = groups.get(key) ?? { count: 0, plays: 0, scores: [] };
      g.count++;
      g.plays += s.plays;
      if (s.avg_score) g.scores.push(s.avg_score);
      groups.set(key, g);
    }
    return Array.from(groups.entries())
      .map(([k, v]) => ({
        title: k,
        count: v.count,
        plays: v.plays,
        avg: v.scores.length
          ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
          : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [scenarios.data]);

  const totalPlays = scenarios.data.reduce((a, s) => a + s.plays, 0);
  const publicCount = scenarios.data.filter((s) => s.is_public).length;

  return (
    <>
      <ContextBar
        title="Scenarios"
        subtitle="Scenarios built and replayed"
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          {scenarios.loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <LoadingShimmer key={i} height={140} />
            ))
          ) : (
            <>
              <Kpi
                label="Built scenarios"
                value={scenarios.data.length}
                icon="▤"
                accent={COLOR.warnSoft}
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Total plays"
                value={totalPlays}
                icon="◇"
                accent={COLOR.brandSoft}
                sparkColor={COLOR.brand}
              />
              <Kpi
                label="Public scenarios"
                value={publicCount}
                icon="✦"
                accent={COLOR.successSoft}
                sparkColor={COLOR.success}
              />
            </>
          )}
        </div>

        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Most-built scenarios"
            subtitle="Which prompts users replicate"
          />
          {scenarios.loading ? (
            <LoadingShimmer height={120} />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginTop: 16,
              }}
            >
              {topByPushback.map((t, i) => (
                <Glass key={t.title} padding={14} radius={12} shine={false}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Eyebrow>#{i + 1}</Eyebrow>
                    <ScoreBadge score={t.avg} />
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: COLOR.ink,
                      marginTop: 6,
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>
                    <strong style={{ color: COLOR.inkSoft }}>{t.count}</strong>{' '}
                    built ·{' '}
                    <strong style={{ color: COLOR.inkSoft }}>{t.plays}</strong>{' '}
                    plays
                  </div>
                </Glass>
              ))}
              {topByPushback.length === 0 && (
                <EmptyState title="No user scenarios yet" />
              )}
            </div>
          )}
        </Glass>

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 90px 90px 100px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Scenario', 'Breed · stage', 'Difficulty', 'Plays', 'Avg score', 'Created'].map(
              (h) => (
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
              ),
            )}
          </div>
          {filtered.slice(0, 100).map((s) => (
            <div
              key={s.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 90px 90px 100px',
                padding: '12px 22px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLOR.ink,
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 2 }}>
                  {s.is_public ? (
                    <StatusPill tone="info" dot={false}>
                      Public
                    </StatusPill>
                  ) : (
                    <StatusPill tone="neutral" dot={false}>
                      Private
                    </StatusPill>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
                {s.breed ?? '—'} · {s.life_stage ?? '—'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLOR.inkSoft,
                  fontWeight: 600,
                }}
              >
                Level {s.difficulty ?? '—'}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLOR.ink,
                }}
              >
                {s.plays}
              </div>
              <ScoreBadge score={s.avg_score} />
              <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                {fmtAgo(new Date(s.created_at).getTime())}
              </div>
            </div>
          ))}
          {!scenarios.loading && filtered.length === 0 && (
            <EmptyState title="No scenarios" />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
