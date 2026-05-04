// PBT — Onboarding / Sign-in
function OnboardingScreen({ onContinue, theme = 'light' }) {
  const dark = theme === 'dark';
  const [step, setStep] = useState(0);
  const slides = [
    {
      title: 'Train the\nawkward moments.',
      body: 'Practice the conversations that decide whether a client trusts your recommendation — before you have them at the counter.',
    },
    {
      title: 'AI clients\nthat push back.',
      body: 'Real objections from real owners — pricing, ingredients, "my friend said." The AI adapts to your tone and pace.',
    },
    {
      title: 'Know your\ndelivery style.',
      body: 'Take the ECHO Driver quiz to see how you naturally lead a conversation, and where to lean in or soften.',
    },
  ];
  const cur = slides[step];

  return (
    <Page theme={theme} padBottom={32}>
      <div style={{
        minHeight: '100%', display: 'flex', flexDirection: 'column',
        padding: '36px 24px 24px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Orb size={32} pulse={false}/>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--pbt-font)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>PBT</span>
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)', textTransform: 'uppercase' }}>Pushback Training</span>
          </div>
        </div>

        {/* Hero orb */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 32px' }}>
          <Orb size={180} intensity={1.2}/>
        </div>

        {/* Heading */}
        <h1 style={{
          fontFamily: 'var(--pbt-font)',
          fontSize: 42, lineHeight: 1.02,
          fontWeight: 400, margin: 0, marginBottom: 16,
          letterSpacing: '-0.025em',
          color: dark ? '#fff' : 'oklch(0.20 0.04 20)',
          whiteSpace: 'pre-line',
        }}>
          {cur.title}
        </h1>
        <p style={{
          fontFamily: 'var(--pbt-font)', fontSize: 15, lineHeight: 1.55,
          color: dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.42 0.04 20)',
          margin: 0, marginBottom: 28, textWrap: 'pretty',
        }}>
          {cur.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              height: 4, flex: i === step ? 2 : 1,
              borderRadius: 2,
              background: i === step
                ? 'linear-gradient(90deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                : (dark ? 'rgba(255,255,255,0.15)' : 'oklch(0.55 0.22 18 / 0.18)'),
              transition: 'flex 0.3s ease',
            }}/>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {step < slides.length - 1 ? (
            <PillButton onClick={() => setStep(step + 1)} icon={<Icon.arrow/>} style={{ height: 54, fontSize: 16, justifyContent: 'center', flexDirection: 'row-reverse' }}>
              Continue
            </PillButton>
          ) : (
            <PillButton onClick={onContinue} icon={<Icon.arrow/>} style={{ height: 54, fontSize: 16, justifyContent: 'center', flexDirection: 'row-reverse' }}>
              Take the ECHO Quiz
            </PillButton>
          )}
          <button onClick={onContinue} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 500,
            color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.45 0.04 20)',
            padding: '12px',
          }}>
            I already have an account · Sign in
          </button>
        </div>
      </div>
    </Page>
  );
}

Object.assign(window, { OnboardingScreen });
