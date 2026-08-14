import { useMemo, useState } from 'react';
import { Glass } from '../design-system/Glass';
import { ScoreRing } from '../design-system/ScoreRing';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { bandFor } from '../data/knowledge/scoringRubric';
import { localizedDimensions } from '../i18n/dataL10n/rubric';
import { COLORS } from '../design-system/tokens';
import { readStorage } from '../lib/storage';
import { SESSIONS_KEY } from '../lib/sessionsKey';
import {
  isScoreUnavailable,
  normalizeScoreReport,
  type SessionRecord,
  type ChatMessage,
} from '../services/types';
import { getSelectedSessionId } from '../lib/selectedSession';
import { emotionJourney } from '../features/scorecard/scorecardInsights';
import { ResolutionJourney } from '../features/scorecard/ResolutionJourney';
import { SessionFeedbackCard } from '../features/feedback/SessionFeedbackCard';
import { isSessionRated } from '../features/feedback/useSessionFeedback';
import { useLanguage } from '../app/providers/LanguageProvider';
import { useT, type TFunction } from '../i18n/useT';
import { formatDateTime, formatTime } from '../i18n/format';

type Tab = 'scorecard' | 'transcript';

export function HistoryDetailScreen() {
  const { go, back } = useNavigation();
  const { t, locale } = useLanguage();
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
        <TopBar showBack title={t('history.detail.title')} />
        <Page withTabBar>
          <Glass radius={22} padding={20}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {t('history.detail.notFound.title')}
            </div>
            <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14 }}>
              {t('history.detail.notFound.body')}
            </div>
          </Glass>
        </Page>
        <BottomBar onHome={() => go('home')} />
      </>
    );
  }

  return (
    <>
      <TopBar showBack title={t('history.detail.title')} />
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
            {formatDateTime(session.createdAt, locale)} ·{' '}
            {session.mode === 'voice'
              ? t('history.mode.voice')
              : t('history.mode.text')}{' '}
            ·{' '}
            {t('history.detail.durationSeconds', {
              seconds: session.durationSeconds,
            })}
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
            ariaLabel={t('history.detail.viewAria')}
            options={[
              { value: 'scorecard', label: t('history.detail.tab.scorecard') },
              { value: 'transcript', label: t('history.detail.tab.transcript') },
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
  const t = useT();
  const { locale } = useLanguage();
  // Rate-a-past-session: offer the form only for sessions the user hasn't
  // rated yet. Read once per session id so submitting (which only re-renders
  // the card) can't yank the card's "thanks" state. Evaluated before the
  // not-scored early return purely because hooks must run unconditionally.
  const offerFeedback = useMemo(() => !isSessionRated(session.id), [session.id]);

  // A scoring-outage placeholder is not a real evaluation — don't render
  // it as a wall of zeros. The transcript tab still works.
  if (isScoreUnavailable(session.scoreReport)) {
    return (
      <Glass radius={22} padding={20}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {t('history.detail.notScored.title')}
        </div>
        <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14, lineHeight: 1.5 }}>
          {t('history.detail.notScored.body')}
        </div>
      </Glass>
    );
  }

  const report = normalizeScoreReport(session.scoreReport);
  const journey = emotionJourney(session.transcript);
  const headline =
    report.band === 'good'
      ? t('history.detail.headline.good')
      : report.band === 'ok'
        ? t('history.detail.headline.ok')
        : t('history.detail.headline.poor');

  return (
    <div className="lg:grid lg:grid-cols-[38fr_62fr] lg:gap-8 lg:items-start">
      <div>
        <Glass radius={28} padding={22} glow={COLORS.score[report.band]}>
          <div className="flex items-start gap-4">
            <ScoreRing
              score={report.overall}
              label={t('history.detail.overall')}
              size={120}
            />
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
                {t('history.detail.turns', { count: session.transcript.length })}
              </div>
            </div>
          </div>
        </Glass>
        {journey.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <ResolutionJourney journey={journey} />
          </div>
        )}
      </div>

      <div>
        <div style={{ height: 14 }} className="lg:hidden" />
        <SectionLabel>{t('history.detail.breakdown')}</SectionLabel>
        {localizedDimensions(locale).map((dim) => {
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
            <SectionLabel style={{ margin: '14px 0 8px' }}>
              {t('history.detail.keyMoments')}
            </SectionLabel>
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
          <SectionLabel>{t('history.detail.coachNotes')}</SectionLabel>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
            {report.critique}
          </p>
          <SectionLabel>{t('history.detail.betterAlternative')}</SectionLabel>
          <p style={{ margin: 0, fontSize: 14, fontStyle: 'italic', color: 'var(--pbt-text)' }}>
            "{report.betterAlternative}"
          </p>
        </Glass>

        {offerFeedback && (
          <>
            <div style={{ height: 14 }} />
            <SessionFeedbackCard
              sessionId={session.id}
              scenarioSummary={session.scenarioSummary}
              pushbackId={session.pushbackId}
            />
          </>
        )}

        <div style={{ height: 90 }} className="lg:hidden" />
      </div>
    </div>
  );
}

function TranscriptView({ messages }: { messages: ChatMessage[] }) {
  const { t, locale } = useLanguage();

  if (messages.length === 0) {
    return (
      <Glass radius={22} padding={20}>
        <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14 }}>
          {t('history.detail.emptyTranscript')}
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
                {isAi
                  ? t('history.detail.speaker.customer')
                  : t('history.detail.speaker.you')}{' '}
                · {formatTime(m.timestamp, locale)}
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
  const t: TFunction = useT();
  return (
    <div
      className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:left-[240px] lg:right-0 lg:translate-x-0 lg:max-w-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
    >
      <PillButton variant="glass" onClick={onHome} fullWidth>
        {t('history.detail.bottom.home')}
      </PillButton>
      {onBack && (
        <PillButton fullWidth onClick={onBack}>
          {t('history.detail.bottom.back')}
        </PillButton>
      )}
    </div>
  );
}
