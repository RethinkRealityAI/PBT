// PBT — Scenario chat (text + voice toggle)
function ChatScreen({ scenario, onEnd, onBack, theme = 'light' }) {
  const dark = theme === 'dark';
  const [mode, setMode] = useState('text'); // 'text' | 'voice'
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => [
    { from: 'system', text: scenario?.title || 'Cost objection on a Rx diet' },
    { from: 'ai', text: "Hi — I'm Maria. Listen, I love Bailey, but $98 for a bag of food? That's almost double what I'm paying now. I'm sure your other stuff works fine for a Lab her age." },
  ]);
  const [typing, setTyping] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const send = (txt) => {
    if (!txt.trim()) return;
    setMessages(m => [...m, { from: 'user', text: txt }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, {
        from: 'ai',
        text: m.length === 2
          ? "Okay — that's fair. But honestly, my friend's vet just said any complete and balanced food is fine. So I'm not totally sold on why this one specifically."
          : "I hear you. But what's actually different about this one? Is it just marketing, or…?"
      }]);
    }, 1400);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <TopBar
        theme={theme}
        onBack={onBack}
        title={null}
        trailing={<>
          <button onClick={() => setCoachOpen(true)} style={iconBtn(dark)} title="Coach hints"><Icon.spark/></button>
          <button onClick={onEnd} style={{
            ...iconBtn(dark), width: 'auto', padding: '0 14px', borderRadius: 18,
            fontFamily: 'var(--pbt-font)', fontSize: 12, fontWeight: 600, gap: 6,
          }}>
            End
          </button>
        </>}
      />

      {/* Scenario header */}
      <div style={{ padding: '0 16px 8px' }}>
        <Glass radius={20} blur={28} padding={12} theme={theme}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Orb size={42} pulse={true} intensity={0.9}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 1 }}>
                Maria · Lab owner, 7yr
              </div>
              <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)', textTransform: 'uppercase' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: 'oklch(0.65 0.20 145)', marginRight: 6, transform: 'translateY(-1px)' }}/>
                Live · 02:14
              </div>
            </div>
            {/* Mode toggle */}
            <div style={{
              display: 'flex', padding: 3, borderRadius: 999,
              background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)',
              border: dark ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid rgba(255,255,255,0.85)',
            }}>
              {['text', 'voice'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 999,
                  background: mode === m ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))' : 'transparent',
                  color: mode === m ? '#fff' : (dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)'),
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  {m === 'text' ? <Icon.text/> : <Icon.voice/>}
                </button>
              ))}
            </div>
          </div>
        </Glass>
      </div>

      {/* Chat scroll */}
      {mode === 'text' ? (
        <div ref={scrollRef} className="pbt-scroll" style={{
          flex: 1, overflowY: 'auto', padding: '12px 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {messages.map((m, i) => {
            if (m.from === 'system') return (
              <div key={i} style={{
                alignSelf: 'center', padding: '6px 12px', borderRadius: 999,
                background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.34)',
                border: '0.5px solid rgba(255,255,255,0.85)',
                fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 500,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'oklch(0.55 0.24 18)', backdropFilter: 'blur(16px)',
              }}>SCENARIO · {m.text}</div>
            );
            const isUser = m.from === 'user';
            return (
              <div key={i} style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '78%',
                animation: 'pbtFadeUp 0.3s ease',
              }}>
                <Glass
                  radius={20} blur={isUser ? 24 : 32}
                  tint={isUser ? 0 : (dark ? 0.22 : 0.22)}
                  padding={0} theme={theme}
                  shine={!isUser}
                  style={isUser ? {
                    background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                    border: 'none',
                    boxShadow: '0 4px 12px -2px oklch(0.55 0.22 18 / 0.4), 0 1px 0 rgba(255,255,255,0.4) inset',
                  } : {}}
                >
                  <div style={{
                    padding: '10px 14px',
                    fontFamily: 'var(--pbt-font)', fontSize: 14.5, lineHeight: 1.45,
                    color: isUser ? '#fff' : (dark ? '#fff' : 'oklch(0.20 0.04 20)'),
                    textWrap: 'pretty',
                  }}>
                    {m.text}
                  </div>
                </Glass>
                <div style={{
                  fontFamily: 'Geist Mono, monospace', fontSize: 9, fontWeight: 500,
                  letterSpacing: '0.1em', color: dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.04 20)',
                  marginTop: 4, textAlign: isUser ? 'right' : 'left', padding: '0 4px',
                }}>
                  {isUser ? 'YOU' : 'MARIA'} · {String(i + 1).padStart(2, '0')}:1{i}
                </div>
              </div>
            );
          })}
          {typing && (
            <div style={{ alignSelf: 'flex-start' }}>
              <Glass radius={20} blur={28} padding={0} theme={theme}>
                <div style={{ display: 'flex', gap: 4, padding: '14px 16px' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: 'oklch(0.55 0.24 18)',
                      animation: `pbtTypingDot 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}/>
                  ))}
                </div>
              </Glass>
            </div>
          )}
        </div>
      ) : (
        // Voice mode
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: -20 - i * 14, borderRadius: '50%',
                border: '1.5px solid oklch(0.55 0.24 18 / 0.3)',
                animation: `pbtRingBreath 2.4s ease-in-out ${i * 0.4}s infinite`,
              }}/>
            ))}
            <Orb size={140} intensity={1.4}/>
          </div>
          <div style={{
            fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'oklch(0.55 0.24 18)', marginBottom: 8,
          }}>
            Listening
          </div>
          <div style={{
            fontFamily: 'var(--pbt-font)', fontSize: 22, lineHeight: 1.25,
            textAlign: 'center', maxWidth: 320, margin: 0,
            color: dark ? '#fff' : 'oklch(0.22 0.04 20)', textWrap: 'pretty',
          }}>
            "I'm sure your other stuff<br/>works fine for a Lab her age."
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 24, alignItems: 'flex-end', height: 32 }}>
            {[0.5, 0.8, 1, 0.7, 0.4, 0.6, 0.9, 1, 0.5, 0.3].map((s, i) => (
              <div key={i} style={{
                width: 4, height: 30 * s, borderRadius: 2,
                background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                animation: `pbtBarWave ${0.8 + i * 0.05}s ease-in-out infinite`,
                transformOrigin: 'bottom',
              }}/>
            ))}
          </div>
        </div>
      )}

      {/* Composer / mic */}
      {mode === 'text' ? (
        <div style={{ padding: '8px 16px 18px' }}>
          <Glass radius={26} blur={28} padding={6} theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button style={{
                width: 36, height: 36, borderRadius: 18, border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon.plus/>
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(input)}
                placeholder="Respond to Maria…"
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: 'var(--pbt-font)', fontSize: 15,
                  color: dark ? '#fff' : 'oklch(0.20 0.04 20)',
                  padding: '8px 4px',
                }}
              />
              <button onClick={() => send(input)} style={{
                width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
                background: input.trim()
                  ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                  : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'),
                color: input.trim() ? '#fff' : (dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.04 20)'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: input.trim() ? '0 4px 10px -2px oklch(0.55 0.22 18 / 0.4)' : 'none',
                transition: 'all 0.2s',
              }}>
                <Icon.send/>
              </button>
            </div>
          </Glass>
          {/* Quick chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10, paddingBottom: 2 }} className="pbt-scroll">
            {['Acknowledge cost', 'Reframe value', 'Ask about her day', 'Cite the GI study'].map(q => (
              <button key={q} onClick={() => setInput(q + ' — ')} style={{
                flexShrink: 0, padding: '8px 12px', borderRadius: 999,
                background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)',
                border: '0.5px solid rgba(255,255,255,0.8)',
                fontFamily: 'var(--pbt-font)', fontSize: 12, fontWeight: 500,
                color: 'oklch(0.55 0.24 18)', cursor: 'pointer',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              }}>{q}</button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px 24px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <button style={{
              width: 56, height: 56, borderRadius: 28,
              background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.34)',
              border: '0.5px solid rgba(255,255,255,0.85)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'oklch(0.55 0.24 18)', cursor: 'pointer',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            }}>
              <Icon.close/>
            </button>
            <button style={{
              width: 76, height: 76, borderRadius: 38, border: 'none',
              background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px -4px oklch(0.55 0.22 18 / 0.55), 0 1px 0 rgba(255,255,255,0.4) inset',
              cursor: 'pointer',
            }}>
              <Icon.mic/>
            </button>
            <button style={{
              width: 56, height: 56, borderRadius: 28,
              background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.34)',
              border: '0.5px solid rgba(255,255,255,0.85)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'oklch(0.55 0.24 18)', cursor: 'pointer',
            }}>
              <Icon.spark/>
            </button>
          </div>
        </div>
      )}

      {/* Coach drawer */}
      {coachOpen && (
        <div onClick={() => setCoachOpen(false)} style={{
          position: 'absolute', inset: 0, background: 'rgba(20,8,10,0.35)',
          backdropFilter: 'blur(8px)', zIndex: 20,
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', padding: 16 }}>
            <Glass radius={28} blur={28} tint={0.6} padding={20} theme={theme}>
              <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'oklch(0.55 0.24 18)', marginBottom: 8 }}>
                Coach hints · live
              </div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 22, lineHeight: 1.2, fontWeight: 400, marginBottom: 12, color: 'oklch(0.18 0.04 20)' }}>
                Maria's worry isn't price.<br/>It's that she'll feel duped.
              </div>
              {[
                'Validate the cost difference out loud — don\'t skip past it.',
                'Anchor on Bailey, not the bag.',
                'One specific reason, not a list of three.',
              ].map((t, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 10, padding: '10px 0',
                  borderTop: i ? '0.5px solid oklch(0.55 0.22 18 / 0.15)' : 'none',
                }}>
                  <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'oklch(0.55 0.24 18)', fontWeight: 700 }}>0{i + 1}</div>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, lineHeight: 1.45, color: 'oklch(0.25 0.04 20)' }}>{t}</div>
                </div>
              ))}
            </Glass>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ChatScreen });
