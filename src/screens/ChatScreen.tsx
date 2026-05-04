import { useEffect, useRef, useState, useCallback } from 'react';
import { Glass } from '../design-system/Glass';
import { Orb } from '../design-system/Orb';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { TopBar } from '../shell/TopBar';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useChat } from '../app/providers/ChatProvider';
import { useVoiceSession, type EmotionColor } from '../services/voiceSession';
import type { ScoreReport } from '../services/types';

function useThinkingSound(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) { ctxRef.current?.close(); ctxRef.current = null; return; }
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const play = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.035, startTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.9);
        osc.start(startTime); osc.stop(startTime + 0.95);
      };
      play(330, ctx.currentTime);
      play(392, ctx.currentTime + 0.18);
    } catch {}
    return () => { ctxRef.current?.close(); ctxRef.current = null; };
  }, [active]);
}

export function ChatScreen() {
  const { go } = useNavigation();
  const { scenario } = useScenario();
  const chat = useChat();
  const voice = useVoiceSession();
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<ScoreReport | null>(null);

  useThinkingSound(mode === 'text' && chat.status === 'aiTyping');

  // Open text conversation whenever status returns to idle (mount + after reset)
  const openRef = useRef(chat.open);
  openRef.current = chat.open;
  useEffect(() => {
    if (scenario && chat.status === 'idle') {
      void openRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, chat.status]);

  // Start/stop voice session when mode changes
  useEffect(() => {
    if (!scenario) return;
    if (mode === 'voice' && voice.status === 'idle') {
      void voice.start(scenario);
    }
  }, [mode, scenario, voice]);

  // Auto-advance to stats when voice ends (triggered by AI endSimulation tool)
  useEffect(() => {
    if (voice.status === 'ended' && mode === 'voice') {
      void voice.endSession().then((score) => {
        scoreRef.current = score;
        go('stats');
      });
    }
  }, [voice.status, mode, voice, go]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages.length, chat.status]);

  if (!scenario) {
    return (
      <>
        <TopBar showBack title="Live scenario" />
        <div className="flex flex-1 items-center justify-center px-6">
          <p style={{ color: 'var(--pbt-text-muted)' }}>
            No active scenario. Pick one from Home.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Scenario header */}
      <div className="px-4 pt-[max(env(safe-area-inset-top),14px)] pb-2">
        <Glass radius={22} padding={14}>
          <div className="flex items-center gap-3">
            <Orb size={42} />
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {scenario.persona} owner · {scenario.breed}
              </div>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'oklch(0.55 0.18 145)',
                  }}
                />
                LIVE · {scenario.suggestedDriver}
              </div>
            </div>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              ariaLabel="Mode"
              options={[
                { value: 'text', label: <Icon.chat /> },
                { value: 'voice', label: <Icon.voice /> },
              ]}
            />
            <button
              onClick={() => {
                if (mode === 'voice') {
                  void voice.endSession().then(() => go('stats'));
                } else if (chat.status === 'error' || chat.status === 'idle') {
                  go('home');
                } else {
                  void chat.end().then(() => go('stats')).catch(() => go('stats'));
                }
              }}
              style={{
                marginLeft: 4,
                padding: '6px 12px',
                borderRadius: 9999,
                border: '1px solid oklch(0.55 0.22 18 / 0.3)',
                background: 'transparent',
                color: 'oklch(0.50 0.22 18)',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              End
            </button>
          </div>
        </Glass>
      </div>

      {mode === 'text' ? (
        <>
          {/* Message list */}
          <div
            ref={scrollRef}
            className="pbt-scroll flex-1 overflow-y-auto px-4 pb-4"
          >
            <div
              style={{
                margin: '14px auto',
                maxWidth: 320,
                padding: '6px 14px',
                borderRadius: 9999,
                background:
                  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                color: '#fff',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 700,
                textAlign: 'center',
                width: 'fit-content',
              }}
            >
              Scenario · {scenario.pushback.title}
            </div>

            {/* Error state: retry button */}
            {chat.status === 'error' && (
              <div style={{ padding: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)', marginBottom: 10 }}>
                  {chat.transientError ?? 'Could not connect — check your network.'}
                </div>
                <button
                  onClick={() => { chat.reset(); }}
                  style={{
                    padding: '8px 20px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                    color: '#fff', fontFamily: 'var(--pbt-font-mono)', fontSize: 11,
                    fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            <div className="flex flex-col gap-12" style={{ gap: 10 }}>
              {chat.messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems:
                      m.role === 'user' ? 'flex-end' : 'flex-start',
                    animation: 'pbtFadeUp 0.3s ease',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      padding: '10px 14px',
                      borderRadius: 22,
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      background:
                        m.role === 'user'
                          ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                          : 'rgba(255,255,255,0.55)',
                      color: m.role === 'user' ? '#fff' : 'var(--pbt-text)',
                      backdropFilter:
                        m.role === 'user' ? undefined : 'blur(20px) saturate(180%)',
                      WebkitBackdropFilter:
                        m.role === 'user' ? undefined : 'blur(20px) saturate(180%)',
                      border:
                        m.role === 'user'
                          ? 'none'
                          : '0.5px solid rgba(255,255,255,0.7)',
                      boxShadow:
                        m.role === 'user'
                          ? '0 6px 16px -6px oklch(0.55 0.22 18 / 0.4)'
                          : '0 4px 12px -6px rgba(60,20,15,0.10)',
                    }}
                  >
                    {m.text}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text-muted)',
                      marginTop: 4,
                    }}
                  >
                    {m.role === 'user' ? 'You' : scenario.persona}
                  </div>
                </div>
              ))}
              {chat.status === 'aiTyping' && <TypingIndicator />}
              {chat.status === 'scoring' && (
                <div
                  style={{
                    color: 'var(--pbt-text-muted)',
                    textAlign: 'center',
                    padding: '20px 0',
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  }}
                >
                  Scoring conversation…
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="px-4 pb-[max(env(safe-area-inset-bottom),14px)]">
            <Glass radius={9999} padding={6} blur={28}>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Add"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.55)',
                    border: 'none',
                    color: 'var(--pbt-text)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon.plus />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Acknowledge, ask, recommend…"
                  disabled={chat.status === 'aiTyping' || chat.status === 'scoring' || chat.status === 'complete'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.trim() && chat.status === 'awaitingUser') {
                      const text = draft.trim();
                      setDraft('');
                      void chat.send(text);
                    }
                  }}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 14.5,
                    color: 'var(--pbt-text)',
                  }}
                />
                <button
                  aria-label="Send"
                  disabled={!draft.trim() || chat.status !== 'awaitingUser'}
                  onClick={() => {
                    const text = draft.trim();
                    if (!text) return;
                    setDraft('');
                    void chat.send(text);
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9999,
                    border: 'none',
                    cursor: draft.trim() ? 'pointer' : 'not-allowed',
                    color: '#fff',
                    background: draft.trim()
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                      : 'rgba(60,20,15,0.12)',
                  }}
                >
                  <Icon.send />
                </button>
              </div>
            </Glass>
          </div>
        </>
      ) : (
        <VoiceMode voice={voice} />
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ alignSelf: 'flex-start' }}>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 22,
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.7)',
          display: 'inline-flex',
          gap: 4,
        }}
        aria-label="Customer is typing"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'oklch(0.55 0.22 18)',
              animation: `pbtTypingDot 1.4s ${i * 0.2}s infinite`,
              display: 'inline-block',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const EMOTION_COLORS: Record<EmotionColor, string> = {
  red: 'oklch(0.55 0.22 18)',
  yellow: 'oklch(0.72 0.19 80)',
  green: 'oklch(0.58 0.18 145)',
};

const EMOTION_LABELS: Record<EmotionColor, string> = {
  red: 'Tense',
  yellow: 'Neutral',
  green: 'Open',
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'Initializing…',
  connecting: 'Connecting…',
  listening: 'Listening',
  aiSpeaking: 'Customer speaking…',
  ended: 'Session complete',
  error: 'Connection error',
};

function VoiceMode({ voice }: { voice: ReturnType<typeof useVoiceSession> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const emotionColor = EMOTION_COLORS[voice.emotion];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [voice.messages.length]);

  return (
    <div className="flex flex-1 flex-col items-center px-5 pb-6">
      {/* Tension orb */}
      <div
        className="flex flex-col items-center"
        style={{ paddingTop: 24, marginBottom: 16 }}
      >
        <div
          style={{
            position: 'relative',
            width: 160,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Ambient gradient aura */}
          <div
            style={{
              position: 'absolute',
              inset: -20,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${emotionColor} 28%, transparent), transparent)`,
              transition: 'background 1s ease',
              filter: 'blur(6px)',
            }}
          />
          {/* Expanding radar rings while AI speaking */}
          {voice.status === 'aiSpeaking' && [0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `1.5px solid ${emotionColor}`,
                opacity: 0.5,
                animation: `pbtRingExpand 1.8s ${i * 0.6}s ease-out infinite`,
              }}
            />
          ))}
          {/* Pulsing inner glow */}
          {voice.status === 'aiSpeaking' && (
            <div
              style={{
                position: 'absolute',
                inset: -8,
                borderRadius: '50%',
                background: `radial-gradient(closest-side, color-mix(in oklab, ${emotionColor} 40%, transparent), transparent)`,
                animation: 'pbtPulse 1s ease-in-out infinite',
              }}
            />
          )}
          <Orb size={140} pulse={voice.status === 'aiSpeaking'} intensity={voice.status === 'aiSpeaking' ? 1.4 : 0.8} />
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: emotionColor,
              transition: 'background 0.6s ease',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: emotionColor,
              transition: 'color 0.6s ease',
            }}
          >
            {EMOTION_LABELS[voice.emotion]} · {STATUS_LABELS[voice.status] ?? 'Ready'}
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="pbt-scroll w-full flex-1 overflow-y-auto"
        style={{ marginBottom: 12 }}
      >
        {voice.error && (
          <Glass radius={16} padding={14} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13, color: 'oklch(0.55 0.22 18)', margin: 0 }}>
              {voice.error}
            </p>
          </Glass>
        )}

        {voice.messages.length === 0 && voice.status !== 'error' && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--pbt-text-muted)',
              fontSize: 13,
              paddingTop: 20,
              fontFamily: 'var(--pbt-font-mono)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}
          >
            {voice.status === 'connecting' ? 'Connecting to voice…' : 'Speak to begin'}
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 8 }}>
          {voice.messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  padding: '8px 12px',
                  borderRadius: 18,
                  fontSize: 13.5,
                  lineHeight: 1.4,
                  background:
                    m.role === 'user'
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                      : 'rgba(255,255,255,0.55)',
                  color: m.role === 'user' ? '#fff' : 'var(--pbt-text)',
                  backdropFilter: m.role === 'user' ? undefined : 'blur(20px)',
                  border: m.role === 'user' ? 'none' : '0.5px solid rgba(255,255,255,0.7)',
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mic status indicator */}
      {(voice.status === 'listening' || voice.status === 'aiSpeaking') && (
        <Glass radius={9999} padding={10} style={{ marginBottom: 0 }}>
          <div className="flex items-center gap-3" style={{ paddingLeft: 4, paddingRight: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  voice.status === 'listening'
                    ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                    : 'rgba(60,20,15,0.10)',
                animation: voice.status === 'listening' ? 'pbtPulse 2s ease-in-out infinite' : undefined,
              }}
            >
              <Icon.mic />
            </div>
            <span
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: voice.status === 'listening' ? 'oklch(0.55 0.22 18)' : 'var(--pbt-text-muted)',
              }}
            >
              {voice.status === 'listening' ? 'Mic on · speak now' : 'Customer speaking'}
            </span>
          </div>
        </Glass>
      )}
    </div>
  );
}
