import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
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
import { useTheme } from '../app/providers/ThemeProvider';
import { useVoiceSession, type EmotionColor } from '../services/voiceSession';
import { LIBRARY_SCENARIOS, type Scenario } from '../data/scenarios';
import { SessionEndingOverlay } from '../features/chat/SessionEndingOverlay';
import { ScenarioHints } from '../features/scenarios/ScenarioHints';

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
  return LIBRARY_SCENARIOS.findIndex(
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

/** AI message bubble — state border + label vocabulary used in text mode. */
const AI_STATE_COLOR: Record<EmotionColor, string> = {
  red: COLORS.score.poor,
  yellow: COLORS.score.ok,
  green: COLORS.score.good,
};
const AI_STATE_LABEL: Record<EmotionColor, string> = {
  red: 'Defensive',
  yellow: 'Receptive',
  green: 'Convinced',
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
              // Cap to viewport with edge padding (24px each side incl.
              // safe-area inset). The flex layout below splits a
              // scrollable body from a sticky Begin Simulation footer
              // so the CTA never disappears below the fold.
              maxHeight:
                'calc(100dvh - max(env(safe-area-inset-top), 24px) - max(env(safe-area-inset-bottom), 24px))',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: 26,
              // Glass-card chrome inlined here so the body / footer
              // split is the actual flex container — Glass wraps its
              // children in an extra non-flex `<div>`, which would
              // collapse the column. Tokens come from the same source
              // as `<Glass blur={24} tint={0.05} backdropSaturatePct={130}>`.
              border: '1px solid var(--pbt-glass-border)',
              boxShadow: 'var(--pbt-shadow-glass)',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(22px) saturate(130%) brightness(1.02)',
              WebkitBackdropFilter: 'blur(22px) saturate(130%) brightness(1.02)',
            }}
          >
            <div
              className="pbt-scroll"
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: onBegin ? '22px 22px 12px' : '22px 22px 20px',
              }}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2" style={{ marginBottom: 10 }}>
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
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
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

              {/* Objective + context + opening — collapsed into one
                  compact block. The full 7-dimension rubric isn't shown
                  here (the rubric-hints below are more actionable, and
                  the scorecard surfaces the dimensions after the run). */}
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 600,
                  color: 'var(--pbt-text)',
                }}
              >
                <strong style={{ fontWeight: 800 }}>Objective:</strong>{' '}
                Guide this client from pushback to resolution with ACT.
              </p>

              {(scenario.context ?? scenario.pushbackNotes) && (
                <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: 'var(--pbt-text)' }}>
                  <strong style={{ fontWeight: 800 }}>Context:</strong>{' '}
                  {scenario.context ?? scenario.pushbackNotes}
                </p>
              )}
              <p
                style={{
                  margin: onBegin ? '0 0 12px' : 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontWeight: 600,
                  color: 'var(--pbt-text)',
                }}
              >
                <strong style={{ fontWeight: 800 }}>Opening pushback:</strong>{' '}
                <em style={{ fontWeight: 600, color: 'var(--pbt-text)', fontStyle: 'italic' }}>
                  {scenario.openingLine ?? scenario.pushbackNotes ?? scenario.pushback.example}
                </em>
              </p>

              {/* Scoring metrics pill row removed — rubric hints below
                  cover what to do, and the full dimension list re-
                  appears on the scorecard after the run. Saved ~80px
                  of modal height to keep the Begin CTA in view on
                  shorter viewports without scrolling. */}

              {/* Coaching hints — what the AI customer + scorer are
                  listening for. Surfaces ACT pattern signals from the
                  pushback taxonomy without spelling out scripted lines.
                  Shown whether the panel was opened pre-session (with
                  the Begin button) or mid-session via the "Scenario
                  info" link, so trainees can re-check what earns
                  credit. Custom-built scenarios with no taxonomy entry
                  fall back silently. */}
              <ScenarioHints scenario={scenario} />
              </div>

              {/* Sticky footer — Begin Simulation CTA stays anchored
                  below the scrollable body so it can't slide off the
                  bottom of the viewport when content overflows. */}
              {onBegin && (
                <div
                  style={{
                    flex: 'none',
                    padding: '14px 22px max(env(safe-area-inset-bottom), 18px)',
                    borderTop: '1px solid rgba(255,255,255,0.4)',
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.18))',
                  }}
                >
                  <button
                    type="button"
                    onClick={onBegin}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderRadius: 9999,
                      padding: '16px 28px',
                      background:
                        'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                      color: '#fff',
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      boxShadow:
                        '0 18px 36px -18px color-mix(in oklab, var(--pbt-driver-primary) 75%, transparent)',
                    }}
                  >
                    Begin simulation
                  </button>
                </div>
              )}
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

/** Matches Home scenario card scoring info — round glass + Icon.info 18px */
function scenarioLibraryInfoButtonStyle(dc: DriverColors, dark: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: dc.primary,
    flexShrink: 0,
    border: `1px solid color-mix(in oklab, ${dc.primary} 42%, rgba(255,255,255,0.5))`,
    background: dark ? 'rgba(10,10,14,0.22)' : 'rgba(255,255,255,0.16)',
    backdropFilter: 'blur(12px) saturate(240%)',
    WebkitBackdropFilter: 'blur(12px) saturate(240%)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.58)',
      'inset 0 -1px 0 rgba(0,0,0,0.05)',
      dark
        ? '0 6px 14px -5px rgba(0,0,0,0.44)'
        : '0 8px 16px -10px rgba(15,14,20,0.12), 0 1px 4px rgba(15,14,20,0.04)',
    ].join(', '),
  };
}

/**
 * Multi-line auto-grow chat composer.
 *
 * Replaces a single-line `<input>` whose text scrolled horizontally and got
 * clipped past the visible width — making it impossible to review what
 * you've typed on mobile.
 *
 * Behaviour:
 *   - Wraps to new lines naturally as the textarea fills.
 *   - Auto-grows up to ~5 lines tall, then becomes scrollable so it never
 *     pushes the AI message off-screen.
 *   - Enter sends, Shift+Enter inserts a newline (matches ChatGPT, Slack,
 *     Discord). Mobile users tap the Send button.
 *   - Font-size 16 to suppress iOS Safari's auto-zoom on focus.
 */
interface ChatComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSend: (trimmed: string) => void;
  disabled: boolean;
  canSend: boolean;
  /** Notify the parent when the textarea height changes so it can
   *  re-pin the message list to the latest AI turn. */
  onResize?: () => void;
}

const COMPOSER_MAX_HEIGHT = 80; // ~3 lines at 16px line-height ~24 — keeps the AI's latest message visible while typing

function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  canSend,
  onResize,
}: ChatComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: reset to auto, then snap to scrollHeight (capped). Re-runs
  // every keystroke so the textarea hugs its content exactly.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    // Tell the parent the layout shifted so it can re-pin the message
    // list to the latest AI turn.
    onResize?.();
  }, [value, onResize]);

  const trimmed = value.trim();
  const sendable = trimmed.length > 0 && canSend && !disabled;

  function trySend() {
    if (!sendable) return;
    onSend(trimmed);
  }

  return (
    <Glass radius={28} padding={6} blur={18} tint={0.04}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          paddingLeft: 6,
          paddingRight: 2,
        }}
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Acknowledge, ask, recommend…"
          rows={1}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              trySend();
            }
          }}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            // 16px prevents iOS Safari focus zoom; matches body text.
            fontSize: 16,
            lineHeight: 1.45,
            color: 'var(--pbt-text)',
            resize: 'none',
            padding: '8px 4px',
            minHeight: 24,
            maxHeight: COMPOSER_MAX_HEIGHT,
            overflowY: 'auto',
            // Wrap long words (URLs, etc) instead of forcing horizontal scroll.
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        />
        <button
          aria-label="Send"
          type="button"
          disabled={!sendable}
          onClick={trySend}
          style={{
            width: 38,
            height: 38,
            borderRadius: 9999,
            border: 'none',
            cursor: sendable ? 'pointer' : 'not-allowed',
            color: '#fff',
            // Always driver-tinted; just dim the disabled state instead
            // of swapping to a neutral grey, so the affordance stays
            // visually consistent with the rest of the chrome.
            background:
              'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            opacity: sendable ? 1 : 0.42,
            flexShrink: 0,
            // Match the textarea's bottom padding (8px) so the icon's
            // optical center sits on the same baseline as the typed text.
            alignSelf: 'flex-end',
            marginBottom: 4,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.15s ease',
          }}
        >
          <Icon.send />
        </button>
      </div>
    </Glass>
  );
}

export function ChatScreen() {
  const { go } = useNavigation();
  const { profile } = useProfile();
  const { resolvedTheme } = useTheme();
  const darkChrome = resolvedTheme === 'dark';
  const driverKey = profile?.primary ?? 'Activator';
  const driverColors = DRIVER_COLORS[driverKey];
  const { scenario, setScenario } = useScenario();
  const chat = useChat();
  const voice = useVoiceSession();
  const [mode, setMode] = useState<'text' | 'voice'>('voice');
  const [draft, setDraft] = useState('');
  const [voiceAnalyzing, setVoiceAnalyzing] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceAnalysisError, setVoiceAnalysisError] = useState<string | null>(null);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);
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
  // voiceStatusRef avoids stale-status reads inside event handlers that
  // depend only on the user's click (e.g. mode toggle re-initializing
  // the live session).
  const voiceStatusRef = useRef(voice.status);
  voiceStatusRef.current = voice.status;
  const voiceFinalizeBusyRef = useRef(false);
  // Mode + finalize-generation refs: lets in-flight `finalizeVoice` bail
  // if the user toggled to text mid-scoring instead of stomping on the
  // now-active text session with a stale `applyVoiceSessionComplete`.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const finalizeGenRef = useRef(0);
  const scenarioIndex = scenario ? seedScenarioIndex(scenario) : -1;
  const scenarioCounterIndex = scenarioIndex >= 0 ? scenarioIndex : undefined;

  // Count of user turns committed to the session — gates the back-button
  // confirm modal (only shown once the user has actually engaged).
  const userTurns = chat.messages.filter((m) => m.role === 'user' && !m._transientError).length;

  const handleBackPress = useCallback(() => {
    // 0–1 user turns: not a meaningful session yet, leave silently. The
    // existing ChatAbandonWatcher will still emit a training_sessions row
    // for admin telemetry if there's any in-flight state.
    if (userTurns < 2 || chat.status === 'idle' || chat.status === 'complete' || chat.status === 'error') {
      go('home');
      return;
    }
    setExitModalOpen(true);
  }, [userTurns, chat.status, go]);

  const finalizeVoice = useCallback(async () => {
    if (voiceFinalizeBusyRef.current) return;
    voiceFinalizeBusyRef.current = true;
    // Capture the toggle generation so a mode flip mid-scoring abandons
    // this finalize cleanly rather than overwriting the new text session.
    const gen = ++finalizeGenRef.current;
    setVoiceAnalyzing(true);
    setVoiceAnalysisError(null);
    try {
      const { report, transcript } = await voiceEndRef.current();
      if (gen !== finalizeGenRef.current || modeRef.current !== 'voice') {
        // User toggled away (or another finalize already started). The
        // voice session has already been ended/torn down by the toggle
        // path; just drop these results so the live text session isn't
        // overwritten by a stale `applyVoiceSessionComplete`.
        setVoiceAnalyzing(false);
        return;
      }
      await chatRef.current.applyVoiceSessionComplete(report, transcript);
      if (gen !== finalizeGenRef.current || modeRef.current !== 'voice') {
        setVoiceAnalyzing(false);
        return;
      }
      // Brief "ready" beat between scoring and navigating to stats so
      // the trainee sees the completion state, not a sudden cut.
      setVoiceAnalyzing(false);
      setVoiceReady(true);
      window.setTimeout(() => {
        if (gen !== finalizeGenRef.current || modeRef.current !== 'voice') return;
        setVoiceReady(false);
        go('stats');
      }, 700);
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
      const n = LIBRARY_SCENARIOS.length;
      const nextScenario = LIBRARY_SCENARIOS[(currentIndex + delta + n) % n];
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
    // Invalidate any in-flight finalizeVoice so a slow scoring call
    // can't stomp on the new mode after the toggle.
    finalizeGenRef.current += 1;
    voiceFinalizeBusyRef.current = false;
    setVoiceAnalyzing(false);
    setVoiceReady(false);
    if (nextMode === 'text') {
      voiceStopRef.current();
      // A voice session that already finalized left chat.status === 'complete'
      // on the shared ChatProvider. Without resetting, the moment we flip
      // mode to 'text' the SessionEndingOverlay shows ("Your scorecard is
      // ready") AND the auto-navigate-to-stats effect fires, trapping the
      // user. Reset gives text mode a clean slate, and the auto-open
      // effect will spin up a fresh AI opener for the same scenario.
      chatRef.current.reset();
      setMode(nextMode);
      return;
    }
    // text → voice. Mark any in-flight text session as abandoned so the
    // admin row + recordId close out cleanly (idempotent — a no-op if
    // the user hadn't engaged yet, or if end()/abandon() already fired).
    // Then reset the chat hook so a stale Gemini reply that resolves
    // after the toggle can't pollute the voice transcript.
    void chatRef.current.abandon('user_exit');
    chatRef.current.reset();
    setMode(nextMode);
    setScenarioDetailsOpen(false);
    // The mode-toggle click is itself a user gesture, so we can safely
    // re-init the AudioContext + WebSocket here without an extra Begin
    // tap. Only fire if voice is fully idle — guards against a stray
    // double-toggle restarting an already-live session.
    if (scenario && voiceStatusRef.current === 'idle') {
      voiceFinalizeBusyRef.current = false;
      setVoiceAnalyzing(false);
      setVoiceAnalysisError(null);
      void voiceStartRef.current(scenario);
    }
  }, [scenario]);

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

  // Pin the message list to the bottom — used on new messages AND when
  // the composer grows during typing so the AI's latest turn stays in
  // view instead of getting pushed off the top.
  const pinScrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    pinScrollToBottom();
  }, [chat.messages.length, chat.status, pinScrollToBottom]);

  // Auto-navigate to scorecard once scoring completes. The ending overlay
  // covers the visual transition; the small extra delay lets it linger on
  // "Your scorecard is ready" before the route swap.
  useEffect(() => {
    if (mode !== 'text') return;
    if (chat.status !== 'complete') return;
    const t = window.setTimeout(() => go('stats'), 650);
    return () => window.clearTimeout(t);
  }, [chat.status, mode, go]);

  // Overlay phase mapping. Note: we deliberately DO NOT show the overlay
  // during `ending` (status set the moment the AI emits its closing
  // line). Letting the closing message land in the chat bubble first —
  // visible to the trainee — and only covering with the analyzing
  // overlay once the scorer call actually starts ('scoring') prevents
  // the user from missing the AI's wrap-up.
  const endingPhase: 'analyzing' | 'ready' =
    chat.status === 'scoring' ? 'analyzing' : 'ready';
  const showEndingOverlay =
    mode === 'text' &&
    (chat.status === 'scoring' || chat.status === 'complete');

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
    <>
    <div className="flex h-full min-h-0 flex-1 flex-col lg:max-w-4xl lg:mx-auto lg:w-full">
      <SessionEndingOverlay
        open={showEndingOverlay}
        phase={endingPhase}
        driver={driverKey}
        scenarioTitle={scenario.pushback.title}
      />
      {/* ── Header ── */}
      <div
        className="px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 lg:pt-8"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {/* Row 1: back button + eyebrow */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Back to dashboard"
            onClick={handleBackPress}
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
              ? `${scenarioCounterIndex + 1}/${LIBRARY_SCENARIOS.length}`
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
              {chat.messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
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
                            'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                          color: '#fff',
                          border: 'none',
                          boxShadow:
                            '0 6px 16px -6px color-mix(in oklab, var(--pbt-driver-primary) 40%, transparent)',
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
                        You
                      </div>
                    </div>
                  );
                }
                const emotion = m.emotion ?? 'red';
                const stateColor = AI_STATE_COLOR[emotion];
                const stateLabel = AI_STATE_LABEL[emotion];
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      animation: 'pbtFadeUp 0.3s ease',
                      maxWidth: '78%',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: stateColor,
                        marginBottom: 4,
                        marginLeft: 6,
                        textShadow: `0 0 8px color-mix(in oklab, ${stateColor} 35%, transparent)`,
                        transition: 'color 0.4s ease',
                      }}
                    >
                      {stateLabel}
                    </div>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 22,
                        fontSize: 14.5,
                        lineHeight: 1.4,
                        background: 'rgba(255,255,255,0.42)',
                        color: 'var(--pbt-text)',
                        backdropFilter: 'blur(22px) saturate(260%) brightness(1.03)',
                        WebkitBackdropFilter: 'blur(22px) saturate(260%) brightness(1.03)',
                        border: `1px solid color-mix(in oklab, ${stateColor} 70%, rgba(255,255,255,0.55))`,
                        boxShadow: [
                          '0 1px 0 rgba(255,255,255,0.9) inset',
                          '0 4px 12px -6px rgba(60,20,15,0.08)',
                          `0 0 14px -2px color-mix(in oklab, ${stateColor} 38%, transparent)`,
                        ].join(', '),
                        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
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
                        marginLeft: 6,
                      }}
                    >
                      {scenario.persona}
                    </div>
                  </div>
                );
              })}
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
            isReady={voiceReady}
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
          scenarioTotal={LIBRARY_SCENARIOS.length}
        />
        <div style={{ position: 'relative' }}>
          {/* Same Icon.info + round glass as Home scenario card; label leads for readability */}
          <div
            role="button"
            tabIndex={0}
            className="absolute z-[2] flex cursor-pointer items-center gap-2"
            style={{
              right: 0,
              bottom: '100%',
              marginBottom: 16,
            }}
            onClick={() => setScenarioDetailsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setScenarioDetailsOpen(true);
              }
            }}
            aria-label="Scenario info"
          >
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.04em',
                fontWeight: 500,
                color: 'var(--pbt-text-muted)',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              Scenario info
            </span>
            <span style={scenarioLibraryInfoButtonStyle(driverColors, darkChrome)}>
              <Icon.info style={{ width: 18, height: 18 }} aria-hidden />
            </span>
          </div>
          <ScenarioSessionControls
            scenario={scenario}
            mode={mode}
            onModeChange={handleModeChange}
            onEnd={() => {
              // Voice with no active session yet → just leave.
              if (
                mode === 'voice' &&
                voice.messages.length === 0 &&
                (voice.status === 'idle' || voice.status === 'error')
              ) {
                voiceStopRef.current();
                go('home');
                return;
              }
              // Text in error / idle → just leave.
              if (mode === 'text' && (chat.status === 'error' || chat.status === 'idle')) {
                go('home');
                return;
              }
              setEndModalOpen(true);
            }}
          />
        </div>
        {mode === 'text' && (
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={(text) => {
              setDraft('');
              void chat.send(text);
            }}
            disabled={
              chat.status === 'aiTyping' ||
              chat.status === 'ending' ||
              chat.status === 'scoring' ||
              chat.status === 'complete'
            }
            canSend={chat.status === 'awaitingUser'}
            onResize={pinScrollToBottom}
          />
        )}
      </div>
    </div>
    <EndSessionModal
      open={endModalOpen}
      mode={mode}
      onClose={() => setEndModalOpen(false)}
      onSave={() => {
        setEndModalOpen(false);
        if (mode === 'voice') {
          void finalizeVoice();
        } else {
          void chat.end().then(() => go('stats')).catch(() => go('stats'));
        }
      }}
      onRestart={() => {
        setEndModalOpen(false);
        // Restart only offered in text mode — voice would need to tear
        // down + re-establish the WebSocket, which is too heavy for the
        // "retry the same opener" intent.
        void chat.restart();
      }}
      onEnd={() => {
        setEndModalOpen(false);
        if (mode === 'voice') {
          voiceStopRef.current();
          go('home');
        } else {
          void chat.abandon('user_exit');
          go('home');
        }
      }}
    />
    <ExitChatModal
      open={exitModalOpen}
      onClose={() => setExitModalOpen(false)}
      onSave={() => {
        setExitModalOpen(false);
        if (mode === 'voice') {
          void finalizeVoice();
        } else {
          void chat.end().then(() => go('stats')).catch(() => go('stats'));
        }
      }}
      onDiscard={() => {
        setExitModalOpen(false);
        if (mode === 'voice') {
          voiceStopRef.current();
          go('home');
        } else {
          void chat.abandon('user_exit');
          go('home');
        }
      }}
    />
    </>
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
  isReady: isReadyProp,
  analysisError,
  onBegin,
  onRetry,
  driverKey,
}: {
  voice: ReturnType<typeof useVoiceSession>;
  isAnalyzing: boolean;
  /** Brief "Your scorecard is ready" beat between scoring and stats. */
  isReady: boolean;
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

  // Voice transcript display:
  // - AI line: render ONLY `voice.liveAiText`. The voice session keeps it
  //   blank while the AI is speaking and fills it (full, sanitized) at
  //   turnComplete. We do NOT fall back to the last committed message —
  //   that would re-show the previous turn's text during the next turn's
  //   speech, defeating the "blank while speaking" rule.
  // - User line: intentionally NOT rendered. The full user transcript is
  //   still captured on `voice.messages` and persisted with the saved
  //   session for the admin dashboard.
  const aiDisplayText = voice.liveAiText;

  const orbSize = 'min(44vw, 168px)';

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center"
      style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 8, minHeight: 0 }}
    >
      {/* Orb section — status label + orb + emotion dots; pushed down for breathing room */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 24,
          paddingBottom: 10,
          width: '100%',
        }}
      >

      {/* Status label — pumped up between the End tap and the scorecard
          navigation. "Analyzing session…" pulses in green; "Your
          scorecard is ready" lands as the brief completion beat before
          we route to stats. Other states stay quiet. */}
      {isAnalyzing || isReadyProp ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 14,
            fontFamily: 'var(--pbt-font-display)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'oklch(0.68 0.18 150)',
            textShadow:
              '0 0 18px color-mix(in oklab, oklch(0.68 0.18 150) 55%, transparent), 0 0 36px color-mix(in oklab, oklch(0.68 0.18 150) 25%, transparent)',
            textAlign: 'center',
            minHeight: 28,
            animation: isAnalyzing
              ? 'pbt-analyze-pulse 1.6s ease-in-out infinite'
              : 'pbtFadeUp 0.32s ease-out',
          }}
        >
          {isReadyProp ? 'Your scorecard is ready' : 'Analyzing session…'}
        </div>
      ) : (
        <div
          style={{
            marginBottom: 14,
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
            : STATUS_LABELS[voice.status] ?? ''}
        </div>
      )}

      {/* Orb — nudged down so stack breathes vs header; ring glow stays symmetric */}
      <div
        style={{
          position: 'relative',
          width: orbSize,
          height: orbSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 18,
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
          marginTop: 18,
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

      {/* Transcript — fills remaining space below orb block; centered vertically so text uses midzone */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: 0,
          paddingTop: 24,
          paddingBottom: 18,
          paddingLeft: 16,
          paddingRight: 16,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          gap: 12,
        }}
      >
        {aiDisplayText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              textAlign: 'center',
              fontSize: 'clamp(16px, 3.9vw, 20px)',
              fontWeight: 400,
              lineHeight: 1.45,
              color: 'var(--pbt-text)',
              letterSpacing: '-0.005em',
              maxWidth: 360,
              width: '100%',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {aiDisplayText}
          </motion.div>
        )}
        {/* User transcript intentionally not rendered in voice mode — it's
            still captured on voice.messages so the admin dashboard / saved
            session record gets the full two-sided transcript, but the
            voice UI shows only the AI line. */}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Session-end + back-confirm modals
// ─────────────────────────────────────────────────────────────

function EndSessionModal({
  open,
  mode,
  onClose,
  onSave,
  onRestart,
  onEnd,
}: {
  open: boolean;
  mode: 'text' | 'voice';
  onClose: () => void;
  onSave: () => void;
  onRestart: () => void;
  onEnd: () => void;
}) {
  // Voice mode hides Restart — re-establishing the Live API socket is too
  // heavy for the "retry the same opener" intent; teardown + reconnect
  // would take longer than the user's patience for a soft reset.
  const subtitle =
    mode === 'voice'
      ? 'Save it to your history with a full scorecard, or end without saving.'
      : 'Save it to your history with a full scorecard, restart with the same opener, or end without saving.';
  return (
    <ModalShell open={open} onClose={onClose} title="End this session?" subtitle={subtitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ModalActionButton tone="primary" onClick={onSave}>
          Save & score
        </ModalActionButton>
        {mode === 'text' && (
          <ModalActionButton tone="secondary" onClick={onRestart}>
            Restart with same opener
          </ModalActionButton>
        )}
        <ModalActionButton tone="quiet" onClick={onEnd}>
          End without saving
        </ModalActionButton>
      </div>
    </ModalShell>
  );
}

function ExitChatModal({
  open,
  onClose,
  onSave,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Save your progress?"
      subtitle="You're leaving mid-session. Save it to your history with a full scorecard, or discard and head back."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ModalActionButton tone="primary" onClick={onSave}>
          Save & score
        </ModalActionButton>
        <ModalActionButton tone="quiet" onClick={onDiscard}>
          Discard & leave
        </ModalActionButton>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 70,
              border: 'none',
              background: 'rgba(20, 12, 14, 0.36)',
              backdropFilter: 'blur(6px)',
              cursor: 'default',
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-session-modal-title"
            initial={{ opacity: 0, scale: 0.94, x: '-50%', y: '-46%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.94, x: '-50%', y: '-46%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 71,
              width: 'min(94vw, 420px)',
              borderRadius: 28,
            }}
          >
            <Glass radius={28} padding="24px 22px" blur={26} tint={0.06}>
              <h2
                id="end-session-modal-title"
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--pbt-text)',
                }}
              >
                {title}
              </h2>
              {subtitle && (
                <p
                  style={{
                    margin: '8px 0 18px',
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--pbt-text-muted)',
                  }}
                >
                  {subtitle}
                </p>
              )}
              {children}
            </Glass>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ModalActionButton({
  tone,
  onClick,
  children,
}: {
  tone: 'primary' | 'secondary' | 'quiet';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, CSSProperties> = {
    primary: {
      background:
        'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
      color: '#fff',
      border: '1px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, rgba(255,255,255,0.45))',
      boxShadow: [
        '0 1px 0 rgba(255,255,255,0.38) inset',
        '0 -1px 0 rgba(0,0,0,0.10) inset',
        '0 6px 18px -6px color-mix(in oklab, var(--pbt-driver-primary) 35%, transparent)',
      ].join(', '),
      fontWeight: 700,
    },
    secondary: {
      background: 'rgba(255,255,255,0.42)',
      color: 'var(--pbt-text)',
      border: '1px solid rgba(255,255,255,0.6)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      fontWeight: 600,
    },
    quiet: {
      background: 'transparent',
      color: 'var(--pbt-text-muted)',
      border: '1px solid rgba(60,20,15,0.16)',
      fontWeight: 600,
    },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        padding: '12px 16px',
        borderRadius: 14,
        cursor: 'pointer',
        fontFamily: 'var(--pbt-font-body)',
        fontSize: 14,
        letterSpacing: '-0.005em',
        ...styles[tone],
      }}
    >
      {children}
    </button>
  );
}
