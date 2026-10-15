/**
 * People panels on the Overview: who improved and who practised most
 * (names link to profiles), and how far the team gets from account to
 * habit.
 */
import { Avatar } from '../../primitives';
import { COLOR, DRIVER_KEYS, type DriverKey } from '../../lib/tokens';
import { CHART, Panel } from '../ui';
import type { TraineeRow } from '../lib/trainees';
import type { FunnelStep } from '../lib/overview';
import './styles';

export function asDriver(d: string | null | undefined): DriverKey | null {
  return d && (DRIVER_KEYS as readonly string[]).includes(d) ? (d as DriverKey) : null;
}

function PersonRow({
  row,
  figure,
  unit,
  sub,
  bar,
  onOpen,
}: {
  row: TraineeRow;
  figure: string;
  unit: string;
  sub: string;
  /** 0–1 share for the slim bar under the name. */
  bar?: number;
  onOpen: (id: string) => void;
}) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
      <Avatar name={row.name} driver={asDriver(row.driver)} size={28} />
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          className="pbt-link"
          onClick={() => onOpen(row.user_id)}
          style={{ fontSize: 13, display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
        >
          {row.name}
        </button>
        {bar != null ? (
          <div style={{ height: 4, borderRadius: 2, background: CHART.track, marginTop: 5 }}>
            <div style={{ width: `${Math.max(4, bar * 100)}%`, height: '100%', borderRadius: 2, background: CHART.primary }} />
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{figure}</div>
        <div style={{ fontSize: 10.5, color: COLOR.inkMute, whiteSpace: 'nowrap' }}>{bar != null ? sub : unit}</div>
      </div>
    </li>
  );
}

function SubHead({ children, hint }: { children: string; hint: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLOR.ink }}>{children}</div>
      <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 1 }}>{hint}</div>
    </div>
  );
}

export function LeadersPanel({
  improved,
  active,
  windowWords,
  onOpenProfile,
  onOpenTrainees,
}: {
  improved: TraineeRow[];
  active: TraineeRow[];
  windowWords: string;
  onOpenProfile: (id: string) => void;
  onOpenTrainees: () => void;
}) {
  const top = Math.max(1, ...active.map((r) => r.sessions));
  return (
    <Panel
      title="Leaders"
      subtitle="Worth a word of thanks — and good peer examples"
      actions={
        <button type="button" className="pbt-link" onClick={onOpenTrainees} style={{ fontSize: 12 }}>
          All trainees →
        </button>
      }
    >
      <div className="pbt-ov-cq">
        <div className="pbt-ov-two">
          <div>
            <SubHead hint="Latest 5 scores vs the 5 before">Most improved</SubHead>
            {improved.length === 0 ? (
              <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>
                No one who practised in the {windowWords} has 7+ scored sessions showing a rise yet.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {improved.map((r) => (
                  <PersonRow
                    key={r.user_id}
                    row={r}
                    figure={`+${Math.round(r.momentum as number)}`}
                    unit="points"
                    sub={r.avgScore != null ? `Averages ${Math.round(r.avgScore)} now` : `${r.sessions} sessions`}
                    onOpen={onOpenProfile}
                  />
                ))}
              </ul>
            )}
          </div>
          <div>
            <SubHead hint={`Sessions in the ${windowWords}`}>Most active</SubHead>
            {active.length === 0 ? (
              <div style={{ fontSize: 12, color: COLOR.inkMute }}>No sessions in this window.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {active.map((r) => (
                  <PersonRow
                    key={r.user_id}
                    row={r}
                    figure={String(r.sessions)}
                    unit="sessions"
                    sub={r.avgScore != null ? `avg ${Math.round(r.avgScore)}` : 'not scored'}
                    bar={r.sessions / top}
                    onOpen={onOpenProfile}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function FunnelPanel({ steps, onOpenTrainees }: { steps: FunnelStep[]; onOpenTrainees: () => void }) {
  const accounts = steps[0]?.count ?? 0;
  return (
    <Panel
      title="Getting started"
      subtitle="How far people get, from account to regular practice"
      actions={
        <button type="button" className="pbt-link" onClick={onOpenTrainees} style={{ fontSize: 12 }}>
          See who →
        </button>
      }
      footnote="People, not sessions. The first three steps count every session ever; disabled accounts are left out."
    >
      {accounts === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '8px 0' }}>No accounts yet — invite your team from People.</div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map((s, i) => {
            const pctv = s.pctOfAccounts ?? 0;
            const drop = i > 0 && i < 3 ? steps[i - 1].count - s.count : null;
            return (
              <li key={s.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 150px) minmax(0, 1fr)', gap: 14, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.inkSoft }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: COLOR.inkMute, marginTop: 1, lineHeight: 1.35 }}>{s.hint}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ flex: 1, height: 22, borderRadius: 4, background: CHART.track, position: 'relative', minWidth: 0 }}>
                    <div
                      style={{
                        width: `${pctv > 0 ? Math.max(pctv, 1.5) : 0}%`,
                        height: '100%',
                        borderRadius: 4,
                        background: i === 0 ? CHART.primarySoft : CHART.primary,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                  <div style={{ width: 74, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: COLOR.ink, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                    <span style={{ fontSize: 11, color: COLOR.inkMute, marginLeft: 5, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(pctv)}%
                    </span>
                  </div>
                </div>
                {drop != null && drop > 0 && (
                  <div style={{ gridColumn: 2, fontSize: 10.5, color: COLOR.inkMute, marginTop: -9 }}>
                    {drop} {i === 1 ? 'never practised' : 'stopped before a third session'}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
