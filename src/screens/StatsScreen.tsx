import { Glass } from '../design-system/Glass';
import { ScoreRing } from '../design-system/ScoreRing';
import { PillButton } from '../design-system/PillButton';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useChat } from '../app/providers/ChatProvider';
import { DIMENSIONS, bandFor } from '../data/knowledge/scoringRubric';
import { COLORS } from '../design-system/tokens';

export function StatsScreen() {
  const { go } = useNavigation();
  const chat = useChat();
  const report = chat.scoreReport;

  if (!report) {
    const hasMessages = chat.messages.length > 0;
    return (
      <>
        <TopBar showBack title="Session scorecard" />
        <Page>
          <Glass radius={22} padding={20}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {hasMessages ? 'Scoring unavailable' : 'No session yet'}
            </div>
            <div style={{ color: 'var(--pbt-text-muted)', fontSize: 14 }}>
              {hasMessages
                ? 'The AI scorer couldn\'t reach the API right now. Your conversation was saved — try again when back online.'
                : 'Run a session first.'}
            </div>
          </Glass>
        </Page>
        <div
          className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:static lg:translate-x-0 lg:mt-4 lg:max-w-md lg:mx-0 lg:px-0"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
        >
          <PillButton variant="glass" onClick={() => go('home')} fullWidth>Home</PillButton>
          {hasMessages && (
            <PillButton fullWidth onClick={() => { chat.reset(); go('chat'); }}>
              Run it again
            </PillButton>
          )}
        </div>
      </>
    );
  }

  const headline =
    report.band === 'good'
      ? 'Strong session.\nKeep that line of attack.'
      : report.band === 'ok'
        ? 'Solid foundation.\nOne thing to fix.'
        : 'A lot to learn here —\nwhich is the point.';

  return (
    <>
      <TopBar showBack title="Scorecard" />
      <Page>
        {/*
         * Two-column grid on desktop. Left col is the persistent summary
         * (sticky on tall screens) — overall score + Run-again CTA + key
         * moments. Right col holds the dimension breakdown and the coach
         * notes which can stretch the full content rail. On mobile we
         * keep a single-column cascade in source order.
         */}
        <div className="lg:grid lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:gap-8 lg:items-start">

        {/* ── Left column: overall score + run-again ── */}
        <div className="lg:sticky lg:top-6">
        <Glass radius={28} padding={22} glow="oklch(0.62 0.22 22)">
          <div className="flex items-start gap-4">
            <ScoreRing score={report.overall} label="Overall" size={120} />
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
                {chat.messages.length} turns
              </div>
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
              Run it again
            </PillButton>
          </div>
        </Glass>
        </div>

        {/* ── Right column: breakdown + key moments + coach notes ── */}
        <div>

        <div style={{ height: 14 }} className="lg:hidden" />

        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 8,
            paddingLeft: 4,
          }}
        >
          Breakdown
        </div>
        {/* Two-up on desktop so 7 dimensions don't form a tall narrow stack. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-3">
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
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, score))}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${color}, ${color})`,
                        transition: 'width 0.6s ease',
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

        {report.keyMoments.length > 0 && (
          <>
            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                margin: '14px 0 8px',
                paddingLeft: 4,
              }}
            >
              Key moments
            </div>
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
                      color: 'var(--pbt-text-muted)',
                      marginBottom: 4,
                    }}
                  >
                    {m.ts} · {m.label}
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
          </>
        )}

        <div style={{ height: 14 }} />
        <Glass radius={22} padding={18}>
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
            Coach notes
          </div>
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
            Better alternative
          </div>
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
        </Glass>

        <div style={{ height: 90 }} className="lg:hidden" />
        </div>{/* end right column */}
        </div>{/* end two-column grid */}
      </Page>
      {/* Mobile-only sticky CTA bar. Desktop has Run-again inline under
          the score ring; the back arrow in TopBar handles navigation home. */}
      <div
        className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[var(--pbt-layout-max)] -translate-x-1/2 gap-2 px-5 lg:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton variant="glass" onClick={() => go('home')} fullWidth>
          Home
        </PillButton>
        <PillButton
          fullWidth
          onClick={() => {
            chat.reset();
            go('chat');
          }}
        >
          Run it again
        </PillButton>
      </div>
    </>
  );
}
