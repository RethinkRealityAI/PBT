// PBT — ECHO Personality Driver Quiz (real questions from spec)
// Drivers: Activator, Energizer, Analyzer, Harmonizer
// Each question has 4 options, one per driver.

const ECHO_DRIVERS = {
  Activator: {
    key: 'Activator', name: 'Activator', tagline: 'Clear expectations, swift action',
    color: 'oklch(0.62 0.22 25)',  // red
    accent: 'oklch(0.52 0.24 22)',
    soft: 'oklch(0.92 0.06 22)',
    wave: 'assets/wave-activator.png',
    blurb: 'You move conversations forward with confidence. Owners know exactly what to do next, and they trust your certainty.',
    traits: [
      ['Master Delegator',     'You assign next steps cleanly — no hedging, no soft-pedal. Clients leave with a plan.'],
      ['Progress Enforcer',    'You monitor follow-through and intervene quickly to keep care on track.'],
      ['Decisive Authority',   'You\'re comfortable making tough recommendations, prioritizing care over popularity.'],
      ['Unwavering Control',   'You address pushback to your guidance swiftly, keeping the conversation focused.'],
      ['Clarity Reigns Supreme','Your direct communication style ensures every owner walks out with the same message.'],
    ],
    growth: 'Watch for: speed at the cost of warmth. Slow your first 30 seconds and name the worry before naming the plan.',
  },
  Energizer: {
    key: 'Energizer', name: 'Energizer', tagline: 'Motivation through positivity',
    color: 'oklch(0.85 0.16 95)',  // yellow
    accent: 'oklch(0.65 0.16 80)',
    soft: 'oklch(0.96 0.08 95)',
    wave: 'assets/wave-energizer.png',
    blurb: 'You bring warmth and momentum into every interaction. Owners feel safe asking the awkward question.',
    traits: [
      ['Team Spirit Champion','You build a positive room within the first ten seconds of a conversation.'],
      ['Natural Motivator',  'Humor is your superpower — owners leave feeling lifted, not lectured.'],
      ['Relationship Builder','Strong client connections are the foundation of how you practice.'],
      ['Conflict Diffuser',  'You skillfully use humor to de-escalate tension when pushback gets sharp.'],
      ['Enthusiasm Multiplier','Your positive energy inspires owners to follow through on the plan.'],
    ],
    growth: 'Watch for: glossing over real concerns to keep the room warm. Slow down and name the worry out loud.',
  },
  Analyzer: {
    key: 'Analyzer', name: 'Analyzer', tagline: 'Quality first, comfort with details',
    color: 'oklch(0.72 0.14 235)', // blue
    accent: 'oklch(0.55 0.18 245)',
    soft: 'oklch(0.94 0.05 235)',
    wave: 'assets/wave-analyzer.png',
    blurb: 'You ground every recommendation in evidence. Skeptical owners leave convinced because the math is right there.',
    traits: [
      ['Excellence Advocate', 'You prioritize meticulous work and encourage owners to ask the deeper question.'],
      ['Quality Over Speed',  'You\'d rather a 4-minute conversation that lands than a 90-second one that doesn\'t.'],
      ['Constructive Coaching','You give thoughtful feedback focused on solutions, not direct confrontation.'],
      ['Logic Reigns',        'When emotions run high, you bring the conversation back to the data.'],
      ['Empowerment Through Trust','You recognize and empower the owners who match your focus on quality.'],
    ],
    growth: 'Watch for: too much detail, too soon. Lead with the headline; reserve the evidence for when it\'s asked for.',
  },
  Harmonizer: {
    key: 'Harmonizer', name: 'Harmonizer', tagline: 'Building trust for peak care',
    color: 'oklch(0.70 0.18 145)', // green
    accent: 'oklch(0.55 0.18 145)',
    soft: 'oklch(0.94 0.06 145)',
    wave: 'assets/wave-harmonizer.png',
    blurb: 'You meet owners where they are. They feel heard before they feel sold to — which is why they listen.',
    traits: [
      ['Team Advocate',         'You champion the well-being of every pet and owner in front of you.'],
      ['Relationship Builder',  'Your follow-up calls land because the relationship is already real.'],
      ['Fairness Champion',     'You ensure clients feel treated equitably, never pressured into a decision.'],
      ['Motivational Boost',    'By fostering owner self-esteem, you empower them to follow through.'],
      ['Strength in Collaboration','You invite owners into the plan instead of handing it to them.'],
    ],
    growth: 'Watch for: under-pushing when an owner needs a clear, decisive recommendation. Practice the firm ask.',
  },
};

// 15 questions, each with 4 options keyed by driver
const QUIZ = [
  { part: 1, q: 'When a last-minute change is made to a project timeline, how do you typically respond?',
    o: [
      { t: 'Easy going, flexible',                         d: 'Harmonizer' },
      { t: 'Confident, sure of yourself',                  d: 'Activator' },
      { t: 'Careful, wary',                                d: 'Analyzer' },
      { t: 'Persuasive, good at convincing others',        d: 'Energizer' },
    ]},
  { part: 1, q: 'Which trait best describes your approach to a busy Monday morning?',
    o: [
      { t: 'Energetic, full of life',                      d: 'Energizer' },
      { t: 'Determined, focused',                          d: 'Activator' },
      { t: 'Diplomatic, good at saying the right thing',   d: 'Harmonizer' },
      { t: 'Hardworking, dedicated',                       d: 'Analyzer' },
    ]},
  { part: 1, q: 'In a brainstorming session, you tend to be:',
    o: [
      { t: 'Deep thinking, logical',                       d: 'Analyzer' },
      { t: 'Fair, unbiased',                               d: 'Activator' },
      { t: 'Quick to act without thinking, spontaneous',   d: 'Energizer' },
      { t: 'Considerate, reflective',                      d: 'Harmonizer' },
    ]},
  { part: 1, q: 'What is your greatest strength when working in a high-pressure team?',
    o: [
      { t: 'Resolved, persistent',                         d: 'Activator' },
      { t: 'Passionate, excited',                          d: 'Energizer' },
      { t: 'Reliable, consistent',                         d: 'Analyzer' },
      { t: 'Trustworthy, dependable',                      d: 'Harmonizer' },
    ]},
  { part: 1, q: 'How would your colleagues describe your general "vibe"?',
    o: [
      { t: 'Difficult, demanding',                         d: 'Activator' },
      { t: 'Traditional, ordinary',                        d: 'Analyzer' },
      { t: 'Sociable, friendly',                           d: 'Energizer' },
      { t: 'Tolerant, understanding',                      d: 'Harmonizer' },
    ]},
  { part: 2, q: 'When delivering a presentation or update, you are mostly:',
    o: [
      { t: 'Happy, optimistic',                            d: 'Energizer' },
      { t: 'Relaxed, peaceful',                            d: 'Harmonizer' },
      { t: 'Brief, to the point',                          d: 'Analyzer' },
      { t: 'Powerful, strong',                             d: 'Activator' },
    ]},
  { part: 2, q: 'How do you process new information in a meeting?',
    o: [
      { t: 'Based on facts, true',                         d: 'Analyzer' },
      { t: 'Ambitious, motivated',                         d: 'Activator' },
      { t: 'Interesting, captivating',                     d: 'Energizer' },
      { t: 'Responding quickly, impulsive',                d: 'Harmonizer' },
    ]},
  { part: 2, q: 'When helping a co-worker with a problem, you are:',
    o: [
      { t: 'Compassionate, caring',                        d: 'Harmonizer' },
      { t: 'Thorough, precise',                            d: 'Analyzer' },
      { t: 'Driven, enthusiastic',                         d: 'Activator' },
      { t: 'Eager to win, ambitious',                      d: 'Energizer' },
    ]},
  { part: 2, q: 'Which of these is your priority during a group project?',
    o: [
      { t: 'Correct, precise',                             d: 'Analyzer' },
      { t: 'Sure, confident',                              d: 'Activator' },
      { t: 'Hopeful, positive',                            d: 'Energizer' },
      { t: 'Willing to work together, helpful',            d: 'Harmonizer' },
    ]},
  { part: 2, q: 'When you disagree with a peer, you remain:',
    o: [
      { t: 'Agreeable, easy to deal with',                 d: 'Harmonizer' },
      { t: 'Convincing, good at arguing',                  d: 'Energizer' },
      { t: 'Strong, determined',                           d: 'Activator' },
      { t: 'Reasonable, sensible',                         d: 'Analyzer' },
    ]},
  { part: 3, q: 'In a leadership role, you lean toward being:',
    o: [
      { t: 'Controlling, bossy',                           d: 'Activator' },
      { t: 'Powerful, good at influencing others',         d: 'Energizer' },
      { t: 'Skilled at dealing with people, tactful',      d: 'Analyzer' },
      { t: 'Obedient, willing to do what others say',      d: 'Harmonizer' },
    ]},
  { part: 3, q: 'How do you handle a personal setback?',
    o: [
      { t: 'Organised, methodical',                        d: 'Analyzer' },
      { t: 'Determined, stubborn',                         d: 'Activator' },
      { t: 'Optimistic, hopeful',                          d: 'Energizer' },
      { t: 'Easily hurt, emotional',                       d: 'Harmonizer' },
    ]},
  { part: 3, q: 'At a professional networking event, you are:',
    o: [
      { t: 'Comfortable in company, outgoing',             d: 'Energizer' },
      { t: 'Kind, considerate',                            d: 'Harmonizer' },
      { t: 'Brave, fearless',                              d: 'Activator' },
      { t: 'Thoughtful, careful',                          d: 'Analyzer' },
    ]},
  { part: 3, q: 'When finishing a task, your main focus is being:',
    o: [
      { t: 'Someone who wants everything to be perfect',   d: 'Analyzer' },
      { t: 'Practical, sensible',                          d: 'Activator' },
      { t: 'Faithful, supportive',                         d: 'Harmonizer' },
      { t: 'Flexible, able to change',                     d: 'Energizer' },
    ]},
  { part: 3, q: 'If you were to choose one word to describe your work ethic, it would be:',
    o: [
      { t: 'Exact, accurate',                              d: 'Analyzer' },
      { t: 'Brave, adventurous',                           d: 'Activator' },
      { t: 'Kind, welcoming',                              d: 'Harmonizer' },
      { t: 'Enjoyable, entertaining',                      d: 'Energizer' },
    ]},
];

const TIE_BREAKER = {
  q: 'If you had to lead a project tomorrow, which is your absolute priority?',
  o: [
    { t: 'Reaching the goal as fast as possible.',                d: 'Activator' },
    { t: 'Ensuring the team are vibrant and connected.',          d: 'Energizer' },
    { t: 'Making sure every detail is flawless and logical.',     d: 'Analyzer' },
    { t: 'Ensuring the process is stable and everyone is supported.', d: 'Harmonizer' },
  ],
};

const PART_TITLES = {
  1: ['Part 1', 'Workplace dynamics'],
  2: ['Part 2', 'Communication & interaction'],
  3: ['Part 3', 'Personal style & values'],
};

// ───── Animated SVG line that breathes during the quiz ─────
function QuizWave({ progress = 0, dark = false }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf;
    let start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      setT((ts - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 4 driver-tinted sine lines, slightly offset
  const lines = [
    { color: 'oklch(0.62 0.22 22)',  amp: 14, freq: 1.1, speed: 0.8,  phase: 0.0,  width: 1.6, op: 0.85 }, // Activator
    { color: 'oklch(0.70 0.18 70)',  amp: 11, freq: 1.4, speed: 1.05, phase: 1.2,  width: 1.4, op: 0.80 }, // Energizer
    { color: 'oklch(0.62 0.16 245)', amp: 16, freq: 0.9, speed: 0.65, phase: 2.4,  width: 1.4, op: 0.75 }, // Analyzer
    { color: 'oklch(0.60 0.16 145)', amp: 12, freq: 1.25, speed: 0.92, phase: 3.6, width: 1.4, op: 0.78 }, // Harmonizer
  ];

  const W = 380, H = 64;
  const cy = H / 2;
  const samples = 64;

  const buildPath = (line, tt) => {
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * W;
      const phase = (i / samples) * Math.PI * 2 * line.freq + tt * line.speed + line.phase;
      // envelope: a soft bell so the line tapers near the edges
      const env = Math.sin((i / samples) * Math.PI);
      const y = cy + Math.sin(phase) * line.amp * env;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    return d;
  };

  // gentle progress dot drift
  const dotX = 20 + progress * (W - 40);
  const dotY = cy + Math.sin(t * 1.2 + progress * 6) * 6;

  return (
    <div style={{
      position: 'relative', height: 76, marginBottom: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
        style={{ overflow: 'visible' }}>
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={i} id={`qw-fade-${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={l.color} stopOpacity="0"/>
              <stop offset="0.15" stopColor={l.color} stopOpacity={l.op}/>
              <stop offset="0.85" stopColor={l.color} stopOpacity={l.op}/>
              <stop offset="1" stopColor={l.color} stopOpacity="0"/>
            </linearGradient>
          ))}
          <filter id="qw-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="1.4"/>
          </filter>
        </defs>

        {/* glow halo behind the lines */}
        {lines.map((l, i) => (
          <path key={`g-${i}`} d={buildPath(l, t)} fill="none"
            stroke={`url(#qw-fade-${i})`} strokeWidth={l.width * 3}
            strokeLinecap="round" filter="url(#qw-glow)"
            style={{ opacity: 0.45, mixBlendMode: dark ? 'screen' : 'multiply' }}/>
        ))}
        {/* crisp lines */}
        {lines.map((l, i) => (
          <path key={`l-${i}`} d={buildPath(l, t)} fill="none"
            stroke={`url(#qw-fade-${i})`} strokeWidth={l.width}
            strokeLinecap="round"/>
        ))}

        {/* progress dot riding the wave */}
        <g style={{ transition: 'transform 0.4s ease', transform: `translateX(0)` }}>
          <circle cx={dotX} cy={dotY} r="6" fill="oklch(0.55 0.24 18)" opacity="0.18"/>
          <circle cx={dotX} cy={dotY} r="3" fill="oklch(0.55 0.24 18)"/>
          <circle cx={dotX} cy={dotY} r="1.2" fill="#fff"/>
        </g>
      </svg>
    </div>
  );
}

function QuizScreen({ onComplete, onBack, theme = 'light' }) {
  const dark = theme === 'dark';
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]); // array of driver keys
  const [picking, setPicking] = useState(null);
  const [tieBreak, setTieBreak] = useState(false);

  const total = QUIZ.length;
  const cur = tieBreak ? TIE_BREAKER : QUIZ[step];
  const progress = tieBreak ? 1 : step / total;

  const finalize = (allAnswers) => {
    const tally = { Activator: 0, Energizer: 0, Analyzer: 0, Harmonizer: 0 };
    allAnswers.forEach(d => tally[d]++);
    const sorted = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    // tie check: top two equal & no tie-breaker yet → trigger
    if (!tieBreak && tally[sorted[0]] === tally[sorted[1]]) {
      setTieBreak(true);
      return null;
    }
    return { answers: allAnswers, tally, primary: sorted[0], secondary: sorted[1] };
  };

  const choose = (idx) => {
    if (picking !== null) return;
    setPicking(idx);
    setTimeout(() => {
      const driver = cur.o[idx].d;
      const next = [...answers, driver];
      setAnswers(next);
      setPicking(null);
      if (tieBreak || step + 1 >= total) {
        const result = finalize(next);
        if (result) onComplete(result);
      } else {
        setStep(step + 1);
      }
    }, 280);
  };

  const partInfo = !tieBreak ? PART_TITLES[cur.part] : ['Tie-breaker', 'Golden question'];

  return (
    <Page theme={theme} padBottom={32}>
      <TopBar
        theme={theme}
        onBack={step === 0 && !tieBreak ? onBack : () => {
          if (tieBreak) { setTieBreak(false); setAnswers(answers.slice(0, -0)); return; }
          setAnswers(answers.slice(0, -1));
          setStep(Math.max(0, step - 1));
        }}
        title="ECHO Driver Quiz"
        trailing={<span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.50 0.04 20)' }}>{tieBreak ? 'TB' : `${step + 1} / ${total}`}</span>}
      />

      <div style={{ padding: '0 22px' }}>
        {/* Animated SVG line — breathes; shifts with progress */}
        <QuizWave progress={progress} dark={dark}/>

        {/* Progress */}
        <div style={{
          height: 4, borderRadius: 2, marginBottom: 24,
          background: dark ? 'rgba(255,255,255,0.1)' : 'oklch(0.55 0.22 18 / 0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
            borderRadius: 2, transition: 'width 0.3s ease',
          }}/>
        </div>

        {/* Eyebrow */}
        <div style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.55 0.04 20)',
          marginBottom: 8,
        }}>
          {partInfo[0]} · {partInfo[1]}
        </div>

        {/* Question */}
        <h2 key={tieBreak ? 'tb' : step} style={{
          fontFamily: 'var(--pbt-font)',
          fontSize: 26, lineHeight: 1.18,
          fontWeight: 400, margin: 0, marginBottom: 24,
          letterSpacing: '-0.02em',
          color: dark ? '#fff' : 'oklch(0.20 0.04 20)',
          textWrap: 'pretty',
          animation: 'pbtFadeUp 0.4s ease',
        }}>
          {cur.q}
        </h2>

        {/* Options — 4 of them */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cur.o.map((opt, i) => {
            const isPicked = picking === i;
            const isFaded = picking !== null && picking !== i;
            const letter = String.fromCharCode(65 + i);
            return (
              <Glass
                key={`${tieBreak ? 'tb' : step}-${i}`}
                radius={20} blur={28}
                padding={0}
                theme={theme}
                onClick={() => choose(i)}
                style={{
                  transform: isPicked ? 'scale(0.98)' : 'scale(1)',
                  opacity: isFaded ? 0.4 : 1,
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  border: isPicked
                    ? '1px solid oklch(0.62 0.22 22)'
                    : (dark ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid rgba(255,255,255,0.85)'),
                  background: isPicked
                    ? 'linear-gradient(180deg, oklch(0.92 0.06 22 / 0.85), oklch(0.86 0.08 22 / 0.7))'
                    : undefined,
                  animation: `pbtFadeUp 0.4s ease ${i * 50}ms both`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 14, flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Geist Mono, monospace', fontSize: 12, fontWeight: 600,
                    background: isPicked
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                      : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)'),
                    color: isPicked ? '#fff' : (dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.45 0.10 20)'),
                    border: isPicked ? 'none' : (dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid oklch(0.55 0.22 18 / 0.2)'),
                  }}>
                    {letter}
                  </div>
                  <div style={{
                    fontFamily: 'var(--pbt-font)', fontSize: 14.5, lineHeight: 1.4,
                    color: dark ? '#fff' : 'oklch(0.22 0.04 20)',
                    fontWeight: 500, textWrap: 'pretty', flex: 1,
                  }}>
                    {opt.t}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>

        <div style={{
          textAlign: 'center', marginTop: 20,
          fontFamily: 'Geist Mono, monospace', fontSize: 10,
          color: dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.04 20)',
          letterSpacing: '0.14em',
        }}>
          PICK THE ONE THAT FEELS MOST LIKE YOU
        </div>
      </div>
    </Page>
  );
}

Object.assign(window, { ECHO_DRIVERS, QUIZ, TIE_BREAKER, QuizScreen });
