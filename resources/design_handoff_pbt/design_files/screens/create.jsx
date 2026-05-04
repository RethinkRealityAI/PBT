// PBT — Create Scenario builder
function CreateScreen({ onBack, onLaunch, theme = 'light' }) {
  const dark = theme === 'dark';
  const [breed, setBreed] = useState('Labrador Retriever');
  const [age, setAge] = useState('Adult (3-7)');
  const [objection, setObjection] = useState(0);
  const [persona, setPersona] = useState('Skeptical');
  const [difficulty, setDifficulty] = useState(2);
  const [context, setContext] = useState('');

  const objections = [
    { t: 'Cost / price pushback', s: '"It\'s too expensive for what it is."' },
    { t: 'Friend / breeder said…', s: '"My breeder told me to feed something else."' },
    { t: 'Grain-free / trend belief', s: '"Grain-free is healthier, right?"' },
    { t: 'Skepticism on Rx diet', s: '"Is this really medically necessary?"' },
    { t: 'Switching brands hesitation', s: '"My dog already eats fine — why change?"' },
  ];
  const personas = ['Skeptical', 'Anxious', 'Busy', 'Bargain-hunter', 'Devoted'];

  return (
    <Page theme={theme} padBottom={120}>
      <TopBar theme={theme} onBack={onBack} title="New Scenario"/>

      <div style={{ padding: '4px 22px 0' }}>
        <h1 style={{
          fontFamily: 'var(--pbt-font)',
          fontSize: 32, lineHeight: 1.05, fontWeight: 400, margin: 0, marginBottom: 6,
          letterSpacing: '-0.025em', color: dark ? '#fff' : 'oklch(0.18 0.04 20)',
        }}>
          Build it from<br/>something real.
        </h1>
        <div style={{
          fontFamily: 'var(--pbt-font)', fontSize: 14, lineHeight: 1.5,
          color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.42 0.04 20)', marginBottom: 22, textWrap: 'pretty',
        }}>
          The more details you give us, the better the AI client can replay the exact moment that tripped you up.
        </div>

        <Section label="Breed">
          <Glass radius={18} blur={28} padding={0} theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 4px 14px' }}>
              <Icon.search/>
              <input value={breed} onChange={(e) => setBreed(e.target.value)} style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--pbt-font)', fontSize: 15, padding: 12,
                color: dark ? '#fff' : 'oklch(0.20 0.04 20)',
              }}/>
            </div>
          </Glass>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['Lab', 'Golden', 'French Bulldog', 'GSD', 'Mini Schnauzer', 'Poodle', 'Mixed'].map(b => (
              <Chip key={b} active={breed.toLowerCase().includes(b.toLowerCase().split(' ')[0])} onClick={() => setBreed(b)}>{b}</Chip>
            ))}
          </div>
        </Section>

        <Section label="Life stage">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {['Puppy (<1)', 'Junior (1-3)', 'Adult (3-7)', 'Senior (7+)'].map(a => (
              <Glass key={a} radius={16} blur={28} padding={14} theme={theme} onClick={() => setAge(a)}
                style={age === a ? { border: '1px solid oklch(0.62 0.22 22)', background: 'oklch(0.92 0.06 22 / 0.7)' } : {}}>
                <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>{a}</div>
              </Glass>
            ))}
          </div>
        </Section>

        <Section label="The pushback">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {objections.map((o, i) => (
              <Glass key={i} radius={18} blur={28} padding={14} theme={theme}
                onClick={() => setObjection(i)}
                style={objection === i ? { border: '1px solid oklch(0.62 0.22 22)', background: 'oklch(0.92 0.06 22 / 0.6)' } : {}}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11, marginTop: 2, flexShrink: 0,
                    border: objection === i ? 'none' : '1.5px solid oklch(0.55 0.22 18 / 0.3)',
                    background: objection === i ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))' : 'transparent',
                    color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {objection === i && <Icon.check/>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2 }}>{o.t}</div>
                    <div style={{ fontFamily: 'var(--pbt-font)', fontStyle: 'italic', fontSize: 13, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.42 0.04 20)' }}>{o.s}</div>
                  </div>
                </div>
              </Glass>
            ))}
          </div>
        </Section>

        <Section label="Owner persona">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {personas.map(p => (
              <Chip key={p} active={persona === p} onClick={() => setPersona(p)}>{p}</Chip>
            ))}
          </div>
        </Section>

        <Section label="Difficulty">
          <Glass radius={18} blur={28} padding={16} theme={theme}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              {['Coachable', 'Skeptical', 'Hostile', 'Combative'].map((l, i) => (
                <button key={l} onClick={() => setDifficulty(i + 1)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: difficulty === i + 1 ? 'oklch(0.55 0.24 18)' : (dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.04 20)'),
                }}>{l}</button>
              ))}
            </div>
            <div style={{ position: 'relative', height: 6, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.08)' : 'oklch(0.55 0.22 18 / 0.1)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${difficulty * 25}%`,
                background: 'linear-gradient(90deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
                borderRadius: 3, transition: 'width 0.3s',
              }}/>
            </div>
          </Glass>
        </Section>

        <Section label="What actually happened (optional)">
          <Glass radius={18} blur={28} padding={0} theme={theme}>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="A line, a phrase, the tone they used — anything you remember from the real conversation."
              style={{
                width: '100%', minHeight: 90, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--pbt-font)', fontSize: 14, padding: 14, resize: 'none',
                color: dark ? '#fff' : 'oklch(0.20 0.04 20)',
              }}
            />
          </Glass>
        </Section>
      </div>

      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 20, zIndex: 5 }}>
        <PillButton onClick={() => onLaunch({ breed, age, objection: objections[objection].t, persona, difficulty })}
          icon={<Icon.spark/>} style={{ width: '100%', height: 54, fontSize: 16, justifyContent: 'center', flexDirection: 'row-reverse' }}>
          Generate scenario
        </PillButton>
      </div>
    </Page>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'oklch(0.45 0.04 20)', marginBottom: 10,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
      fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 500,
      background: active
        ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
        : 'rgba(255,255,255,0.55)',
      color: active ? '#fff' : 'oklch(0.30 0.10 20)',
      border: active ? 'none' : '0.5px solid rgba(255,255,255,0.85)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      boxShadow: active ? '0 4px 10px -2px oklch(0.55 0.22 18 / 0.4)' : '0 1px 2px rgba(0,0,0,0.04)',
      transition: 'all 0.2s',
    }}>{children}</button>
  );
}

Object.assign(window, { CreateScreen, Section, Chip });
