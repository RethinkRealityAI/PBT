import { useMemo, useState } from 'react';
import { Glass } from '../design-system/Glass';
import { ScoreRing } from '../design-system/ScoreRing';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { DIMENSIONS, bandFor } from '../data/knowledge/scoringRubric';
import { COLORS } from '../design-system/tokens';
import { readStorage, type StorageKeyDef } from '../lib/storage';
import type { SessionRecord, ChatMessage } from '../services/types';
import { getSelectedSessionId } from '../lib/selectedSession';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};

type Tab = 'scorecard' | 'transcript';

export function HistoryDetailScreen() {
  const { go, back } = useNavigation();
  const [tab, setTab] = useState<Tab>('scorecard');

  // Resolve the session record from the id stashed by HistoryScreen.
  // Re-read on every render rather than memoizing on a non-existent prop —
  // the id is module-level state, not React state.
  const sessionId = getSelectedSessionId();
  const session = useMemo(() => {
    if (!sessionId) return null;
    const all = readStorage(SESSIONS_KEY);
    return all.find((s) => s.id === sessionId) ?? null;
  }, [sessionId]);

  if (!session) {
    return (
      <>
        <TopBar showBack title="Session" />
        <Page withTabBar>
          <Glass radius={22} padding={20}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Session not found</div>
            <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14 }}>
              This session may have been deleted or the link is stale.
            </div>
          </Glass>
        </Page>
        <BottomBar onHome={() => go('home')} />
      </>
    );
  }

  return (
    <>
      <TopBar showBack title="Session" />
      <Page withTabBar>
        {/* Header: scenario summary + meta */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 6,
            }}
          >
            {new Date(session.createdAt).toLocaleString()} · {session.mode} · {session.durationSeconds}s
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              color: 'var(--pbt-text)',
            }}
          >
            {session.scenarioSummary}
          </h1>
        </div>

        {/* Tab toggle */}
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            ariaLabel="View"
            options={[
              { value: 'scorecard', label: 'Scorecard' },
              { value: 'transcript', label: 'Transcript' },
            ]}
          />
        </div>

        {tab === 'scorecard' ? (
          <ScorecardView session={session} />
        ) : (
          <TranscriptView messages={session.transcript} />
        )}
      </Page>
      <BottomBar onHome={() => go('home')} onBack={back} />
    </>
  );
}

function ScorecardView({ session }: { session: SessionRecord }) {
  const report = session.scoreReport;
  const headline =
    report.band === 'good'
      ? 'Strong session.'
      : report.band === 'ok'
        ? 'Solid foundation.'
        : 'Room to grow.';

  return (
    <div className="lg:grid lg:grid-cols-[38fr_62fr] lg:gap-8 lg:items-start">
      <div>
        <Glass radius={28} padding={22} glow="oklch(0.62 0.22 22)">
          <div className="flex items-start gap-4">
            <ScoreRing score={report.overall} label="Overall" size={120} />
            <div className="flex-1">
              <h2
                style={{
                  margin: '4px 0 6px',
                  fontSize: 22,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  color: 'var(--pbt-text)',
                }}
              >
                {headline}
              </h2>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                }}
              >
                {session.transcript.length} turns
              </div>
            </div>
          </div>
        </Glass>
      </div>

      <div>
        <div style={{ height: 14 }} className="lg:hidden" />
        <SectionLabel>Breakdown</SectionLabel>
        {DIMENSIONS.map((dim) => {
          const score = report[dim.key];
          const band = bandFor(score);
          const color =
            band === 'good'
              ? COLORS.score.good
              : band === 'ok'
                ? COLORS.score.ok
                : COLORS.score.poor;
          return (
            <div key={dim.key} style={{ marginBottom: 10 }}>
              <Glass radius={20} padding={16}>
                <div className="flex items-baseline justify-between gap-3">
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dim.label}</div>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 18,
                      fontWeight: 700,
                      color,
                    }}
                  >
                    {score}
                  </div>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 9999,
                    background: 'rgba(60,20,15,0.06)',
                    overflow: 'hidden',
                    margin: '8px 0',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, score))}%`,
                      height: '100%',
                      background: color,
                    }}
                  />
                </div>
                {report.perDimensionNotes[dim.key] && (
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--pbt-text-muted)' }}>
                    {report.perDimensionNotes[dim.key]}
                  </div>
                )}
              </Glass>
            </div>
          );
        })}

        {report.keyMoments.length > 0 && (
          <>
            <SectionLabel style={{ margin: '14px 0 8px' }}>Key moments</SectionLabel>
            {report.keyMoments.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <Glass
                  radius={18}
                  padding={14}
                  style={{
                    borderLeft: `3px solid ${m.type === 'win' ? COLORS.score.good : COLORS.score.poor}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    {m.ts} · {m.label}
                  </div>
                  <div style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--pbt-text)' }}>
                    "{m.quote}"
                  </div>
                </Glass>
              </div>
            ))}
          </>
        )}

        <div style={{ height: 14 }} />
        <Glass radius={22} padding={18}>
          <SectionLabel>Coach notes</SectionLabel>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
            {report.critique}
          </p>
          <SectionLabel>Better alternative</SectionLabel>
          <p style={{ margin: 0, fontSize: 14, fontStyle: 'italic', color: 'var(--pbt-text)' }}>
            "{report.betterAlternative}"
          </p>
        </Glass>

        <div style={{ height: 90 }} className="lg:hidden" />
      </div>
    </div>
  );
}

function TranscriptView({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <Glass radius={22} padding={20}>
        <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14 }}>
          No transcript saved for this session.
        </div>
      </Glass>
    );
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {messages.map((m, i) => {
        const isAi = m.role === 'ai';
        return (
          <div
            key={`${m.timestamp}-${i}`}
            style={{
              display: 'flex',
              justifyContent: isAi ? 'flex-start' : 'flex-end',
              marginBottom: 10,
            }}
          >
            <div style={{ maxWidth: '82%' }}>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 4,
                  textAlign: isAi ? 'left' : 'right',
                  paddingLeft: isAi ? 4 : 0,
                  paddingRight: isAi ? 0 : 4,
                }}
              >
                {isAi ? 'Customer' : 'You'} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <Glass
                radius={16}
                padding={12}
                style={
                  isAi
                    ? undefined
                    : {
                        background:
                          'linear-gradient(180deg, oklch(0.66 0.22 22 / 0.18), oklch(0.56 0.24 18 / 0.10))',
                      }
                }
              >
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
                  {m.text}
                </div>
              </Glass>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--pbt-text-muted)',
        marginBottom: 8,
        paddingLeft: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BottomBar({ onHome, onBack }: { onHome: () => void; onBack?: () => void }) {
  return (
    <div
      className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:left-[240px] lg:right-0 lg:translate-x-0 lg:max-w-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
    >
      <PillButton variant="glass" onClick={onHome} fullWidth>
        Home
      </PillButton>
      {onBack && (
        <PillButton fullWidth onClick={onBack}>
          Back to history
        </PillButton>
      )}
    </div>
  );
}
