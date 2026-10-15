/**
 * Monitor → Feedback → Session feedback: how trainees rated their sessions.
 *
 * Each rating says WHO left it — the trainee's name when they were signed in
 * (from the analytics directory, readable with `sessions.read`), otherwise
 * "Anonymous" with the same short device tag the Sessions tab shows. Most
 * people practise without an account, so "Anonymous" is the normal case and
 * reads as such, not as an error. When the rating's session is one the viewer
 * can open, the row opens it in Analytics → Sessions.
 */
import { useMemo } from 'react';
import { Glass } from '../primitives/Glass';
import { Avatar, EmptyState, Kpi, LoadingShimmer } from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAccess } from '../primitives/access';
import { useSessionFeedback } from '../data/queries';
import type { SessionFeedbackRow } from '../data/types';
import type { TraineeDirectoryEntry } from '../../../src/shared/analytics/contract';
import { COLOR, DRIVER_KEYS, type DriverKey } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { formatRoute } from '../lib/route';
import { pushbackLabel } from '../lib/labels';
import { useSessionSummaries, useTraineeDirectory } from '../analytics/data';
import { displayName } from '../analytics/lib/trainees';
import { deviceLabel } from '../analytics/lib/who';
import { AnonAvatar, DeviceTag } from '../analytics/who';

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function asDriver(v: string | null | undefined): DriverKey | null {
  return v && (DRIVER_KEYS as string[]).includes(v) ? (v as DriverKey) : null;
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

/** Who left a rating, in words — the search box finds a row by these too. */
export function feedbackWho(
  f: Pick<SessionFeedbackRow, 'user_id' | 'anon_session_id'>,
  personOf: (userId: string) => TraineeDirectoryEntry | null,
): string {
  if (!f.user_id) return `Anonymous · ${deviceLabel(f.anon_session_id)}`;
  const p = personOf(f.user_id);
  return p ? displayName(p) : 'Signed-in trainee';
}

/** Open a session in Analytics → Sessions (the portal routes on the hash). */
function openSession(id: string) {
  window.location.hash = formatRoute({ screen: 'analytics', tab: 'sessions', id });
}

const GRID = 'minmax(150px, 1.1fr) 84px 84px 84px minmax(0, 2fr) 104px';

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
  const { can } = useAccess();
  const canSessions = can('sessions.read');
  // Names and openable sessions need `sessions.read`; without it every row
  // still says whether it was signed in or anonymous.
  const directory = useTraineeDirectory(canSessions);
  const sessions = useSessionSummaries(range, { enabled: canSessions });

  const people = useMemo(() => {
    const m = new Map<string, TraineeDirectoryEntry>();
    for (const e of directory.data.rows) m.set(e.user_id, e);
    return m;
  }, [directory.data.rows]);
  const personOf = (userId: string) => people.get(userId) ?? null;
  const openable = useMemo(() => new Set(sessions.data.rows.map((s) => s.id)), [sessions.data.rows]);

  const stats = useMemo(() => {
    const d = feedback.data;
    return {
      total: d.length,
      anonymous: d.filter((f) => !f.user_id).length,
      realism: avg(d.map((f) => f.realism ?? 0).filter(Boolean)),
      aiQuality: avg(d.map((f) => f.ai_quality ?? 0).filter(Boolean)),
      comfort: avg(d.map((f) => f.comfort ?? 0).filter(Boolean)),
      withComment: d.filter((f) => f.comment?.trim()).length,
    };
  }, [feedback.data]);

  const filtered = feedback.data.filter((f) =>
    !query
      ? true
      : `${feedbackWho(f, personOf)} ${f.comment ?? ''} ${f.scenario_summary ?? ''} ${f.pushback_id ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
  );

  return (
    <>
      <ContextBar
        title="Session Feedback"
        subtitle="How trainees rated their sessions"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
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

        <Glass padding={0} radius={20} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 720 }}>
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
                {['Who', 'Realism', 'AI', 'Comfort', 'Comment / scenario', 'Time'].map((h) => (
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
              {filtered.slice(0, 150).map((f) => {
                const sessionId = canSessions && f.session_id && openable.has(f.session_id) ? f.session_id : null;
                const person = f.user_id ? personOf(f.user_id) : null;
                return (
                  <div
                    key={f.id}
                    className={sessionId ? 'pbt-row-hover' : undefined}
                    onClick={sessionId ? () => openSession(sessionId) : undefined}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID,
                      padding: '12px 22px',
                      gap: 12,
                      alignItems: 'center',
                      borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                      cursor: sessionId ? 'pointer' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      {f.user_id ? (
                        <Avatar name={person ? displayName(person) : null} driver={asDriver(person?.echo_primary)} size={26} />
                      ) : (
                        <AnonAvatar size={26} />
                      )}
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 650,
                            color: COLOR.ink,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {f.user_id ? (person ? displayName(person) : 'Signed-in trainee') : 'Anonymous'}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: COLOR.inkMute,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {f.user_id ? 'Signed in' : <DeviceTag anonId={f.anon_session_id} />}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12 }}><Stars value={f.realism} /></div>
                    <div style={{ fontSize: 12 }}><Stars value={f.ai_quality} /></div>
                    <div style={{ fontSize: 12 }}><Stars value={f.comfort} /></div>
                    <div style={{ fontSize: 12.5, color: COLOR.ink, lineHeight: 1.4, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {f.comment?.trim() ? (
                        <span>{f.comment}</span>
                      ) : (
                        <span style={{ color: COLOR.inkMute }}>
                          {f.scenario_summary ?? (f.pushback_id ? pushbackLabel(f.pushback_id) : '—')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.inkMute, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span>{fmtAgo(new Date(f.created_at).getTime())}</span>
                      {sessionId && (
                        <button
                          type="button"
                          className="pbt-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSession(sessionId);
                          }}
                          style={{ fontSize: 11.5, alignSelf: 'flex-start' }}
                        >
                          Open session →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {!feedback.loading && filtered.length === 0 && (
            <EmptyState title="No feedback yet" subtitle="Responses appear here once users rate a session." />
          )}
        </Glass>
        {!feedback.loading && stats.total > 0 && (
          <div style={{ fontSize: 11.5, color: COLOR.inkMute, lineHeight: 1.55, padding: '0 4px' }}>
            {stats.anonymous === stats.total
              ? 'Every rating here came from someone practising without an account.'
              : stats.anonymous > 0
                ? `${stats.anonymous} of ${stats.total} ratings came from people practising without an account.`
                : 'Every rating here came from a signed-in trainee.'}{' '}
            Anonymous ratings carry no name — only a short device tag, the same one the Sessions tab shows.
            {filtered.some((f) => f.session_id && openable.has(f.session_id)) &&
              canSessions &&
              ' Select a rating to open the session it was about.'}
          </div>
        )}
      </ScreenShell>
    </>
  );
}
