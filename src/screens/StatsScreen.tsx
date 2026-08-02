import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { ScoreRing } from '../design-system/ScoreRing';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useChat } from '../app/providers/ChatProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { DIMENSIONS, bandFor } from '../data/knowledge/scoringRubric';
import { isScoreUnavailable, normalizeScoreReport } from '../services/types';
import { SessionFeedbackCard } from '../features/feedback/SessionFeedbackCard';
import {
  computeScoreDelta,
  emotionJourney,
  weakestDimension,
} from '../features/scorecard/scorecardInsights';
import { ResolutionJourney } from '../features/scorecard/ResolutionJourney';
import { COLORS } from '../design-system/tokens';
import { readStorage } from '../lib/storage';
import { SESSIONS_KEY } from '../lib/sessionsKey';
import { setSelectedSessionId } from '../lib/selectedSession';
import { useT } from '../i18n/useT';

const easeOut = [0.22, 1, 0.36, 1] as const;

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

function MonoLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
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

export function StatsScreen() {
  const { go } = useNavigation();
  const t = useT();
  const chat = useChat();
  const { scenario } = useScenario();
  const reduceMotion = useReducedMotion();
  const [rescoring, setRescoring] = useState(false);
  const [rescoreFailed, setRescoreFailed] = useState(false);

  const rawReport = chat.scoreReport;
  const unavailable = isScoreUnavailable(rawReport);
  const report = rawReport && !unavailable ? normalizeScoreReport(rawReport) : null;

  // Progress vs the trainee's own history. Sessions are stored newest-first;
  // the just-finished session is excluded by id inside the helper.
  const delta = useMemo(() => {
    if (!report) return null;
    return computeScoreDelta(readStorage(SESSIONS_KEY), chat.sessionId, report.overall);
  }, [report, chat.sessionId]);

  const journey = useMemo(() => emotionJourney(chat.messages), [chat.messages]);

  const retryScoring = async () => {
    setRescoring(true);
    setRescoreFailed(false);
    const ok = await chat.rescore();
    setRescoring(false);
    if (!ok) setRescoreFailed(true);
  };

  const openTranscript = () => {
    if (!chat.sessionId) return;
    setSelectedSessionId(chat.sessionId);
    go('historyDetail');
  };

  if (!report) {
    const hasMessages = chat.messages.length > 0;
    return (
      <>
        <TopBar showBack title={t('stats.topbar.unavailable')} />
        <Page>
          <Glass radius={22} padding={20}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {hasMessages ? t('stats.unavailable.title') : t('stats.none.title')}
            </div>
            <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14, lineHeight: 1.5 }}>
              {hasMessages ? t('stats.unavailable.body') : t('stats.none.body')}
            </div>
            {rescoreFailed && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: COLORS.score.poor,
                }}
              >
                {t('stats.unavailable.retryFailed')}
              </div>
            )}
            {hasMessages && (
              <div style={{ marginTop: 16 }}>
                <PillButton fullWidth onClick={() => void retryScoring()} disabled={rescoring}>
                  {rescoring
                    ? t('stats.unavailable.retrying')
                    : t('stats.unavailable.retry')}
                </PillButton>
              </div>
            )}
          </Glass>
        </Page>
        <div
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:static lg:translate-x-0 lg:mt-4 lg:max-w-md lg:mx-0 lg:px-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
        >
          <PillButton variant="glass" onClick={() => go('home')} fullWidth>
            {t('stats.cta.home')}
          </PillButton>
          {hasMessages && (
            <PillButton fullWidth onClick={() => { chat.reset(); go('chat'); }}>
              {t('stats.cta.runAgain')}
            </PillButton>
          )}
        </div>
      </>
    );
  }

  const focus = weakestDimension(report);
  const bandColor = COLORS.score[report.band];
  // `focus.label` comes from the (admin-configurable) scoring rubric and is
  // interpolated as data — the surrounding sentence is what gets localized.
  const headline =
    report.band === 'good'
      ? t('stats.headline.good')
      : report.band === 'ok'
        ? t('stats.headline.ok', { focus: focus.label.toLowerCase() })
        : t('stats.headline.poor');

  const deltaChip = (() => {
    if (!delta) return null;
    if (delta.personalBest) {
      return { text: t('stats.delta.personalBest'), color: COLORS.score.good };
    }
    switch (delta.kind) {
      case 'first':
        return { text: t('stats.delta.first'), color: 'var(--pbt-text-muted)' };
      case 'improved':
        return {
          text: t('stats.delta.improved', { delta: delta.delta }),
          color: COLORS.score.good,
        };
      case 'dropped':
        return {
          text: t('stats.delta.dropped', { delta: delta.delta }),
          color: COLORS.score.poor,
        };
      case 'even':
        return { text: t('stats.delta.even'), color: 'var(--pbt-text-muted)' };
    }
  })();

  return (
    <>
      <TopBar showBack title={t('stats.topbar.title')} />
      <Page>
        <motion.div
          initial={reduceMotion ? false : 'hidden'}
          animate="show"
          variants={listVariants}
        >
        {/*
         * Two-column grid on desktop. Left col is the persistent summary
         * (sticky on tall screens) — overall score, resolution arc, focus
         * card + Run-again CTA. Right col holds the dimension breakdown,
         * key moments and coach notes. Mobile keeps a single-column
         * cascade in source order.
         */}
        <div className="lg:grid lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:gap-8 lg:items-start">

        {/* ── Left column: overall score + journey + focus ── */}
        <div className="lg:sticky lg:top-6">
        <motion.div variants={itemVariants}>
        <Glass radius={28} padding={22} glow={bandColor}>
          <div className="flex items-start gap-4">
            <ScoreRing score={report.overall} label={t('stats.overall')} size={120} animate />
            <div className="flex-1">
              <h2
                style={{
                  margin: '4px 0 6px',
                  fontSize: 24,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  whiteSpace: 'pre-line',
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
                {chat.messages.length === 1
                  ? t('stats.turnsOne')
                  : t('stats.turns', { count: chat.messages.length })}
              </div>
              {deltaChip && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: 10,
                    padding: '4px 12px',
                    borderRadius: 9999,
                    border: `1px solid color-mix(in oklab, ${deltaChip.color} 45%, transparent)`,
                    background: `color-mix(in oklab, ${deltaChip.color} 12%, transparent)`,
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: deltaChip.color,
                  }}
                >
                  {deltaChip.text}
                </div>
              )}
            </div>
          </div>
          {/* Desktop: inline Run-again under the ring. Mobile keeps the
              fixed bottom bar so the CTA stays thumb-reachable. */}
          <div className="hidden lg:block lg:pt-5">
            <PillButton
              fullWidth
              icon={<Icon.flame />}
              onClick={() => {
                chat.reset();
                go('chat');
              }}
            >
              {t('stats.cta.runAgain')}
            </PillButton>
          </div>
        </Glass>
        </motion.div>

        {journey.length > 0 && (
          <motion.div variants={itemVariants} style={{ marginTop: 14 }}>
            <ResolutionJourney journey={journey} />
          </motion.div>
        )}

        {/* Focus next — the weakest dimension plus what excellent sounds
            like, straight from the rubric bands. Turns "one thing to fix"
            from a platitude into a named, example-backed target. */}
        <motion.div variants={itemVariants} style={{ marginTop: 14 }}>
          <Glass radius={22} padding={18} glow={bandFor(report[focus.key]) === 'good' ? null : bandColor}>
            <MonoLabel style={{ paddingLeft: 0, color: 'var(--pbt-driver-primary)', fontWeight: 700 }}>
              {t('stats.focus.label', { dimension: focus.label })}
            </MonoLabel>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
              {focus.description}
            </p>
            {focus.bands.excellent.example && (
              <>
                <MonoLabel style={{ paddingLeft: 0, marginBottom: 4 }}>
                  {t('stats.focus.excellent')}
                </MonoLabel>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                    color: 'var(--pbt-text)',
                  }}
                >
                  {focus.bands.excellent.example}
                </p>
              </>
            )}
          </Glass>
        </motion.div>
        </div>

        {/* ── Right column: breakdown + key moments + coach notes ── */}
        <div>

        <div style={{ height: 14 }} className="lg:hidden" />

        <motion.div variants={itemVariants}>
        <MonoLabel>{t('stats.breakdown')}</MonoLabel>
        {/* Two-up on desktop so the dimensions don't form a tall narrow stack. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-3">
          {DIMENSIONS.map((dim, idx) => {
            const score = report[dim.key];
            const band = bandFor(score);
            const color = COLORS.score[band];
            return (
              <div
                key={dim.key}
                style={{ marginBottom: 10 }}
                className="lg:mb-0"
              >
                <Glass radius={20} padding={16}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {dim.label}
                    </div>
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
                    <motion.div
                      initial={reduceMotion ? false : { width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                      transition={{
                        duration: reduceMotion ? 0 : 0.65,
                        delay: reduceMotion ? 0 : 0.45 + idx * 0.08,
                        ease: easeOut,
                      }}
                      style={{
                        height: '100%',
                        maxWidth: '100%',
                        background: `linear-gradient(90deg, color-mix(in oklab, ${color} 82%, white), ${color})`,
                        borderRadius: 9999,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {report.perDimensionNotes[dim.key]}
                  </div>
                </Glass>
              </div>
            );
          })}
        </div>
        </motion.div>

        {report.keyMoments.length > 0 && (
          <motion.div variants={itemVariants}>
            <MonoLabel style={{ margin: '14px 0 8px' }}>{t('stats.keyMoments')}</MonoLabel>
            {report.keyMoments.map((m, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <Glass
                  radius={18}
                  padding={14}
                  style={{
                    borderLeft: `3px solid ${
                      m.type === 'win' ? COLORS.score.good : COLORS.score.poor
                    }`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: m.type === 'win' ? COLORS.score.good : COLORS.score.poor,
                      marginBottom: 4,
                    }}
                  >
                    {m.type === 'win'
                      ? t('stats.moment.win', { label: m.label })
                      : t('stats.moment.miss', { label: m.label })}
                  </div>
                  <div
                    style={{
                      fontStyle: 'italic',
                      fontSize: 13,
                      color: 'var(--pbt-text)',
                    }}
                  >
                    "{m.quote}"
                  </div>
                </Glass>
              </div>
            ))}
          </motion.div>
        )}

        <motion.div variants={itemVariants}>
        <div style={{ height: 14 }} />
        <Glass radius={22} padding={18}>
          <MonoLabel style={{ paddingLeft: 0, marginBottom: 6 }}>{t('stats.coachNotes')}</MonoLabel>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--pbt-text)',
            }}
          >
            {report.critique}
          </p>
          <MonoLabel style={{ paddingLeft: 0, marginBottom: 6 }}>{t('stats.betterAlternative')}</MonoLabel>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--pbt-text)',
            }}
          >
            "{report.betterAlternative}"
          </p>
          {chat.sessionId && (
            <div style={{ marginTop: 14 }}>
              <PillButton variant="glass" fullWidth onClick={openTranscript}>
                {t('stats.reviewTranscript')}
              </PillButton>
            </div>
          )}
        </Glass>
        </motion.div>

        <motion.div variants={itemVariants}>
        <div style={{ height: 14 }} />
        <SessionFeedbackCard
          sessionId={chat.sessionId}
          scenarioSummary={
            scenario ? `${scenario.pushback.title} · ${scenario.breed}` : undefined
          }
          pushbackId={scenario?.pushback.id}
        />
        </motion.div>

        <div style={{ height: 90 }} className="lg:hidden" />
        </div>{/* end right column */}
        </div>{/* end two-column grid */}
        </motion.div>
      </Page>
      {/* Mobile-only sticky CTA bar. Desktop has Run-again inline under
          the score ring; the back arrow in TopBar handles navigation home. */}
      <div
        className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton variant="glass" onClick={() => go('home')} fullWidth>
          {t('stats.cta.home')}
        </PillButton>
        <PillButton
          fullWidth
          onClick={() => {
            chat.reset();
            go('chat');
          }}
        >
          {t('stats.cta.runAgain')}
        </PillButton>
      </div>
    </>
  );
}
