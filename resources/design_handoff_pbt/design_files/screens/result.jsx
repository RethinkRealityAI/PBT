// PBT — Quiz results / Driver profile
function ResultScreen({ result, onContinue, theme = 'light' }) {
  const dark = theme === 'dark';
  const fallbackTally = { Activator: 6, Energizer: 4, Analyzer: 3, Harmonizer: 2 };
  const tally = result?.tally || fallbackTally;
  const total = Object.values(tally).reduce((a, b) => a + b, 0) || 16;
  const primaryKey = result?.primary || 'Activator';
  const secondaryKey = result?.secondary || 'Energizer';
  const primary = ECHO_DRIVERS[primaryKey];
  const secondary = ECHO_DRIVERS[secondaryKey];
  const primaryPct = Math.round(tally[primaryKey] / total * 100);

  return (
    <Page theme={theme} padBottom={120}>
      <TopBar theme={theme} title="Your ECHO Profile" />

      <div style={{ padding: '12px 22px 0' }}>
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.55 0.04 20)',
          marginBottom: 10,
        }}>
          Your primary driver
        </div>

        {/* Hero card — text on top, wave on bottom */}
        <Glass radius={28} blur={28} padding={0} theme={theme} glow={primary.color}
          style={{ marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
          {/* driver-specific bloom — anchored bottom-right */}
          <div style={{
            position: 'absolute', bottom: -80, right: -60, width: 280, height: 280,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${primary.color} 0%, transparent 70%)`,
            opacity: 0.45, filter: 'blur(14px)',
          }}/>
          {/* shine layer */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.2) 100%)',
            pointerEvents: 'none',
          }}/>

          {/* Text block — clear of wave */}
          <div style={{ position: 'relative', zIndex: 2, padding: '26px 26px 14px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
              borderRadius: 999, fontFamily: 'Geist Mono, monospace', fontSize: 11,
              fontWeight: 600, letterSpacing: '0.1em',
              background: `linear-gradient(180deg, color-mix(in oklab, ${primary.color} 92%, white), ${primary.color})`,
              color: '#fff',
              marginBottom: 16,
              boxShadow: `0 4px 14px -4px ${primary.color}, 0 1px 0 rgba(255,255,255,0.4) inset`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em' }}>PRIMARY DRIVER</span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span>{primaryPct}% MATCH</span>
            </div>
            <h1 style={{
              fontFamily: 'var(--pbt-font)',
              fontSize: 48, lineHeight: 0.98, margin: 0, marginBottom: 8,
              fontWeight: 400, letterSpacing: '-0.025em',
              color: primary.color,
            }}>
              The {primary.name}
            </h1>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 500,
              color: dark ? 'rgba(255,255,255,0.85)' : 'oklch(0.18 0.04 20)',
              marginBottom: 14, fontStyle: 'italic',
            }}>
              {primary.tagline}
            </div>
            <p style={{
              fontFamily: 'var(--pbt-font)', fontSize: 15, lineHeight: 1.55,
              color: dark ? 'rgba(255,255,255,0.82)' : 'oklch(0.28 0.04 20)',
              margin: 0, textWrap: 'pretty', maxWidth: '90%',
            }}>
              {primary.blurb}
            </p>
          </div>

          {/* Wave occupies the lower band only — won't cross the text */}
          <div style={{
            position: 'relative', zIndex: 1,
            height: 110, marginTop: 4,
            opacity: 0.85,
            mixBlendMode: dark ? 'screen' : 'multiply',
            pointerEvents: 'none',
          }}>
            <DriverWave driver={primaryKey} height={110} width={400} amplitude={1.3} speed={0.85} theme={theme}/>
          </div>
        </Glass>

        {/* Driver mix — clean, no ambient wave */}
        <Glass radius={22} blur={28} padding={0} theme={theme}
          style={{ marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 20 }}>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600,
              color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 4,
            }}>
              Your driver mix
            </div>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 12,
              color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)',
              marginBottom: 16,
            }}>
              Out of {total} answers, here's how they fell.
            </div>
            {Object.keys(ECHO_DRIVERS).map(k => {
              const d = ECHO_DRIVERS[k];
              const count = tally[k] || 0;
              const pct = Math.round(count / total * 100);
              return (
                <div key={k} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600,
                      color: dark ? '#fff' : 'oklch(0.22 0.04 20)',
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 5,
                        background: d.color, boxShadow: `0 0 8px ${d.color}`,
                      }}/>
                      {d.name}
                    </span>
                    <span style={{
                      fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 500,
                      color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)',
                    }}>
                      {count} · {pct}%
                    </span>
                  </div>
                  <div style={{
                    height: 8, borderRadius: 4,
                    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg, ${d.color}, ${d.accent})`,
                      borderRadius: 4, transition: 'width 0.6s ease',
                      boxShadow: `0 0 8px ${d.color}`,
                    }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Glass>

        {/* Traits */}
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.55 0.04 20)',
          margin: '8px 0 12px',
        }}>
          The {primary.name} leader · in practice
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {primary.traits.map(([name, desc], i) => (
            <Glass key={i} radius={18} blur={28} padding={16} theme={theme} glow={primary.color}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                  background: `linear-gradient(180deg, ${primary.color}, ${primary.accent})`,
                  color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset',
                }}>
                  <Icon.check/>
                </div>
                <div>
                  <div style={{
                    fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600,
                    color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2,
                  }}>{name}</div>
                  <div style={{
                    fontFamily: 'var(--pbt-font)', fontSize: 13, lineHeight: 1.45,
                    color: dark ? 'rgba(255,255,255,0.65)' : 'oklch(0.40 0.04 20)',
                  }}>{desc}</div>
                </div>
              </div>
            </Glass>
          ))}
        </div>

        {/* Growth callout */}
        <Glass radius={20} blur={28} padding={18} theme={theme} glow={primary.color}
          style={{ marginBottom: 18, borderLeft: `3px solid ${primary.accent}` }}>
          <div style={{
            fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: primary.accent, marginBottom: 6,
          }}>
            Growth Edge
          </div>
          <div style={{
            fontFamily: 'var(--pbt-font)', fontSize: 14, lineHeight: 1.5,
            color: dark ? 'rgba(255,255,255,0.78)' : 'oklch(0.28 0.04 20)',
            textWrap: 'pretty',
          }}>
            {primary.growth}
          </div>
        </Glass>

        {/* Secondary support card — wave moved BELOW info, not overlapping */}
        <Glass radius={20} blur={28} padding={0} theme={theme} glow={secondary.color}
          style={{ marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 18 }}>
            <div style={{
              fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: secondary.accent, marginBottom: 6,
            }}>
              Support driver
            </div>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 24,
              fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05,
              color: dark ? '#fff' : 'oklch(0.18 0.04 20)', marginBottom: 4,
            }}>
              The {secondary.name}
            </div>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 13, lineHeight: 1.5,
              color: dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.40 0.04 20)',
              textWrap: 'pretty',
            }}>
              When your primary driver isn't enough, you lean here. We'll cue this style during scenarios that call for it.
            </div>
          </div>
          {/* Wave moved BELOW the info — no longer overlapping */}
          <div style={{
            position: 'relative', height: 80,
            opacity: 0.85, mixBlendMode: dark ? 'screen' : 'multiply',
            pointerEvents: 'none',
          }}>
            <DriverWave driver={secondaryKey} height={80} width={400} amplitude={0.9} speed={0.7} theme={theme}/>
          </div>
        </Glass>
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'absolute', left: 14, right: 14, bottom: 20, zIndex: 5,
      }}>
        <PillButton onClick={onContinue} icon={<Icon.arrow/>} style={{
          width: '100%', height: 54, fontSize: 16,
          justifyContent: 'center', flexDirection: 'row-reverse',
        }}>
          Start training
        </PillButton>
      </div>
    </Page>
  );
}

Object.assign(window, { ResultScreen });
