// PBT — Session stats / scorecard
function StatsScreen({ session, onBack, onRetry, onHome, theme = 'light' }) {
  const dark = theme === 'dark';
  const overall = session?.overall || 86;
  const dims = session?.dims || [
    { k: 'Empathy & tone',      v: 92, note: 'Strong opener — you named her worry first.' },
    { k: 'Active listening',    v: 88, note: 'Three reflective check-ins. Best at minute 2.' },
    { k: 'Product knowledge',   v: 78, note: 'Cited the GI study cleanly; missed the digestibility stat.' },
    { k: 'Objection handling',  v: 84, note: 'Reframed cost into cost-per-day. Could have anchored sooner.' },
    { k: 'Confidence',          v: 81, note: 'Two filler-word clusters at the close.' },
    { k: 'Closing effectiveness', v: 86, note: 'Clear next step + follow-up window. Nice.' },
    { k: 'Response speed',      v: 90, note: 'Avg 3.2s. Comfortable pacing.' },
  ];
  const moments = session?.moments || [
    { t: '00:42', label: 'Best moment', q: '"That\'s a fair concern — let\'s look at what Bailey actually needs."', tone: 'win' },
    { t: '01:58', label: 'Missed moment', q: 'You skipped past her comment about her friend\'s vet. Validate that next time.', tone: 'miss' },
    { t: '03:12', label: 'Strong close', q: '"Two-week trial, I\'ll text you Wednesday — does that work?"', tone: 'win' },
  ];

  return (
    <Page theme={theme} padBottom={140}>
      <TopBar theme={theme} onBack={onBack} title="Session Score"/>

      <div style={{ padding: '4px 22px 0' }}>
        {/* Overall score hero */}
        <Glass radius={28} blur={28} padding={26} theme={theme}
          style={{ marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -50, right: -50, width: 240, height: 240, borderRadius: '50%',
            background: 'radial-gradient(closest-side, oklch(0.65 0.24 22 / 0.6), transparent 70%)',
            filter: 'blur(8px)',
          }}/>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 18 }}>
            <ScoreRing value={overall} size={120}/>
            <div>
              <div style={{
                fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'oklch(0.55 0.24 18)', marginBottom: 6,
              }}>Overall</div>
              <div style={{
                fontFamily: 'var(--pbt-font)', fontSize: 28, lineHeight: 1.05,
                fontWeight: 400, letterSpacing: '-0.02em',
                color: dark ? '#fff' : 'oklch(0.18 0.04 20)', marginBottom: 6,
              }}>
                Strong session.<br/>One thing to fix.
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)' }}>
                3:24 · 11 turns · Cost objection
              </div>
            </div>
          </div>
        </Glass>

        {/* Dimensions */}
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)',
          margin: '12px 0 12px',
        }}>Breakdown</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {dims.map((d, i) => (
            <Glass key={i} radius={18} blur={28} padding={14} theme={theme}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>{d.k}</div>
                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 700, color: d.v >= 85 ? 'oklch(0.55 0.18 145)' : d.v >= 75 ? 'oklch(0.55 0.20 60)' : 'oklch(0.55 0.24 18)' }}>{d.v}</div>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: dark ? 'rgba(255,255,255,0.06)' : 'oklch(0.55 0.22 18 / 0.08)', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', width: `${d.v}%`,
                  background: 'linear-gradient(90deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
                  borderRadius: 2,
                }}/>
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, lineHeight: 1.45, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.42 0.04 20)' }}>{d.note}</div>
            </Glass>
          ))}
        </div>

        {/* Moments */}
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)',
          margin: '12px 0 12px',
        }}>Key moments</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {moments.map((m, i) => {
            const isWin = m.tone === 'win';
            return (
              <Glass key={i} radius={18} blur={28} padding={14} theme={theme}
                style={{ borderLeft: `3px solid ${isWin ? 'oklch(0.55 0.18 145)' : 'oklch(0.55 0.24 18)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, fontWeight: 600, color: isWin ? 'oklch(0.45 0.18 145)' : 'oklch(0.55 0.24 18)' }}>{m.label}</div>
                  <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)' }}>{m.t}</div>
                </div>
                <div style={{ fontFamily: 'var(--pbt-font)', fontStyle: isWin ? 'italic' : 'normal', fontSize: 15, lineHeight: 1.4, color: dark ? 'rgba(255,255,255,0.85)' : 'oklch(0.22 0.04 20)' }}>
                  {m.q}
                </div>
              </Glass>
            );
          })}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 20, zIndex: 5, display: 'flex', gap: 8 }}>
        <PillButton variant="glass" theme={theme} onClick={onHome} style={{ flex: 1, height: 54, fontSize: 15, justifyContent: 'center' }}>
          Home
        </PillButton>
        <PillButton onClick={onRetry} icon={<Icon.arrow/>} style={{ flex: 1.4, height: 54, fontSize: 15, justifyContent: 'center', flexDirection: 'row-reverse' }}>
          Run it again
        </PillButton>
      </div>
    </Page>
  );
}

function ScoreRing({ value, size = 120 }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.18 32)"/>
            <stop offset="100%" stopColor="oklch(0.55 0.24 18)"/>
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke="oklch(0.55 0.22 18 / 0.1)" strokeWidth="6" fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke="url(#ringGrad)" strokeWidth="6" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 1s ease' }}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 36, fontWeight: 400, color: 'oklch(0.18 0.04 20)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'oklch(0.50 0.04 20)' }}>OUT OF 100</div>
      </div>
    </div>
  );
}

Object.assign(window, { StatsScreen, ScoreRing });
