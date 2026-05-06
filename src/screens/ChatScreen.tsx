import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Orb } from '../design-system/Orb';
import { Icon } from '../design-system/Icon';
import { Segmented } from '../design-system/Segmented';
import { DriverWave } from '../design-system/DriverWave';
import { TopBar } from '../shell/TopBar';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useScenario } from '../app/providers/ScenarioProvider';
import { useChat } from '../app/providers/ChatProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import {
  COLORS,
  DRIVER_COLORS,
  type DriverColors,
  type DriverKey,
} from '../design-system/tokens';
import { useVoiceSession, type EmotionColor } from '../services/voiceSession';
import { SEED_SCENARIOS, type Scenario } from '../data/scenarios';

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

function seedScenarioIndex(scenario: Scenario): number {
  return SEED_SCENARIOS.findIndex(
    (seed) =>
      seed === scenario ||
      (seed.breed === scenario.breed &&
        seed.age === scenario.age &&
        seed.persona === scenario.persona &&
        seed.pushback.id === scenario.pushback.id &&
        seed.openingLine === scenario.openingLine),
  );
}

/** Emotion traffic-light colors blended from the learner's ECHO palette — orb / glow only. */
function emotionPalette(dc: DriverColors): Record<EmotionColor, string> {
  return {
    red: dc.primary,
    yellow: `color-mix(in oklab, ${dc.primary} 48%, oklch(0.80 0.15 88) 52%)`,
    green: `color-mix(in oklab, ${dc.primary} 32%, oklch(0.64 0.15 150) 68%)`,
  };
}

/** Dots + emotion label: fixed rubric colors (not driver-tinted). */
const EMOTION_DOT_COLORS: Record<EmotionColor, string> = {
  red: COLORS.score.poor,
  yellow: COLORS.score.ok,
  green: COLORS.score.good,
};

/** Prev / next chevrons — matches Home scenario card (counter between arrows + Scenario label) */
function ScenarioArrowNav({
  onPrev,
  onNext,
  indexDisplay,
  disabled,
}: {
  onPrev: () => void;
  onNext: () => void;
  /** e.g. "3/7" — hidden when not in seed library */
  indexDisplay: string | null;
  disabled?: boolean;
}) {
  const btn = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.48)',
    background: 'rgba(255,255,255,0.22)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    color: 'var(--pbt-text)',
    backdropFilter: 'blur(16px) saturate(200%)',
    WebkitBackdropFilter: 'blur(16px) saturate(200%)',
  };
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
      <span
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
        }}
      >
        Scenario
      </span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous scenario" onClick={onPrev} disabled={disabled} style={btn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {indexDisplay != null && (
          <span
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.10em',
              color: 'var(--pbt-text-muted)',
              minWidth: 30,
              textAlign: 'center',
            }}
          >
            {indexDisplay}
          </span>
        )}
        <button type="button" aria-label="Next scenario" onClick={onNext} disabled={disabled} style={btn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  );
}

/** Slide-up scenario details — auto-opens in voice idle, tap FAB during session */
function ScenarioDetailsPanel({
  scenario,
  open,
  onClose,
  onBegin,
  scenarioIndex,
  scenarioTotal,
}: {
  scenario: Scenario;
  open: boolean;
  onClose: () => void;
  /** Present only in voice idle — shows Begin Simulation */
  onBegin?: () => void;
  /** -1 when scenario is not one of the seed rotations (e.g. custom) */
  scenarioIndex: number;
  scenarioTotal: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Tap-outside scrim — subtle so it doesn't feel heavy on auto-open */}
          <motion.button
            type="button"
            aria-label="Close scenario details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              border: 'none',
              background: 'rgba(20, 12, 14, 0.12)',
              backdropFilter: 'blur(2px)',
              cursor: 'default',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scenario-details-title"
            initial={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.94, x: '-50%', y: '-48%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 41,
              width: 'min(92vw, 580px)',
            }}
          >
            <Glass
              radius={26}
              padding="30px 26px 26px"
              blur={24}
              tint={0.05}
              backdropSaturatePct={130}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2" style={{ marginBottom: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text-muted)',
                      marginBottom: 5,
                    }}
                  >
                    {scenarioIndex >= 0
                      ? `Scenario ${scenarioIndex + 1} of ${scenarioTotal}`
                      : 'Custom scenario'}
                  </div>
                  <h2 id="scenario-details-title" style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                    {scenario.pushback.title}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.50)',
                    background: 'rgba(255,255,255,0.22)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  <Icon.close />
                </button>
              </div>

              {/* Meta chips row */}
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
                {[scenario.breed, scenario.age, scenario.persona].map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 9999,
                      background: 'rgba(255,255,255,0.3)',
                      border: '1px solid rgba(255,255,255,0.45)',
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: 'var(--pbt-text)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Objective — full primary text color (muted was illegible on driver glow in dark mode) */}
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  fontWeight: 600,
                  color: 'var(--pbt-text)',
                }}
              >
                <strong style={{ fontWeight: 800 }}>Objective:</strong>{' '}
                Use ACT — Acknowledge, Clarify, Transform — to guide this client from pushback to resolution.
              </p>

              {/* Context + opening — directly on the glass card (no nested grey panel) */}
              {(scenario.context ?? scenario.pushbackNotes) && (
                <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, fontWeight: 600, color: 'var(--pbt-text)' }}>
                  <strong style={{ fontWeight: 800 }}>Context:</strong>{' '}
                  {scenario.context ?? scenario.pushbackNotes}
                </p>
              )}
              <p
                style={{
                  margin: onBegin ? '0 0 14px' : 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  fontWeight: 600,
                  color: 'var(--pbt-text)',
                }}
              >
                <strong style={{ fontWeight: 800 }}>Opening pushback:</strong>{' '}
                <em style={{ fontWeight: 600, color: 'var(--pbt-text)', fontStyle: 'italic' }}>
                  {scenario.openingLine ?? scenario.pushbackNotes ?? scenario.pushback.example}
                </em>
              </p>

              {/* Scoring metrics — what will be evaluated */}
              {onBegin && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    Scored on
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Empathy & Tone',
                      'Active Listening',
                      'Product Knowledge',
                      'Objection Handling',
                      'Confidence',
                      'Closing',
                      'Pacing',
                    ].map((label) => (
                      <span
                        key={label}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 9999,
                          background: 'rgba(255,255,255,0.18)',
                          border: '1px solid rgba(255,255,255,0.38)',
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--pbt-text-muted)',
                          letterSpacing: '0.01em',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Begin Simulation CTA — only shown in voice idle */}
              {onBegin && (
                <button
                  type="button"
                  onClick={onBegin}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderRadius: 9999,
                    padding: '16px 28px',
                    background: 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                    color: '#fff',
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '0 18px 36px -18px color-mix(in oklab, var(--pbt-driver-primary) 75%, transparent)',
                    marginTop: 4,
                  }}
                >
                  Begin simulation
                </button>
              )}
            </Glass>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ScenarioSessionControls({
  mode,
  onModeChange,
  onEnd,
}: {
  scenario: Scenario;
  mode: 'text' | 'voice';
  onModeChange: (mode: 'text' | 'voice') => void;
  onEnd: () => void;
}) {
  // Show the USER'S locked ECHO driver here — this surface represents the player's
  // identity, not the customer's persona (the customer's driver is implicit in the
  // scenario via scenario.suggestedDriver and surfaces in the AI's behavior).
  const { profile } = useProfile();
  const driverKey = profile?.primary ?? 'Activator';
  return (
    <Glass radius={22} padding="10px 12px" blur={18} tint={0.04}>
      <div className="flex items-center gap-2">
        {/* ECHO driver label + wave — reflects the user's locked driver */}
        <div className="min-w-0 flex-1" style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 8.5,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginBottom: 2,
            }}
          >
            Echo driver · {driverKey}
          </div>
          <div style={{ height: 28, marginLeft: -4, marginRight: 4 }}>
            <DriverWave
              driver={driverKey}
              height={28}
              amplitude={1.1}
              speed={1.4}
              opacity={0.9}
              forceAnimate
            />
          </div>
        </div>
        <Segmented
          value={mode}
          onChange={onModeChange}
          ariaLabel="Mode"
          options={[
            { value: 'text', label: <Icon.chat /> },
            { value: 'voice', label: <Icon.voice /> },
          ]}
        />
        <button
          type="button"
          onClick={onEnd}
          style={{
            padding: '7px 11px',
            borderRadius: 9999,
            border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, transparent)',
            background: 'rgba(255,255,255,0.18)',
            color: 'var(--pbt-driver-primary)',
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          End
        </button>
      </div>
    </Glass>
  );
}

export function ChatScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const driverKey = profile?.primary ?? 'Activator';
  const { scenario, setScenario } = useScenario();
  const chat = useChat();
  const voice = useVoiceSession();
  const [mode, setMode] = useState<'text' | 'voice'>('voice');
  const [draft, setDraft] = useState('');
  const [voiceAnalyzing, setVoiceAnalyzing] = useState(false);
  const [voiceAnalysisError, setVoiceAnalysisError] = useState<string | null>(null);
  // Open by default in voice mode so Begin Simulation lives inside the panel
  const [scenarioDetailsOpen, setScenarioDetailsOpen] = useState(mode === 'voice');
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const voiceEndRef = useRef(voice.endSession);
  voiceEndRef.current = voice.endSession;
  const voiceStartRef = useRef(voice.start);
  voiceStartRef.current = voice.start;
  const voiceStopRef = useRef(voice.stop);
  voiceStopRef.current = voice.stop;
  const voiceFinalizeBusyRef = useRef(false);
  const scenarioIndex = scenario ? seedScenarioIndex(scenario) : -1;
  const scenarioCounterIndex = scenarioIndex >= 0 ? scenarioIndex : undefined;

  const finalizeVoice = useCallback(async () => {
    if (voiceFinalizeBusyRef.current) return;
    voiceFinalizeBusyRef.current = true;
    setVoiceAnalyzing(true);
    setVoiceAnalysisError(null);
    try {
      const { report, transcript } = await voiceEndRef.current();
      await chatRef.current.applyVoiceSessionComplete(report, transcript);
      go('stats');
    } catch (err) {
      console.error('[ChatScreen] finalizeVoice error', err);
      setVoiceAnalysisError('Failed to analyze session — check your network and try again.');
      voiceFinalizeBusyRef.current = false;
      setVoiceAnalyzing(false);
    }
  }, [go]);

  const beginVoice = useCallback(() => {
    if (!scenario) return;
    voiceFinalizeBusyRef.current = false;
    setVoiceAnalyzing(false);
    setVoiceAnalysisError(null);
    setScenarioDetailsOpen(false);
    void voiceStartRef.current(scenario);
  }, [scenario]);

  const cycleScenario = useCallback(
    (delta: number) => {
      const currentIndex = scenario ? seedScenarioIndex(scenario) : -1;
      if (currentIndex < 0) return;
      const n = SEED_SCENARIOS.length;
      const nextScenario = SEED_SCENARIOS[(currentIndex + delta + n) % n];
      voiceStopRef.current();
      chatRef.current.reset();
      voiceFinalizeBusyRef.current = false;
      setVoiceAnalyzing(false);
      setVoiceAnalysisError(null);
      setScenario(nextScenario);
      // Re-open the details panel so Begin Simulation is available for the new scenario
      if (mode === 'voice') setScenarioDetailsOpen(true);
    },
    [mode, scenario, setScenario],
  );

  const handleModeChange = useCallback((nextMode: 'text' | 'voice') => {
    if (nextMode === 'text') {
      voiceStopRef.current();
    }
    setMode(nextMode);
  }, []);

  const handleVoiceEnd = useCallback(() => {
    if (voice.messages.length === 0 && (voice.status === 'idle' || voice.status === 'error')) {
      voiceStopRef.current();
      go('home');
      return;
    }
    void finalizeVoice();
  }, [finalizeVoice, go, voice.messages.length, voice.status]);

  useThinkingSound(
    (mode === 'text' && chat.status === 'aiTyping') ||
      (mode === 'voice' && voice.status === 'thinking'),
  );

  useEffect(() => {
    if (mode !== 'voice') {
      voice.registerNaturalEndHandler(null);
      return;
    }
    voice.registerNaturalEndHandler(() => {
      void finalizeVoice();
    });
    return () => voice.registerNaturalEndHandler(null);
  }, [mode, voice, finalizeVoice]);

  // Open text conversation whenever text mode enters idle (mount + after reset).
  // Voice mode stays visually ready until the user taps Begin simulation.
  const openRef = useRef(chat.open);
  openRef.current = chat.open;
  useEffect(() => {
    if (mode === 'text' && scenario && chat.status === 'idle') {
      void openRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scenario, chat.status]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col lg:max-w-4xl lg:mx-auto lg:w-full">
      {/* ── Header ── */}
      <div
        className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 lg:pt-8"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {/* Row 1: back button + eyebrow */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Back to dashboard"
            onClick={() => go('home')}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.48)',
              background: 'rgba(255,255,255,0.22)',
              color: 'var(--pbt-text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(18px) saturate(200%)',
              WebkitBackdropFilter: 'blur(18px) saturate(200%)',
              flexShrink: 0,
            }}
          >
            <Icon.back />
          </button>
          <div
            style={{
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9.5,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
            }}
          >
            PBT · {mode === 'voice' ? 'Voice practice' : 'Text practice'}
          </div>
        </div>

        {/* Row 2: scenario title */}
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'var(--pbt-text)',
            letterSpacing: '-0.025em',
            wordBreak: 'break-word',
          }}
        >
          {scenario.pushback.title}
        </h1>

        {/* Row 3: scenario nav arrows */}
        <ScenarioArrowNav
          onPrev={() => cycleScenario(-1)}
          onNext={() => cycleScenario(1)}
          indexDisplay={
            scenarioCounterIndex !== undefined
              ? `${scenarioCounterIndex + 1}/${SEED_SCENARIOS.length}`
              : null
          }
          disabled={scenarioIndex < 0}
        />
      </div>

      {mode === 'text' ? (
        <>
          {/* Message list */}
          <div
            ref={scrollRef}
            className="pbt-scroll flex-1 overflow-y-auto px-4 pb-4"
          >
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
                    background: 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
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
                          ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                          : 'rgba(255,255,255,0.42)',
                      color: m.role === 'user' ? '#fff' : 'var(--pbt-text)',
                      backdropFilter:
                        m.role === 'user' ? undefined : 'blur(22px) saturate(260%) brightness(1.03)',
                      WebkitBackdropFilter:
                        m.role === 'user' ? undefined : 'blur(22px) saturate(260%) brightness(1.03)',
                      border:
                        m.role === 'user'
                          ? 'none'
                          : '1px solid rgba(255,255,255,0.65)',
                      boxShadow:
                        m.role === 'user'
                          ? '0 6px 16px -6px color-mix(in oklab, var(--pbt-driver-primary) 40%, transparent)'
                          : '0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px -6px rgba(60,20,15,0.08)',
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

        </>
      ) : (
        <>
          <VoiceMode
            voice={voice}
            isAnalyzing={voiceAnalyzing}
            analysisError={voiceAnalysisError}
            onBegin={beginVoice}
            onRetry={voiceAnalysisError ? finalizeVoice : beginVoice}
            driverKey={driverKey}
          />
        </>
      )}
      <div
        className="px-4 pb-[max(env(safe-area-inset-bottom),14px)]"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <ScenarioDetailsPanel
          scenario={scenario}
          open={scenarioDetailsOpen}
          onClose={() => setScenarioDetailsOpen(false)}
          onBegin={mode === 'voice' && voice.status === 'idle' ? beginVoice : undefined}
          scenarioIndex={scenarioIndex}
          scenarioTotal={SEED_SCENARIOS.length}
        />
        <div style={{ position: 'relative' }}>
          <Glass
            radius={9999}
            padding="0 12px 0 10px"
            blur={18}
            tint={0.05}
            onClick={() => setScenarioDetailsOpen(true)}
            ariaLabel="Scenario info"
            className="absolute z-[2] flex cursor-pointer items-center gap-2"
            style={{
              right: 0,
              bottom: '100%',
              marginBottom: 10,
              height: 36,
            }}
          >
            <Icon.info style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 600,
                color: 'var(--pbt-text)',
                whiteSpace: 'nowrap',
              }}
            >
              Scenario info
            </span>
          </Glass>
          <ScenarioSessionControls
            scenario={scenario}
            mode={mode}
            onModeChange={handleModeChange}
            onEnd={
              mode === 'voice'
                ? handleVoiceEnd
                : () => {
                    if (chat.status === 'error' || chat.status === 'idle') {
                      go('home');
                    } else {
                      void chat.end().then(() => go('stats')).catch(() => go('stats'));
                    }
                  }
            }
          />
        </div>
        {mode === 'text' && (
          <Glass radius={9999} padding={6} blur={18} tint={0.04}>
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
                    ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                    : 'rgba(60,20,15,0.12)',
                }}
              >
                <Icon.send />
              </button>
            </div>
          </Glass>
        )}
      </div>
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
          background: 'rgba(255,255,255,0.42)',
          backdropFilter: 'blur(22px) saturate(260%) brightness(1.03)',
          WebkitBackdropFilter: 'blur(22px) saturate(260%) brightness(1.03)',
          border: '1px solid rgba(255,255,255,0.65)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 12px -6px rgba(60,20,15,0.08)',
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
              background: 'color-mix(in oklab, var(--pbt-driver-primary) 72%, oklch(0.48 0.06 25))',
              animation: `pbtTypingDot 1.4s ${i * 0.2}s infinite`,
              display: 'inline-block',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const EMOTION_LABELS: Record<EmotionColor, string> = {
  red: 'Defensive',
  yellow: 'Receptive',
  green: 'Convinced',
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'Initializing…',
  connecting: 'Connecting…',
  listening: 'Go ahead — I\'m listening',
  thinking: 'Processing…',
  aiSpeaking: 'Speaking…',
  ended: 'Session complete',
  error: 'Connection error',
};

function VoiceMode({
  voice,
  isAnalyzing,
  analysisError,
  onBegin,
  onRetry,
  driverKey,
}: {
  voice: ReturnType<typeof useVoiceSession>;
  isAnalyzing: boolean;
  analysisError: string | null;
  onBegin: () => void;
  onRetry?: () => void;
  driverKey: DriverKey;
}) {
  const dc = DRIVER_COLORS[driverKey];
  const emotionColors = emotionPalette(dc);
  const emotionColor = emotionColors[voice.emotion];
  const isThinking = voice.status === 'thinking';
  const isReady = voice.status === 'idle';
  const isConnecting = voice.status === 'connecting';
  const hasStartError = voice.status === 'error' && !!voice.error;

  // Big transcript display:
  // - AI line: render ONLY `voice.liveAiText`. The voice session keeps it blank while
  //   the AI is speaking and fills it (full, sanitized) at turnComplete. We do NOT fall
  //   back to the last committed message — that would re-show the previous turn's text
  //   during the next turn's speech, defeating the "blank while speaking" rule.
  // - User line: last committed user message (input transcription is sentence-level).
  const userMessages = voice.messages.filter((m) => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1];
  const aiDisplayText = voice.liveAiText;

  const orbSize = 'min(44vw, 168px)';

  return (
    <div
      className="flex flex-1 flex-col items-center"
      style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 12, minHeight: 0 }}
    >
      {/* Orb section — status label + orb + emotion dots */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          paddingBottom: 8,
          width: '100%',
        }}
      >

      {/* Status label */}
      <div
        style={{
          marginBottom: 20,
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: isThinking
            ? `color-mix(in oklab, ${dc.primary} 24%, oklch(0.52 0.10 240))`
            : 'var(--pbt-text-muted)',
          textAlign: 'center',
          minHeight: 18,
          transition: 'color 0.4s ease',
        }}
      >
        {isConnecting
          ? 'Connecting…'
          : isReady
          ? 'Voice ready'
          : isAnalyzing
          ? 'Analyzing session…'
          : STATUS_LABELS[voice.status] ?? ''}
      </div>

      {/* Orb — large, centered */}
      <div
        style={{
          position: 'relative',
          width: orbSize,
          height: orbSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* Ambient gradient aura */}
        <div
          style={{
            position: 'absolute',
            inset: '-15%',
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${emotionColor} 25%, transparent), transparent)`,
            transition: 'background 1.2s ease',
            filter: 'blur(10px)',
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
              opacity: 0.45,
              animation: `pbtRingExpand 1.8s ${i * 0.6}s ease-out infinite`,
            }}
          />
        ))}
        {/* Pulsing inner glow while AI speaking */}
        {voice.status === 'aiSpeaking' && (
          <div
            style={{
              position: 'absolute',
              inset: '-5%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${emotionColor} 38%, transparent), transparent)`,
              animation: 'pbtPulse 1s ease-in-out infinite',
            }}
          />
        )}
        {/* Slow gentle pulse while thinking */}
        {isThinking && (
          <div
            style={{
              position: 'absolute',
              inset: '-8%',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, color-mix(in oklab, ${dc.primary} 35%, oklch(0.62 0.08 240)) 22%, transparent)`,
              animation: 'pbtPulse 1.6s ease-in-out infinite',
            }}
          />
        )}
        <motion.div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          animate={
            voice.status === 'aiSpeaking'
              ? {
                  scale: [1, 1.07, 1],
                  filter: [
                    `drop-shadow(0 0 20px ${emotionColor})`,
                    `drop-shadow(0 0 40px ${emotionColor})`,
                    `drop-shadow(0 0 20px ${emotionColor})`,
                  ],
                }
              : {
                  scale: [1, 1.035, 1],
                  filter: [
                    `drop-shadow(0 0 10px color-mix(in oklab, ${emotionColor} 55%, transparent))`,
                    `drop-shadow(0 0 20px color-mix(in oklab, ${emotionColor} 80%, transparent))`,
                    `drop-shadow(0 0 10px color-mix(in oklab, ${emotionColor} 55%, transparent))`,
                  ],
                }
          }
          transition={{
            duration: voice.status === 'aiSpeaking' ? 1.2 : 2.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Orb
            driver={driverKey}
            size={168}
            pulse={voice.status === 'aiSpeaking' || isThinking}
            intensity={voice.status === 'aiSpeaking' ? 1.5 : isThinking ? 0.65 : 0.9}
          />
        </motion.div>
      </div>

      {/* Three traffic-light dots + emotion label */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        {(['red', 'yellow', 'green'] as EmotionColor[]).map((e) => (
          <div
            key={e}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background:
                !isThinking && voice.emotion === e
                  ? EMOTION_DOT_COLORS[e]
                  : 'color-mix(in oklab, var(--pbt-text-muted) 40%, transparent)',
              boxShadow:
                !isThinking && voice.emotion === e
                  ? `0 0 8px 2px ${EMOTION_DOT_COLORS[e]}`
                  : 'none',
              transition: 'all 0.55s ease',
              flexShrink: 0,
            }}
          />
        ))}
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: isThinking
              ? `color-mix(in oklab, ${dc.primary} 24%, oklch(0.52 0.10 240))`
              : EMOTION_DOT_COLORS[voice.emotion],
            transition: 'color 0.6s ease',
            marginLeft: 3,
          }}
        >
          {isThinking ? 'Processing' : EMOTION_LABELS[voice.emotion]}
        </span>
      </div>

      {/* Error states */}
      {(voice.error || analysisError) && (
        <div style={{ width: '100%', marginTop: 16 }}>
          <Glass radius={16} padding={14}>
            <p
              style={{
                fontSize: 13,
                color: 'color-mix(in oklab, var(--pbt-driver-accent) 85%, oklch(0.35 0.08 25))',
                margin: 0,
                marginBottom: onRetry ? 10 : 0,
              }}
            >
              {voice.error ?? analysisError}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                style={{
                  padding: '6px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                  background:
                    'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                  color: '#fff', fontFamily: 'var(--pbt-font-mono)', fontSize: 11,
                  fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                  boxShadow:
                    '0 4px 12px -4px color-mix(in oklab, var(--pbt-driver-primary) 45%, transparent)',
                }}
              >
                {hasStartError ? 'Try voice again' : 'Try again'}
              </button>
            )}
          </Glass>
        </div>
      )}

      </div>

      {/* Transcript — below orb, centered */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          paddingTop: 8,
          paddingBottom: 16,
          overflow: 'hidden',
          minHeight: 0,
          gap: 8,
        }}
      >
        {aiDisplayText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              textAlign: 'center',
              fontSize: 'clamp(17.9px, 4.14vw, 22.1px)',
              fontWeight: 400,
              lineHeight: 1.4,
              color: 'var(--pbt-text)',
              letterSpacing: '-0.005em',
              maxWidth: 360,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {aiDisplayText}
          </motion.div>
        )}
        {lastUserMsg && (
          <AnimatePresence mode="wait">
            <motion.div
              key={lastUserMsg.timestamp}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.55, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{
                textAlign: 'center',
                fontSize: 'clamp(12px, 3vw, 14px)',
                fontWeight: 400,
                lineHeight: 1.45,
                color: 'var(--pbt-text-muted)',
                maxWidth: 320,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              You: {lastUserMsg.text}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

    </div>
  );
}
