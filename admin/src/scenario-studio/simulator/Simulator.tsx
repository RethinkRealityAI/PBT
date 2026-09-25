/**
 * Test drive — a real conversation with the AI owner, inside the admin.
 *
 * Every owner turn is the real `ai-roleplay` function in preview mode (the
 * server builds the customer prompt from its own config + the draft's unsaved
 * notes and records nothing); End & score is the real `ai-evaluate`. See
 * ../api.ts. The conversation state lives in a per-scenario session
 * (./simulatorSession.ts) so it survives a trip to another step.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Scenario } from '../../../../src/data/scenarios';
import type { ChatMessage } from '../../../../src/services/types';
import { STUDIO_STEP_LABELS } from '../../../../src/shared/ai/scenarioAgent';
import { DIFFICULTY_LABELS, PUSHBACK_LABELS } from '../../../../src/shared/scenarios/enums';
import { lifeStageLabel, speciesOf } from '../../../../src/shared/scenarios/species';
import { Glass } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { COLOR, DRIVERS, RADIUS, type DriverKey } from '../../lib/tokens';
import { Kicker, SPECIES_GLYPH, Spinner, TypingDots } from '../ui';
import { hasText, type StudioDraft, type StudioStepKey } from '../studioModel';
import { ScoreSummary } from './ScoreSummary';
import {
  EMOTION_META,
  EMOTION_ORDER,
  END_DIVIDER_COPY,
  MAX_CUSTOMER_TURNS,
  MAX_REPLY_CHARS,
  MISSING_FIELD_PHRASE,
  RATE_LIMIT_COPY,
  canEnd,
  canSend,
  changedFieldLabels,
  customerTurnCount,
  emotionMeta,
  groupMissingByStep,
  isConversationActive,
  joinList,
  latestEmotion,
  trySayingFor,
  type SimError,
} from './simulatorModel';
import { useSimulator } from './useSimulator';

export interface SimulatorProps {
  draft: StudioDraft;
  scenarioId: string;
  /** Called once per finished run that tested the draft on screen. */
  onTested: () => void;
  goTo: (step: StudioStepKey) => void;
  /** Opens the trainee-app phone frame. The button is hidden without it. */
  onOpenTraineeApp?: () => void;
}

/** Focus `el` unless the admin is busy somewhere else (e.g. the assistant). */
function focusIfCalm(el: HTMLElement | null, root: HTMLElement | null) {
  if (!el || typeof document === 'undefined') return;
  const active = document.activeElement;
  if (!active || active === document.body || (root && root.contains(active))) {
    el.focus({ preventScroll: true });
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function Simulator({ draft, scenarioId, onTested, goTo, onOpenTraineeApp }: SimulatorProps) {
  const sim = useSimulator({ draft, scenarioId, onTested });
  const { state, scenario, missing, staleFields } = sim;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scoreAreaRef = useRef<HTMLDivElement | null>(null);
  const scoreHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // What the header describes: the version being tested once a run starts.
  const shown: Scenario | null = state.convo?.scenario ?? scenario;
  const idle = state.phase === 'idle';
  const active = isConversationActive(state);
  const ended = !idle && !active;
  const stale = !idle && staleFields.length > 0;

  // Keep the newest turn in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length, state.phase, state.error]);

  // Move focus where the admin's next action is — but never steal it from
  // another panel they are typing in.
  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (prev === state.phase) return;
    if (prev === 'opening' && state.phase === 'awaitingTrainee' && !state.error) {
      focusIfCalm(inputRef.current, rootRef.current);
    }
    if (state.phase === 'scored' || state.phase === 'scoreFailed') {
      focusIfCalm(scoreHeadingRef.current, rootRef.current);
      scoreAreaRef.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  }, [state.phase, state.error]);

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <Glass padding={0} radius={RADIUS.xl} style={{ minWidth: 0 }}>
        <OwnerHeader
          scenario={shown}
          draft={draft}
          started={!idle}
          turns={customerTurnCount(state.messages)}
          mood={latestEmotion(state.messages)}
          onRestart={sim.runAgain}
        />

        <div style={{ padding: '0 18px', display: 'grid', gap: 10 }}>
          <SafetyLine />
          {stale && (
            <InlineAlert
              tone="warn"
              title="You’ve changed the scenario since this conversation started — restart to test the new version."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                <span style={{ flex: '1 1 200px' }}>
                  Changed: {joinList(changedFieldLabels(staleFields))}.
                  {ended && ' This run doesn’t count as the test for the new version.'}
                </span>
                <Button size="sm" onClick={sim.runAgain}>
                  ↺ Restart
                </Button>
              </div>
            </InlineAlert>
          )}
        </div>

        {idle ? (
          scenario ? (
            <IdleCard
              scenario={scenario}
              draft={draft}
              goTo={goTo}
              onStart={sim.start}
              onOpenTraineeApp={onOpenTraineeApp}
            />
          ) : (
            <BlockedCard missing={missing} goTo={goTo} />
          )
        ) : (
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation with the owner"
            className="pbt-studio-scroll"
            style={{
              margin: '14px 0 0',
              padding: '4px 18px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 260,
              maxHeight: 'min(560px, 62vh)',
              overflowY: 'auto',
            }}
          >
            {state.messages.map((m, i) => (
              <Bubble key={`${m.timestamp}-${i}`} message={m} />
            ))}
            {(state.phase === 'opening' || state.phase === 'customerTyping') && <TypingBubble />}
            {state.error && <ErrorBubble error={state.error} onRetry={sim.retry} />}
            {ended && state.endReason && <EndDivider text={END_DIVIDER_COPY[state.endReason]} />}
          </div>
        )}

        {active && (
          <Composer
            key={`${scenarioId}:${state.run}`}
            inputRef={inputRef}
            pushbackId={shown?.pushback.id ?? null}
            canSend={canSend(state)}
            canEnd={canEnd(state)}
            waitingForOpening={state.phase === 'opening' || state.error?.kind === 'opening'}
            onSend={sim.send}
            onEnd={sim.endAndScore}
          />
        )}
      </Glass>

      {ended && (
        <div ref={scoreAreaRef} style={{ scrollMarginTop: 16 }}>
          {state.phase === 'scored' ? (
            <ScoreSummary
              ref={scoreHeadingRef}
              report={state.report}
              messages={state.messages}
              countsAsTested={!stale}
              onRetryScore={sim.retryScore}
              onRunAgain={sim.runAgain}
              goTo={goTo}
            />
          ) : state.phase === 'scoreFailed' ? (
            <ScoreSummary
              ref={scoreHeadingRef}
              report={null}
              failure={state.scoreError}
              messages={state.messages}
              countsAsTested={!stale}
              onRetryScore={sim.retryScore}
              onRunAgain={sim.runAgain}
              goTo={goTo}
            />
          ) : (
            <ScoringCard />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

function OwnerHeader({
  scenario,
  draft,
  started,
  turns,
  mood,
  onRestart,
}: {
  scenario: Scenario | null;
  draft: StudioDraft;
  started: boolean;
  turns: number;
  mood: ReturnType<typeof latestEmotion>;
  onRestart: () => void;
}) {
  const driverKey = (scenario?.suggestedDriver ?? draft.suggested_driver ?? null) as DriverKey | null;
  const driver = driverKey && DRIVERS[driverKey] ? DRIVERS[driverKey] : null;
  const persona = scenario?.persona ?? (hasText(draft.persona_override) ? draft.persona_override : 'Skeptical');
  const who = [persona, driver?.key].filter(Boolean).join(', ');
  const pet = scenario
    ? `${SPECIES_GLYPH[speciesOf(scenario.species)]} ${scenario.breed} · ${lifeStageLabel(scenario.age, scenario.species)}`
    : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        padding: '16px 18px 12px',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 800,
          color: '#fff',
          background: driver
            ? `linear-gradient(135deg, ${driver.color}, color-mix(in oklab, ${driver.color} 55%, white))`
            : 'linear-gradient(135deg, oklch(0.62 0.02 20), oklch(0.78 0.02 20))',
          boxShadow: '0 4px 12px -6px rgba(20,5,8,0.35), inset 0 1px 0 rgba(255,255,255,0.45)',
        }}
      >
        {driver?.glyph ?? '?'}
      </div>

      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 15, lineHeight: 1.3, color: COLOR.ink, letterSpacing: '-0.01em' }}>
          <strong style={{ fontWeight: 700 }}>The owner</strong>
          {who && <span style={{ color: COLOR.inkSoft }}> · {who}</span>}
        </div>
        <div
          style={{
            marginTop: 3,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 10px',
            fontSize: 12.5,
            color: COLOR.inkMute,
          }}
        >
          {pet && <span>{pet}</span>}
          {started && turns > 0 && (
            <span
              style={{
                fontFamily: 'var(--pbt-mono)',
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: COLOR.inkSoft,
              }}
            >
              Turn {turns} of {MAX_CUSTOMER_TURNS}
            </span>
          )}
        </div>
      </div>

      {started && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
          <MoodMeter emotion={mood} />
          <Button size="sm" tone="ghost" onClick={onRestart} title="Start a fresh conversation">
            ↺ Restart
          </Button>
        </div>
      )}
    </div>
  );
}

/** Three segments (defensive → receptive → convinced) with the current one lit. */
function MoodMeter({ emotion }: { emotion: ReturnType<typeof latestEmotion> }) {
  const meta = emotionMeta(emotion);
  return (
    <div
      role="img"
      aria-label={meta ? `Owner’s mood: ${meta.label}. ${meta.description}` : 'Owner’s mood: not read yet'}
      style={{ display: 'grid', gap: 4, justifyItems: 'end' }}
    >
      <div style={{ display: 'flex', gap: 3 }}>
        {EMOTION_ORDER.map((e) => {
          const on = e === emotion;
          const c = EMOTION_META[e].color;
          return (
            <span
              key={e}
              style={{
                width: 20,
                height: 6,
                borderRadius: 999,
                background: on ? c : `color-mix(in oklab, ${c} 16%, white)`,
                boxShadow: on ? `0 0 0 2px color-mix(in oklab, ${c} 22%, transparent)` : 'none',
                transition: 'background 0.2s ease',
              }}
            />
          );
        })}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: meta?.color ?? COLOR.inkMute, lineHeight: 1 }}>
        {meta?.label ?? 'Mood —'}
      </span>
    </div>
  );
}

function SafetyLine() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: RADIUS.md,
        background: 'rgba(60,20,15,0.035)',
        border: `1px solid ${COLOR.borderSoft}`,
        fontSize: 12.5,
        fontWeight: 600,
        color: COLOR.inkSoft,
        lineHeight: 1.4,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0, color: COLOR.success }}>
        <path
          d="M8 1.5 2.5 3.6v4.1c0 3.2 2.3 5.9 5.5 6.8 3.2-.9 5.5-3.6 5.5-6.8V3.6L8 1.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="m5.6 8.1 1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Preview — nothing is recorded and trainees can’t see this.</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Before the conversation
// ─────────────────────────────────────────────────────────────

const cardBody: CSSProperties = { padding: '18px 18px 20px', display: 'grid', gap: 16 };

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.3,
  fontWeight: 700,
  letterSpacing: '-0.015em',
  color: COLOR.ink,
};

const linkButton: CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: COLOR.brand,
  fontSize: 'inherit',
  fontWeight: 700,
  fontFamily: 'var(--pbt-font)',
  cursor: 'pointer',
};

function IdleCard({
  scenario,
  draft,
  goTo,
  onStart,
  onOpenTraineeApp,
}: {
  scenario: Scenario;
  draft: StudioDraft;
  goTo: (step: StudioStepKey) => void;
  onStart: () => void;
  onOpenTraineeApp?: () => void;
}) {
  const vagueCustom = draft.pushback_id === 'custom' && !hasText(draft.pushback_notes);
  return (
    <div style={cardBody} className="pbt-studio-in">
      <div style={{ display: 'grid', gap: 6 }}>
        <h3 style={cardTitle}>Have a real conversation with the AI owner</h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft, maxWidth: 620 }}>
          You play the trainee. The owner is the same AI your trainees will meet, briefed from your
          answers — including changes you haven’t saved yet.
        </p>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {[
          'The owner speaks first, in character.',
          'You reply as a trainee would — try a weak answer, then a good one.',
          'When the owner wraps up, or you press End & score, the real scorer rates the conversation.',
        ].map((text, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11.5,
                fontWeight: 800,
                color: COLOR.brand,
                background: COLOR.brandSoft,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink, paddingTop: 2 }}>{text}</span>
          </li>
        ))}
      </ol>

      <ScenarioFacts scenario={scenario} />

      {vagueCustom && (
        <InlineAlert tone="warn" title="The owner doesn’t know what they’re objecting to yet">
          You chose “Other pushback” without describing it, so the owner will have to improvise.{' '}
          <button type="button" className="pbt-focusable" style={linkButton} onClick={() => goTo('pushback')}>
            Describe it on {STUDIO_STEP_LABELS.pushback} →
          </button>
        </InlineAlert>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Button tone="primary" onClick={onStart} style={{ padding: '11px 18px', fontSize: 14, borderRadius: 12 }}>
          Start the conversation
        </Button>
        {onOpenTraineeApp && (
          <Button onClick={onOpenTraineeApp} style={{ padding: '11px 16px', fontSize: 14, borderRadius: 12 }}>
            Open in the trainee app
          </Button>
        )}
      </div>
    </div>
  );
}

function ScenarioFacts({ scenario }: { scenario: Scenario }) {
  const facts: Array<{ label: string; value: ReactNode; sub?: string }> = [
    {
      label: 'Pet',
      value: `${SPECIES_GLYPH[speciesOf(scenario.species)]} ${scenario.breed}`,
      sub: lifeStageLabel(scenario.age, scenario.species),
    },
    {
      label: 'Pushback',
      value: PUSHBACK_LABELS[scenario.pushback.id] ?? scenario.pushback.title,
    },
    {
      label: 'Owner',
      value: scenario.suggestedDriver,
      sub: scenario.persona,
    },
    {
      label: 'Difficulty',
      value: DIFFICULTY_LABELS[scenario.difficulty] ?? `Level ${scenario.difficulty}`,
      sub: `Level ${scenario.difficulty} of 4`,
    },
  ];
  return (
    <dl
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))',
        gap: 8,
      }}
    >
      {facts.map((f) => (
        <div
          key={f.label}
          style={{
            padding: '10px 12px',
            borderRadius: RADIUS.md,
            background: 'rgba(255,255,255,0.7)',
            border: `1px solid ${COLOR.border}`,
            minWidth: 0,
          }}
        >
          <dt>
            <Kicker style={{ fontSize: 9.5 }}>{f.label}</Kicker>
          </dt>
          <dd style={{ margin: '4px 0 0', fontSize: 13.5, fontWeight: 700, color: COLOR.ink, lineHeight: 1.35 }}>
            {f.value}
            {f.sub && (
              <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: COLOR.inkSoft }}>{f.sub}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BlockedCard({ missing, goTo }: { missing: string[]; goTo: (step: StudioStepKey) => void }) {
  const groups = groupMissingByStep(missing);
  return (
    <div style={cardBody} className="pbt-studio-in">
      <div style={{ display: 'grid', gap: 6 }}>
        <Kicker>Not ready to test yet</Kicker>
        <h3 style={cardTitle}>A few answers are missing before the owner can talk</h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
          The AI builds the owner from your answers. Fill these in, then come back here.
        </p>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {groups.map((g) => {
          const label = STUDIO_STEP_LABELS[g.step];
          return (
            <li
              key={g.step}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '12px 14px',
                borderRadius: RADIUS.md,
                background: 'rgba(255,255,255,0.72)',
                border: `1px solid ${COLOR.border}`,
              }}
            >
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{label}</div>
                <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 2 }}>
                  Needs {joinList(g.fields.map((f) => MISSING_FIELD_PHRASE[f] ?? f.toLowerCase()))}
                </div>
              </div>
              <Button size="sm" tone="primary" onClick={() => goTo(g.step)}>
                Go to {label.toLowerCase()} →
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// The conversation
// ─────────────────────────────────────────────────────────────

const bubbleText: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: COLOR.ink,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const bubbleMeta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 3,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: COLOR.inkMute,
};

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="pbt-studio-in" style={{ alignSelf: 'flex-end', maxWidth: 'min(86%, 560px)' }}>
        <div
          style={{
            padding: '10px 13px',
            borderRadius: '16px 16px 6px 16px',
            background: `color-mix(in oklab, ${COLOR.brandSoft} 62%, white)`,
            border: `1px solid color-mix(in oklab, ${COLOR.brand} 14%, transparent)`,
          }}
        >
          <div style={{ ...bubbleMeta, justifyContent: 'flex-end' }}>You, as the trainee</div>
          <div style={bubbleText}>{message.text}</div>
        </div>
      </div>
    );
  }
  const meta = emotionMeta(message.emotion);
  return (
    <div className="pbt-studio-in" style={{ alignSelf: 'flex-start', maxWidth: 'min(86%, 560px)' }}>
      <div
        style={{
          padding: '10px 13px',
          borderRadius: '16px 16px 16px 6px',
          background: 'rgba(255,255,255,0.94)',
          border: '1px solid rgba(60,20,15,0.08)',
          boxShadow: '0 1px 2px rgba(60,20,15,0.04), 0 6px 16px -10px rgba(60,20,15,0.18)',
        }}
      >
        <div style={bubbleMeta}>
          <span>Owner</span>
          {meta && (
            <>
              <span aria-hidden>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: meta.color }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: meta.color }} />
                {meta.label}
              </span>
            </>
          )}
        </div>
        <div style={bubbleText}>{message.text}</div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ alignSelf: 'flex-start' }}>
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '16px 16px 16px 6px',
          background: 'rgba(255,255,255,0.8)',
          border: '1px solid rgba(60,20,15,0.06)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TypingDots label="The owner is typing" />
      </div>
    </div>
  );
}

function ErrorBubble({ error, onRetry }: { error: SimError; onRetry: () => void }) {
  const text = error.rateLimited
    ? RATE_LIMIT_COPY
    : error.kind === 'opening'
      ? `The owner didn’t start the conversation (${error.reason}). Try again.`
      : `The owner didn’t answer (${error.reason}). Try again.`;
  return (
    <div className="pbt-studio-in" style={{ alignSelf: 'flex-start', maxWidth: 'min(86%, 560px)' }}>
      <div
        style={{
          padding: '10px 13px',
          borderRadius: '16px 16px 16px 6px',
          background: error.rateLimited ? COLOR.warnSoft : 'color-mix(in oklab, oklch(0.93 0.07 25) 55%, white)',
          border: `1px solid color-mix(in oklab, ${error.rateLimited ? COLOR.warn : COLOR.danger} 22%, transparent)`,
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.5,
            color: error.rateLimited ? 'oklch(0.42 0.14 70)' : 'oklch(0.42 0.16 25)',
            fontWeight: 600,
          }}
        >
          {text}
        </div>
        <div>
          <Button size="sm" onClick={onRetry}>
            ↻ Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function EndDivider({ text }: { text: string }) {
  return (
    <div
      className="pbt-studio-in"
      style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 2px' }}
    >
      <span aria-hidden style={{ flex: 1, height: 1, background: COLOR.border }} />
      <span
        style={{
          fontFamily: 'var(--pbt-mono)',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLOR.inkMute,
          textAlign: 'center',
        }}
      >
        {text}
      </span>
      <span aria-hidden style={{ flex: 1, height: 1, background: COLOR.border }} />
    </div>
  );
}

function ScoringCard() {
  return (
    <Glass padding="18px 22px" radius={RADIUS.xl}>
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, color: COLOR.inkSoft }}>
        <span aria-hidden style={{ display: 'inline-flex', color: COLOR.brand }}>
          <Spinner label="Scoring" />
        </span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>Scoring the conversation…</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>
            The same scorer your trainees get. Nothing is saved.
          </div>
        </div>
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

const composerField: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  minHeight: 56,
  maxHeight: 180,
  padding: '11px 13px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.85)',
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
  resize: 'vertical',
};

function Composer({
  inputRef,
  pushbackId,
  canSend,
  canEnd,
  waitingForOpening,
  onSend,
  onEnd,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  pushbackId: string | null;
  canSend: boolean;
  canEnd: boolean;
  waitingForOpening: boolean;
  onSend: (text: string) => void;
  onEnd: () => void;
}) {
  const [text, setText] = useState('');
  // Bumped when a starter fills the box, so focus + caret move after render.
  const [focusTick, setFocusTick] = useState(0);
  const inputId = useId();
  const hintId = useId();
  const starters = trySayingFor(pushbackId);
  const ready = canSend && text.trim() !== '';

  useEffect(() => {
    if (focusTick === 0) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange?.(end, end);
  }, [focusTick, inputRef]);

  function submit() {
    if (!ready) return;
    onSend(text);
    setText('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{
        display: 'grid',
        gap: 10,
        padding: '14px 18px 16px',
        borderTop: `1px solid ${COLOR.border}`,
        background: 'rgba(255,255,255,0.35)',
        borderBottomLeftRadius: RADIUS.xl,
        borderBottomRightRadius: RADIUS.xl,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Kicker style={{ marginRight: 4 }}>Try saying…</Kicker>
        {starters.map((s) => (
          <button
            key={s.kind}
            type="button"
            className="pbt-studio-chip"
            onClick={() => {
              setText(s.text);
              setFocusTick((t) => t + 1);
            }}
            style={{
              padding: '6px 11px',
              borderRadius: 999,
              border: '1px solid rgba(60,20,15,0.10)',
              background: 'rgba(255,255,255,0.8)',
              color: COLOR.ink,
              fontSize: 12.5,
              fontFamily: 'var(--pbt-font)',
              cursor: 'pointer',
              textAlign: 'left',
              lineHeight: 1.35,
            }}
          >
            <span style={{ fontWeight: 700, color: COLOR.inkSoft }}>{s.label}: </span>
            <span>“{s.text}”</span>
          </button>
        ))}
      </div>

      <label htmlFor={inputId} style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.ink }}>
        Your reply
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {/* The Studio's TextArea look (same class + field styles) — a plain
            element here because the composer needs a ref for focus. */}
        <textarea
          id={inputId}
          ref={inputRef}
          className="pbt-studio-field"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_REPLY_CHARS))}
          onKeyDown={onKeyDown}
          maxLength={MAX_REPLY_CHARS}
          rows={2}
          aria-describedby={hintId}
          placeholder={waitingForOpening ? 'The owner speaks first…' : 'Reply as a trainee would…'}
          style={composerField}
        />
        <Button type="submit" tone="primary" disabled={!ready} style={{ height: 44, padding: '0 18px', borderRadius: 12 }}>
          Send
        </Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span id={hintId} style={{ fontSize: 12, color: COLOR.inkMute, flex: '1 1 200px' }}>
          Enter to send · Shift+Enter for a new line
          {text.length > MAX_REPLY_CHARS * 0.8 && (
            <span style={{ fontFamily: 'var(--pbt-mono)', marginLeft: 8 }}>
              {text.length}/{MAX_REPLY_CHARS}
            </span>
          )}
        </span>
        <Button
          onClick={onEnd}
          disabled={!canEnd}
          title={canEnd ? 'End the conversation and score it' : 'Reply at least once first'}
        >
          End &amp; score
        </Button>
      </div>
    </form>
  );
}
