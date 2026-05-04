import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS, DRIVER_KEYS } from '../design-system/tokens';

export function ResultScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  if (!profile) return null;

  const primary = ECHO_DRIVERS[profile.primary];
  const secondary = ECHO_DRIVERS[profile.secondary];
  const primaryColors = DRIVER_COLORS[profile.primary];
  const secondaryColors = DRIVER_COLORS[profile.secondary];
  const totalAnswers = profile.answers.length;
  const matchPct = Math.round(
    (profile.tally[profile.primary] / totalAnswers) * 100,
  );

  return (
    <>
      <TopBar showBack />
      <Page>
        <Glass
          radius={28}
          padding={0}
          glow={primaryColors.primary}
          style={{ overflow: 'hidden', position: 'relative' }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: -80,
              bottom: -60,
              width: 280,
              height: 280,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${primaryColors.primary} 45%, transparent), transparent 70%)`,
              filter: 'blur(14px)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ padding: '22px 22px 0', position: 'relative' }}>
            <div
              style={{
                display: 'inline-block',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 9999,
                color: '#fff',
                background: `linear-gradient(135deg, ${primaryColors.primary}, ${primaryColors.accent})`,
              }}
            >
              Primary Driver · {matchPct}% match
            </div>
            <h1
              style={{
                margin: '14px 0 6px',
                fontSize: 48,
                fontWeight: 400,
                letterSpacing: '-0.025em',
                lineHeight: 1,
                color: primaryColors.primary,
              }}
            >
              {primary.name}
            </h1>
            <div
              style={{
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--pbt-text-muted)',
                marginBottom: 10,
              }}
            >
              {primary.tagline}
            </div>
            <p
              style={{
                margin: '0 0 14px',
                fontSize: 15,
                lineHeight: 1.45,
                color: 'var(--pbt-text)',
                textWrap: 'pretty' as never,
              }}
            >
              {primary.blurb}
            </p>
          </div>
          <div style={{ height: 110, position: 'relative' }}>
            <DriverWave driver={profile.primary} height={110} />
          </div>
        </Glass>

        <div style={{ height: 14 }} />

        <Glass radius={22} padding={20}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 12,
            }}
          >
            Driver mix · {totalAnswers} answers
          </div>
          {DRIVER_KEYS.map((k) => {
            const count = profile.tally[k];
            const pct = Math.round((count / totalAnswers) * 100);
            const c = DRIVER_COLORS[k];
            return (
              <div
                key={k}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: c.primary,
                    }}
                  />
                  <span
                    style={{ fontSize: 13, color: 'var(--pbt-text)' }}
                  >
                    {k}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 11,
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  {count} · {pct}%
                </div>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    height: 6,
                    borderRadius: 9999,
                    background: 'rgba(60,20,15,0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${c.primary}, ${c.accent})`,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </Glass>

        <div style={{ height: 14 }} />

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
          {primary.name} · in practice
        </div>
        {primary.traits.map((t) => (
          <div key={t.name} style={{ marginBottom: 10 }}>
            <Glass radius={20} padding={16} glow={primaryColors.primary}>
              <div className="flex items-start gap-3">
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: `color-mix(in oklab, ${primaryColors.primary} 22%, transparent)`,
                    color: primaryColors.primary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon.check />
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      marginBottom: 2,
                      color: 'var(--pbt-text)',
                    }}
                  >
                    {t.name}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {t.description}
                  </div>
                </div>
              </div>
            </Glass>
          </div>
        ))}

        <Glass
          radius={20}
          padding={18}
          style={{
            borderLeft: `3px solid ${primaryColors.accent}`,
            marginTop: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: primaryColors.accent,
              marginBottom: 6,
              fontWeight: 700,
            }}
          >
            Growth Edge
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--pbt-text)',
            }}
          >
            {primary.growth}
          </div>
        </Glass>

        <div style={{ height: 18 }} />

        <Glass
          radius={22}
          padding={20}
          glow={secondaryColors.primary}
          style={{ overflow: 'hidden' }}
        >
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
            Support driver
          </div>
          <h3
            style={{
              margin: '0 0 4px',
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: secondaryColors.primary,
            }}
          >
            {secondary.name}
          </h3>
          <div
            style={{
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--pbt-text-muted)',
              marginBottom: 8,
            }}
          >
            {secondary.tagline}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--pbt-text)',
            }}
          >
            {secondary.blurb}
          </p>
          <div style={{ marginTop: 10, height: 64 }}>
            <DriverWave driver={profile.secondary} height={64} />
          </div>
        </Glass>

        <div style={{ height: 90 }} />
      </Page>
      <div
        className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 px-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        <PillButton
          size="lg"
          fullWidth
          icon={<Icon.arrow />}
          onClick={() => go('home')}
        >
          Start training
        </PillButton>
      </div>
    </>
  );
}
