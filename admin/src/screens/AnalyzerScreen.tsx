import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import {
  EmptyState,
  Kpi,
  LoadingShimmer,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAnalyzerEvents } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import type { Verdict } from '../data/types';

const VERDICT_LABEL: Record<NonNullable<Verdict>, string> = {
  on_track: 'On track',
  watch: 'Watch',
  adjust: 'Adjust',
  concern: 'Concern',
};
const VERDICT_TONE: Record<NonNullable<Verdict>, 'success' | 'warn' | 'danger'> = {
  on_track: 'success',
  watch: 'warn',
  adjust: 'warn',
  concern: 'danger',
};

export function AnalyzerScreen({
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
  const events = useAnalyzerEvents(range, 1000);

  const stats = useMemo(() => {
    const e = events.data;
    const verdictDist: Record<NonNullable<Verdict>, number> = {
      on_track: 0,
      watch: 0,
      adjust: 0,
      concern: 0,
    };
    for (const a of e) {
      if (a.verdict) verdictDist[a.verdict]++;
    }
    const bcsBuckets = Array.from({ length: 9 }, () => 0);
    for (const a of e) {
      if (a.bcs && a.bcs >= 1 && a.bcs <= 9) bcsBuckets[a.bcs - 1]++;
    }
    const breedCounts: Record<string, number> = {};
    for (const a of e) {
      if (a.breed) breedCounts[a.breed] = (breedCounts[a.breed] ?? 0) + 1;
    }
    const topBreeds = Object.entries(breedCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
    const uniqueUsers = new Set(e.map((a) => a.user_id).filter(Boolean)).size;
    const total = e.length;
    return { verdictDist, bcsBuckets, topBreeds, uniqueUsers, total };
  }, [events.data]);

  const filtered = events.data.filter((a) =>
    !query
      ? true
      : (a.breed ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  const maxBcs = Math.max(...stats.bcsBuckets, 1);
  const onTrackPct = stats.total
    ? Math.round((stats.verdictDist.on_track / stats.total) * 100)
    : 0;

  return (
    <>
      <ContextBar
        title="Pet Analyzer"
        subtitle="Body condition & verdicts"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}
        >
          {events.loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <LoadingShimmer key={i} height={140} />
            ))
          ) : (
            <>
              <Kpi
                label="Analyzer events"
                value={stats.total}
                icon="✿"
                accent={COLOR.brandSoft}
                sparkColor={COLOR.brand}
              />
              <Kpi
                label="Unique users"
                value={stats.uniqueUsers}
                icon="◔"
                accent={COLOR.infoSoft}
                sparkColor={COLOR.info}
              />
              <Kpi
                label="On-track"
                value={`${onTrackPct}%`}
                icon="✓"
                accent={COLOR.successSoft}
                sparkColor={COLOR.success}
              />
              <Kpi
                label="Concerns"
                value={stats.verdictDist.concern}
                icon="⚠"
                accent={COLOR.dangerSoft}
                sparkColor={COLOR.danger}
              />
            </>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 16,
          }}
        >
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Body condition score distribution"
              subtitle="Sweet spot is 4–5; outliers indicate intervention opportunities"
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                height: 180,
                padding: '16px 8px 0',
              }}
            >
              {stats.bcsBuckets.map((v, i) => {
                const bcs = i + 1;
                const ideal = bcs >= 4 && bcs <= 5;
                const concern = bcs <= 2 || bcs >= 8;
                const color = ideal
                  ? COLOR.success
                  : concern
                    ? COLOR.danger
                    : COLOR.warn;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: COLOR.inkSoft,
                      }}
                    >
                      {v}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: `${(v / maxBcs) * 140}px`,
                        background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 60%, white))`,
                        borderRadius: '6px 6px 2px 2px',
                        minHeight: 4,
                        transition: 'height 0.6s ease',
                      }}
                    />
                    <div
                      style={{
                        fontSize: 10,
                        color: COLOR.inkMute,
                        fontWeight: 600,
                      }}
                    >
                      BCS {bcs}
                    </div>
                  </div>
                );
              })}
            </div>
          </Glass>
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Verdict mix"
              subtitle="What the analyzer tells users"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {(Object.keys(VERDICT_LABEL) as Array<keyof typeof VERDICT_LABEL>).map((k) => {
                const n = stats.verdictDist[k];
                const pct = stats.total ? (n / stats.total) * 100 : 0;
                return (
                  <div key={k}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: COLOR.inkSoft,
                        fontWeight: 600,
                      }}
                    >
                      <span>{VERDICT_LABEL[k]}</span>
                      <span style={{ fontWeight: 700, color: COLOR.ink }}>
                        {n}{' '}
                        <span style={{ color: COLOR.inkMute, fontWeight: 500, fontSize: 11 }}>
                          ({Math.round(pct)}%)
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: 'oklch(0.96 0.01 20)',
                        marginTop: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: COLOR[VERDICT_TONE[k]] as string,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: COLOR.inkMute,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Top breeds
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                {stats.topBreeds.map(([b, n]) => (
                  <span
                    key={b}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: COLOR.brandSoft,
                      color: 'oklch(0.40 0.10 22)',
                    }}
                  >
                    {b} · {n}
                  </span>
                ))}
                {stats.topBreeds.length === 0 && (
                  <span style={{ color: COLOR.inkMute, fontSize: 12 }}>—</span>
                )}
              </div>
            </div>
          </Glass>
        </div>

        <Glass padding={0} radius={20}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 80px 80px 90px 110px 90px',
              padding: '14px 22px',
              gap: 12,
              background: 'rgba(255,255,255,0.5)',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            {['Breed', 'BCS', 'MCS', 'Weight', 'Verdict', 'Time'].map((h) => (
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
          {filtered.slice(0, 100).map((a) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 80px 80px 90px 110px 90px',
                padding: '12px 22px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLOR.ink,
                }}
              >
                {a.breed ?? '—'}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLOR.ink,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {a.bcs ?? '—'}/9
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: COLOR.inkSoft,
                  fontFamily: 'var(--pbt-mono)',
                }}
              >
                {a.mcs ?? '—'}/4
              </div>
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
                {a.weight_kg ? `${a.weight_kg}kg` : '—'}
              </div>
              {a.verdict ? (
                <StatusPill tone={VERDICT_TONE[a.verdict]}>
                  {VERDICT_LABEL[a.verdict]}
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">—</StatusPill>
              )}
              <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                {fmtAgo(new Date(a.created_at).getTime())}
              </div>
            </div>
          ))}
          {!events.loading && filtered.length === 0 && (
            <EmptyState
              title="No analyzer events"
              subtitle="Try a wider window"
            />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
