/**
 * Step 2 — "What is the owner pushing back on?"
 *
 * The kind of objection (seven tiles, each with the line an owner would
 * say), the objection in the owner's own words (required for "Something
 * else"), and the backstory the AI customer builds the conversation on.
 */
import type { StepProps } from '../types';
import {
  AssistButton,
  FieldBlock,
  OptionTile,
  StudioSection,
  TextArea,
  useFieldId,
} from '../ui';
import { COLOR } from '../../lib/tokens';
import { Button } from '../../primitives/form';
import {
  PUSHBACK_EXAMPLES,
  PUSHBACK_IDS,
  PUSHBACK_LABELS,
} from '../../../../src/shared/scenarios/enums';
import { speciesOf, type ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { hasText } from '../studioModel';
import { BuiltInHint, FitGrid, Group, StepBody } from './stepParts';

/** What each tile is called. `custom` reads as a choice, not a setting. */
export function pushbackTitle(id: string): string {
  return id === 'custom' ? 'Something else' : (PUSHBACK_LABELS[id] ?? id);
}

/** The example line, spoken about the right animal. Display only. */
export function pushbackExample(id: string, species: ScenarioSpecies): string {
  if (id === 'custom') return 'Describe it in your own words below.';
  const example = PUSHBACK_EXAMPLES[id] ?? '';
  return species === 'cat' ? example.replace(/\bdog\b/g, 'cat') : example;
}

const NOTES_PLACEHOLDER: Record<string, string> = {
  cost: 'e.g. “I can get a big bag at the supermarket for half that price.”',
  'breeder-advice': 'e.g. “The breeder said to keep her on the puppy food she was raised on.”',
  'raw-food': 'e.g. “I read that grains cause allergies — I’d rather feed raw.”',
  'rx-diet': 'e.g. “She seems fine to me. Can’t we just wait and see?”',
  'brand-switch': 'e.g. “We’ve fed the same food for eight years and never had a problem.”',
  'weight-denial': 'e.g. “He’s just big-boned. He eats less than my other one.”',
  custom: 'e.g. “I don’t want him on any medication long-term — I’d rather try something natural first.”',
};

const BACKSTORY_PLACEHOLDER: Record<ScenarioSpecies, string> = {
  dog: 'e.g. Bella is a 6-year-old Labrador, 38 kg, body condition 7 out of 9. At her last visit the vet recommended a weight-loss diet. The owner’s previous dog lived to 15 on supermarket food.',
  cat: 'e.g. Milo is a 9-year-old neutered Domestic Shorthair with a history of urinary crystals. The vet recommended a urinary diet; the owner free-feeds and has two other cats.',
};

export function PushbackStep({ draft, patch, canWrite, base, askAssistant }: StepProps) {
  const notesId = useFieldId();
  const backstoryId = useFieldId();
  const species = speciesOf(draft.species);
  const pushbackId = draft.pushback_id ?? null;
  const isCustom = pushbackId === 'custom';
  const notes = draft.pushback_notes ?? '';
  const backstory = draft.context_override ?? '';
  const legacyTitle = (draft.title_override ?? '').trim();

  return (
    <StepBody>
      {legacyTitle !== '' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(60,20,15,0.045)',
            border: `1px solid ${COLOR.borderSoft}`,
            fontSize: 12.5,
            lineHeight: 1.5,
            color: COLOR.inkSoft,
          }}
        >
          <span style={{ flex: '1 1 260px' }}>
            <strong style={{ color: COLOR.ink }}>An old title is still saved:</strong> “{legacyTitle}”.
            The app no longer uses it — clearing it keeps this scenario tidy.
          </span>
          <Button size="sm" disabled={!canWrite} onClick={() => patch({ title_override: null })}>
            Clear old title
          </Button>
        </div>
      )}

      <StudioSection
        title="The kind of pushback"
        hint="Pick the objection the trainee has to work through."
      >
        <Group label="The kind of pushback">
          <FitGrid min={210}>
            {PUSHBACK_IDS.filter((id) => id !== 'custom').map((id) => (
              <OptionTile
                key={id}
                selected={pushbackId === id}
                onSelect={() => patch({ pushback_id: id })}
                disabled={!canWrite}
                title={pushbackTitle(id)}
                description={<span style={{ fontStyle: 'italic' }}>{pushbackExample(id, species)}</span>}
              />
            ))}
          </FitGrid>
          <div style={{ marginTop: 10, display: 'grid' }}>
            <OptionTile
              compact
              selected={pushbackId === 'custom'}
              onSelect={() => patch({ pushback_id: 'custom' })}
              disabled={!canWrite}
              glyph={<span aria-hidden>✎</span>}
              title={pushbackTitle('custom')}
              description={pushbackExample('custom', species)}
            />
          </div>
        </Group>
        <BuiltInHint
          base={base}
          draft={draft}
          field="pushback_id"
          patch={patch}
          canWrite={canWrite}
          noun="pushback"
          format={(v) => pushbackTitle(String(v))}
        />
      </StudioSection>

      <StudioSection
        title="In the owner’s words"
        optional={!isCustom}
        right={
          <AssistButton
            disabled={!canWrite || !pushbackId}
            title={pushbackId ? undefined : 'Pick a kind of pushback first'}
            onClick={() => askAssistant('Put the pushback in the owner’s words')}
          >
            Put it in the owner’s words
          </AssistButton>
        }
      >
        <FieldBlock
          label={isCustom ? 'What exactly are they objecting to?' : 'Anything specific they say'}
          htmlFor={notesId}
          hint={
            isCustom ? (
              <span style={{ color: hasText(notes) ? undefined : 'oklch(0.45 0.14 70)', fontWeight: hasText(notes) ? 400 : 700 }}>
                Needed for “Something else” — the AI customer builds the whole objection from this.
              </span>
            ) : (
              'A line or two in the owner’s voice makes the objection sharper.'
            )
          }
        >
          <TextArea
            id={notesId}
            rows={isCustom ? 4 : 3}
            value={notes}
            disabled={!canWrite}
            placeholder={NOTES_PLACEHOLDER[pushbackId ?? 'cost'] ?? NOTES_PLACEHOLDER.cost}
            onChange={(e) => patch({ pushback_notes: e.target.value })}
            style={
              isCustom && !hasText(notes)
                ? { borderColor: 'color-mix(in oklab, oklch(0.62 0.18 70) 55%, transparent)' }
                : undefined
            }
          />
        </FieldBlock>
        <BuiltInHint
          base={base}
          draft={draft}
          field="pushback_notes"
          patch={patch}
          canWrite={canWrite}
          noun="owner’s words"
        />
      </StudioSection>

      <StudioSection
        title="Backstory"
        optional
        hint="The pet’s name, age, weight or body condition, what the vet recommended, and anything in the owner’s history that matters."
        right={
          <AssistButton
            disabled={!canWrite}
            onClick={() => askAssistant('Write a backstory for me')}
          >
            Write a backstory for me
          </AssistButton>
        }
      >
        <FieldBlock
          label="The situation"
          htmlFor={backstoryId}
          hint="The AI customer treats this as true and brings it up naturally. Trainees never see it written down."
        >
          <TextArea
            id={backstoryId}
            rows={5}
            value={backstory}
            disabled={!canWrite}
            placeholder={BACKSTORY_PLACEHOLDER[species]}
            onChange={(e) => patch({ context_override: e.target.value })}
          />
        </FieldBlock>
        <BuiltInHint
          base={base}
          draft={draft}
          field="context_override"
          patch={patch}
          canWrite={canWrite}
          noun="backstory"
        />
      </StudioSection>
    </StepBody>
  );
}
