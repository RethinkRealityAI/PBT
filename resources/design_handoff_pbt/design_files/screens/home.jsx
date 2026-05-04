// PBT — Home dashboard
function HomeScreen({ profile, onStart, onCreate, onOpenSession, onAnalyzer, onResources, onTab, theme = 'light' }) {
  const dark = theme === 'dark';
  const primary = ECHO_DRIVERS[profile?.primary || 'Activator'];
  const recents = [
    { id: 's1', title: 'Grain-free pushback', breed: 'Golden Retriever, 3yr', score: 86, time: '2h ago' },
    { id: 's2', title: 'Price objection on Rx diet', breed: 'French Bulldog, 5yr', score: 72, time: 'Yesterday' },
    { id: 's3', title: '"My breeder said…"', breed: 'GSD puppy, 4mo', score: 91, time: 'Mon' },
  ];

  return (
    <Page theme={theme}>
      <TopBar
        theme={theme}
        title=""
        trailing={<>
          <button style={iconBtn(dark)}><Icon.bell/></button>
          <button onClick={() => onTab('settings')} style={{ ...iconBtn(dark), padding: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'linear-gradient(135deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--pbt-font)', fontWeight: 600, fontSize: 13,
              boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset',
            }}>SR</div>
          </button>
        </>}
      />

      <div style={{ padding: '4px 22px 0' }}>
        {/* Greeting */}
        <div style={{
          fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 500,
          color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)',
          marginBottom: 4,
        }}>
          Good morning, Sam
        </div>
        <h1 style={{
          fontFamily: 'var(--pbt-font)',
          fontSize: 36, lineHeight: 1.05, fontWeight: 400, margin: 0, marginBottom: 4,
          letterSpacing: '-0.025em',
          color: dark ? '#fff' : 'oklch(0.18 0.04 20)',
        }}>
          What pushback are<br/>you ready for today?
        </h1>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: primary.accent, marginTop: 12, marginBottom: 18,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: primary.color, boxShadow: `0 0 8px ${primary.color}` }}/>
          Driver · The {primary.name}
        </div>

        {/* Streak strip */}
        <Glass radius={20} blur={32} padding={14} theme={theme} glow={primary.color}
          style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 19,
              background: 'linear-gradient(135deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon.flame/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>
                12-day streak
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.45 0.04 20)' }}>
                3 scenarios · 84% avg score this week
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <div key={i} style={{
                  width: 16, height: 22, borderRadius: 8,
                  background: i < 5 ? 'linear-gradient(180deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))' : (dark ? 'rgba(255,255,255,0.08)' : 'oklch(0.55 0.22 18 / 0.1)'),
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Geist Mono, monospace', fontSize: 8, fontWeight: 600,
                  color: i < 5 ? '#fff' : (dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.50 0.04 20)'),
                }}>{d}</div>
              ))}
            </div>
          </div>
        </Glass>

        {/* Big start card */}
        <Glass radius={26} blur={36} padding={0} theme={theme} glow={primary.color}
          style={{ marginBottom: 14, position: 'relative', overflow: 'hidden', minHeight: 200 }}>
          <div style={{
            position: 'absolute', top: -30, right: -30, width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(closest-side, oklch(0.65 0.24 22 / 0.7), transparent 70%)',
            filter: 'blur(8px)',
          }}/>
          <div style={{ padding: 22, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ position: 'absolute', top: 18, right: 18 }}>
              <Orb size={84} intensity={1.1}/>
            </div>
            <div style={{
              fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'oklch(0.55 0.24 18)', marginBottom: 10,
            }}>
              Today's pick
            </div>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 26, lineHeight: 1.1,
              fontWeight: 400, letterSpacing: '-0.02em',
              color: dark ? '#fff' : 'oklch(0.18 0.04 20)', marginBottom: 6, maxWidth: 200,
            }}>
              Cost objection<br/>on a Rx diet
            </div>
            <div style={{
              fontFamily: 'var(--pbt-font)', fontSize: 13, lineHeight: 1.45,
              color: dark ? 'rgba(255,255,255,0.65)' : 'oklch(0.40 0.04 20)',
              maxWidth: 240, marginBottom: 18,
            }}>
              Owner of a 7-yr Lab is hesitant about prescription food. Practice leading with empathy first.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <PillButton onClick={onStart} icon={<Icon.arrow/>} style={{ flexDirection: 'row-reverse', height: 44, fontSize: 14, padding: '0 18px' }}>
                Start scenario
              </PillButton>
              <PillButton variant="glass" theme={theme} style={{ height: 44, fontSize: 14, padding: '0 16px' }}>
                Skip
              </PillButton>
            </div>
          </div>
        </Glass>

        {/* Quick actions: 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <Glass radius={20} blur={32} padding={16} theme={theme} onClick={onCreate}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.32)',
              border: dark ? '0.5px solid rgba(255,255,255,0.18)' : '0.5px solid rgba(255,255,255,0.7)',
              backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'oklch(0.55 0.24 18)', marginBottom: 10,
            }}>
              <Icon.plus/>
            </div>
            <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2 }}>
              Build a scenario
            </div>
            <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.50 0.04 20)', lineHeight: 1.4 }}>
              From something you ran into this week
            </div>
          </Glass>
          <Glass radius={20} blur={32} padding={16} theme={theme} onClick={onAnalyzer}
            style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -10, right: -10, width: 80, height: 80, borderRadius: '50%',
              background: 'radial-gradient(closest-side, oklch(0.78 0.18 32 / 0.32), transparent 70%)',
              filter: 'blur(8px)',
            }}/>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.32)',
                border: dark ? '0.5px solid rgba(255,255,255,0.18)' : '0.5px solid rgba(255,255,255,0.7)',
                backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'oklch(0.55 0.24 18)', marginBottom: 10,
              }}>
                <Icon.paw/>
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2 }}>
                Pet Analyzer
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.50 0.04 20)', lineHeight: 1.4 }}>
                Body & muscle score, calorie targets
              </div>
            </div>
          </Glass>
        </div>

        {/* Library/resources promo */}
        <Glass radius={22} blur={32} padding={0} theme={theme}
          onClick={onResources}
          style={{ marginBottom: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.5,
            pointerEvents: 'none',
          }}>
            <DriverWave driver="all" height={100} width={400} amplitude={0.85} speed={0.7} theme={theme}/>
          </div>
          <div style={{ position: 'relative', padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.38)',
              border: dark ? '0.5px solid rgba(255,255,255,0.18)' : '0.5px solid rgba(255,255,255,0.75)',
              backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'oklch(0.45 0.10 20)',
            }}>
              <Icon.book/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 15, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>
                Clinical library
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)' }}>
                WSAVA body & muscle scoring · calorie tables · nutrition guides
              </div>
            </div>
            <span style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)' }}>
              <Icon.arrow/>
            </span>
          </div>
        </Glass>

        {/* Recent */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12,
        }}>
          <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 15, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>
            Recent sessions
          </div>
          <button onClick={() => onTab('history')} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--pbt-font)', fontSize: 12, fontWeight: 500,
            color: 'oklch(0.55 0.24 18)',
          }}>
            See all →
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recents.map(r => (
            <Glass key={r.id} radius={18} blur={28} padding={14} theme={theme} onClick={() => onOpenSession && onOpenSession(r)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `linear-gradient(135deg, oklch(0.78 0.18 32 / 0.28), oklch(0.55 0.24 18 / 0.22))`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'oklch(0.55 0.24 18)',
                  border: '0.5px solid rgba(255,255,255,0.55)',
                }}>
                  <Icon.chat/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.title}
                  </div>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.50 0.04 20)' }}>
                    {r.breed} · {r.time}
                  </div>
                </div>
                <ScoreChip score={r.score} dark={dark}/>
              </div>
            </Glass>
          ))}
        </div>
      </div>
    </Page>
  );
}

function iconBtn(dark) {
  return {
    width: 36, height: 36, borderRadius: 18,
    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)',
    border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(255,255,255,0.7)',
    backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: dark ? '#fff' : 'oklch(0.30 0.10 20)', cursor: 'pointer',
  };
}

function ScoreChip({ score, dark }) {
  const color = score >= 85 ? 'oklch(0.55 0.18 145)' : score >= 70 ? 'oklch(0.65 0.18 60)' : 'oklch(0.55 0.24 18)';
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 22,
      background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)',
      backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: `1.5px solid ${color}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 700,
      color, flexShrink: 0,
    }}>
      {score}
    </div>
  );
}

Object.assign(window, { HomeScreen, ScoreChip, iconBtn });
