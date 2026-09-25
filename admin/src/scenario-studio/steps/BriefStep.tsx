/**
 * Step 5 — "How is the AI customer briefed?"
 *
 * The briefing itself is built by the server from the earlier steps plus
 * the rules that keep a conversation realistic and scoreable. The admin
 * cannot replace it — only add notes AROUND it (read first / read last).
 * That wrapping is the product's safety rail, so the step says so plainly
 * and shows the exact result on request.
 */
import type { StepProps } from '../types';
import { AssistButton, Chip, Explainer, FieldBlock, StudioSection, TextArea, useFieldId } from '../ui';
import { COLOR } from '../../lib/tokens';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import type { StudioDraft } from '../studioModel';
import {
  PREFIX_EXAMPLES,
  SUFFIX_EXAMPLES,
  appendSentence,
  hasSentence,
  removeSentence,
  type NoteExample,
} from './briefModel';
import { PromptViewer } from './PromptViewer';
import { BuiltInHint, StepBody } from './stepParts';

const MAX = SCENARIO_LIMITS.promptMax;

/** The order the AI customer reads things in — a small picture, not a paragraph. */
function BriefingOrder() {
  const row = (label: string, tone: 'global' | 'own' | 'core', tall = false) => (
    <div
      style={{
        padding: tall ? '12px 14px' : '7px 12px',
        borderRadius: 10,
        fontSize: 12.5,
        lineHeight: 1.45,
        fontWeight: tone === 'own' ? 700 : 500,
        color: tone === 'core' ? COLOR.inkSoft : COLOR.ink,
        background:
          tone === 'own' ? COLOR.brandSoft : tone === 'global' ? COLOR.infoSoft : 'rgba(255,255,255,0.8)',
        border: tone === 'core' ? `1px solid ${COLOR.border}` : '1px solid transparent',
      }}
    >
      {label}
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }} aria-label="The order the AI customer reads its briefing" role="list">
      <div role="listitem">{row('Opening notes from AI tuning (every scenario)', 'global')}</div>
      <div role="listitem">{row('Your opening notes', 'own')}</div>
      <div role="listitem">
        {row(
          'The standard briefing — the pet, the pushback, the owner and their research, plus the rules that keep the conversation realistic and scoreable',
          'core',
          true,
        )}
      </div>
      <div role="listitem">{row('Your final reminders', 'own')}</div>
      <div role="listitem">{row('Final notes from AI tuning (every scenario)', 'global')}</div>
    </div>
  );
}

function NoteField({
  field,
  label,
  hint,
  placeholder,
  examples,
  draft,
  patch,
  canWrite,
  base,
}: {
  field: 'prompt_prefix' | 'prompt_suffix';
  label: string;
  hint: string;
  placeholder: string;
  examples: NoteExample[];
  draft: StudioDraft;
  patch: (p: StudioDraft) => void;
  canWrite: boolean;
  base: StudioDraft | null;
}) {
  const id = useFieldId();
  const value = draft[field] ?? '';
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <FieldBlock label={label} htmlFor={id} optional hint={hint} count={{ value: value.length, max: MAX }}>
        <TextArea
          id={id}
          rows={4}
          maxLength={MAX}
          value={value}
          disabled={!canWrite}
          placeholder={placeholder}
          onChange={(e) => patch({ [field]: e.target.value } as StudioDraft)}
        />
      </FieldBlock>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.inkMute, marginRight: 2 }}>Try:</span>
        {examples.map((ex) => {
          const on = hasSentence(value, ex.sentence);
          const fits = appendSentence(value, ex.sentence).length <= MAX;
          return (
            <Chip
              key={ex.label}
              selected={on}
              disabled={!canWrite || (!on && !fits)}
              title={on ? `Remove: ${ex.sentence}` : fits ? `Adds: ${ex.sentence}` : 'Not enough room left in this note'}
              onClick={() =>
                patch({
                  [field]: on ? removeSentence(value, ex.sentence) || null : appendSentence(value, ex.sentence),
                } as StudioDraft)
              }
            >
              {on ? '✓ ' : '+ '}
              {ex.label}
            </Chip>
          );
        })}
      </div>
      <BuiltInHint
        base={base}
        draft={draft}
        field={field}
        patch={patch}
        canWrite={canWrite}
        noun={field === 'prompt_prefix' ? 'opening notes' : 'final reminders'}
      />
    </div>
  );
}

export function BriefStep({ draft, patch, canWrite, base, askAssistant, goTo }: StepProps) {
  return (
    <StepBody>
      <Explainer title="How the briefing works">
        The AI customer gets a standard briefing built from your answers so far — the pet, the
        pushback, the owner and the knowledge — plus the rules that keep the conversation realistic
        and scoreable. You can add notes <em>around</em> it, but you can’t replace it. Your notes never
        change how conversations are scored, and the notes set in AI tuning apply to every scenario,
        wrapped outside yours.
      </Explainer>

      <StudioSection title="What the AI customer reads" hint="In this order, every conversation.">
        <BriefingOrder />
      </StudioSection>

      <StudioSection
        title="Your notes"
        optional
        right={
          <AssistButton
            disabled={!canWrite}
            onClick={() => askAssistant('Suggest notes that make this owner more realistic')}
          >
            Suggest notes that make this owner more realistic
          </AssistButton>
        }
      >
        <div style={{ display: 'grid', gap: 24 }}>
          <NoteField
            field="prompt_prefix"
            label="Opening notes — read first, sets the mood"
            hint="Attitude, mood and emphasis. Read before everything else, so it colours the whole conversation."
            placeholder="e.g. Be noticeably more impatient than usual — you are late for work."
            examples={PREFIX_EXAMPLES}
            draft={draft}
            patch={patch}
            canWrite={canWrite}
            base={base}
          />
          <NoteField
            field="prompt_suffix"
            label="Final reminders — read last, firm rules"
            hint="Rules the owner must keep (“never…”, “always…”). Read last, so they’re the hardest to forget."
            placeholder="e.g. Never agree to the diet before asking what it costs."
            examples={SUFFIX_EXAMPLES}
            draft={draft}
            patch={patch}
            canWrite={canWrite}
            base={base}
          />
        </div>
      </StudioSection>

      <StudioSection
        title="See the full briefing"
        hint="The exact text the AI customer would receive for this draft, with your notes highlighted."
      >
        <PromptViewer draft={draft} goTo={goTo} />
      </StudioSection>
    </StepBody>
  );
}
