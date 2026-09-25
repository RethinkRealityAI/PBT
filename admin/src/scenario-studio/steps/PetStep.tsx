/**
 * Step 1 — "Who is the patient?"
 *
 * Species (two big tiles), breed (free text + popular shortcuts for the
 * species), life stage (species-aware names: a kitten is stored as the puppy
 * stage and only *shown* as Kitten) and an optional weight.
 */
import { useEffect, useState } from 'react';
import type { StepProps } from '../types';
import {
  AssistButton,
  Chip,
  FieldBlock,
  OptionTile,
  SPECIES_GLYPH,
  StudioSection,
  TextInput,
  useFieldId,
} from '../ui';
import { COLOR } from '../../lib/tokens';
import {
  POPULAR_BREEDS,
  SPECIES_LABELS,
  TYPICAL_WEIGHT_HINT,
  lifeStageLabel,
  speciesOf,
  type ScenarioSpecies,
} from '../../../../src/shared/scenarios/species';
import { LIFE_STAGES } from '../../../../src/shared/scenarios/enums';
import { SCENARIO_LIMITS } from '../../../../src/shared/scenarios/limits';
import { BuiltInHint, Caption, FitGrid, Group, StepBody, UnitInput, linkButton } from './stepParts';

const SPECIES_DESCRIPTIONS: Record<ScenarioSpecies, string> = {
  dog: 'Dogs and puppies of any breed or size.',
  cat: 'Cats and kittens, indoor or outdoor.',
};

const AGE_DESCRIPTIONS: Record<string, string> = {
  'Puppy (<1)': 'Under 1 year',
  'Junior (1-3)': '1–3 years',
  'Adult (3-7)': '3–7 years',
  'Senior (7+)': '7 years and older',
};

const BREED_PLACEHOLDER: Record<ScenarioSpecies, string> = {
  dog: 'e.g. Labrador Retriever',
  cat: 'e.g. Domestic Shorthair',
};

/** "Kitten (<1)" → "Kitten": the age lives in the tile's description. */
export function lifeStageTitle(stage: string, species: unknown): string {
  return lifeStageLabel(stage, species).replace(/\s*\(.*\)\s*$/, '');
}

const sameBreed = (a: string | null | undefined, b: string) =>
  (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The breed belongs to the OTHER species' shortcut list (and not to this
 * one's — "Mixed breed" is in both). Used to offer, never to force, a clear.
 */
export function breedBelongsToOtherSpecies(
  breed: string | null | undefined,
  species: ScenarioSpecies,
): boolean {
  if (!breed || !breed.trim()) return false;
  const other: ScenarioSpecies = species === 'cat' ? 'dog' : 'cat';
  return (
    POPULAR_BREEDS[other].some((b) => sameBreed(breed, b)) &&
    !POPULAR_BREEDS[species].some((b) => sameBreed(breed, b))
  );
}

export function PetStep({ draft, patch, canWrite, base, askAssistant }: StepProps) {
  const breedId = useFieldId();
  const weightId = useFieldId();
  const species = speciesOf(draft.species);
  const declared = draft.species === 'dog' || draft.species === 'cat';
  const breed = draft.breed ?? '';
  const mismatch = declared && breedBelongsToOtherSpecies(breed, species);

  return (
    <StepBody>
      <StudioSection
        title="Species"
        hint="The AI customer talks about this animal, and the research it reads is filtered to match."
      >
        <Group label="Species">
          <FitGrid min={220}>
            {(['dog', 'cat'] as const).map((s) => (
              <OptionTile
                key={s}
                selected={draft.species === s}
                onSelect={() => patch({ species: s })}
                disabled={!canWrite}
                glyph={<span aria-hidden>{SPECIES_GLYPH[s]}</span>}
                title={SPECIES_LABELS[s]}
                description={SPECIES_DESCRIPTIONS[s]}
              />
            ))}
          </FitGrid>
        </Group>
        {!declared && (
          <Caption>Not set — this scenario is treated as a dog.</Caption>
        )}
        {mismatch && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 14px',
              borderRadius: 12,
              background: COLOR.warnSoft,
              color: 'oklch(0.38 0.1 70)',
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <span>
              “{breed.trim()}” is usually a {species === 'cat' ? 'dog' : 'cat'} breed.
            </span>
            {canWrite && (
              <button type="button" style={linkButton} onClick={() => patch({ breed: null })}>
                Clear the breed
              </button>
            )}
          </div>
        )}
        <BuiltInHint
          base={base}
          draft={draft}
          field="species"
          patch={patch}
          canWrite={canWrite}
          noun="species"
          format={(v) => (v === 'cat' ? 'Cat' : v === 'dog' ? 'Dog' : 'not set (a dog)')}
        />
      </StudioSection>

      <StudioSection
        title="Breed"
        hint="Any breed works — the shortcuts are just the common ones."
        right={
          <AssistButton
            disabled={!canWrite}
            onClick={() => askAssistant('Suggest a breed and age that fit this scenario')}
          >
            Suggest a breed and age
          </AssistButton>
        }
      >
        <FieldBlock
          label="Breed name"
          htmlFor={breedId}
          count={{ value: breed.length, max: SCENARIO_LIMITS.breedMax }}
        >
          <TextInput
            id={breedId}
            value={breed}
            maxLength={SCENARIO_LIMITS.breedMax}
            disabled={!canWrite}
            placeholder={BREED_PLACEHOLDER[species]}
            onChange={(e) => patch({ breed: e.target.value })}
          />
        </FieldBlock>
        <Group label={`Popular ${species} breeds`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {POPULAR_BREEDS[species].map((b) => (
              <Chip
                key={b}
                selected={sameBreed(breed, b)}
                disabled={!canWrite}
                onClick={() => patch({ breed: b })}
              >
                {b}
              </Chip>
            ))}
          </div>
        </Group>
        <BuiltInHint base={base} draft={draft} field="breed" patch={patch} canWrite={canWrite} noun="breed" />
      </StudioSection>

      <StudioSection title="Life stage" hint="Age changes the clinical picture — and how the owner talks about it.">
        <Group label="Life stage">
          <FitGrid min={140}>
            {LIFE_STAGES.map((stage) => (
              <OptionTile
                key={stage}
                compact
                selected={draft.life_stage === stage}
                onSelect={() => patch({ life_stage: stage })}
                disabled={!canWrite}
                title={lifeStageTitle(stage, draft.species)}
                description={AGE_DESCRIPTIONS[stage]}
              />
            ))}
          </FitGrid>
        </Group>
        <BuiltInHint
          base={base}
          draft={draft}
          field="life_stage"
          patch={patch}
          canWrite={canWrite}
          noun="life stage"
          format={(v) => lifeStageLabel(v as string, draft.species)}
        />
      </StudioSection>

      <StudioSection title="Weight" optional hint="Useful for weight and diet conversations. Leave it empty if it doesn’t matter.">
        <WeightField
          id={weightId}
          value={draft.weight_kg ?? null}
          onChange={(kg) => patch({ weight_kg: kg })}
          disabled={!canWrite}
          hint={TYPICAL_WEIGHT_HINT[species]}
        />
        <BuiltInHint
          base={base}
          draft={draft}
          field="weight_kg"
          patch={patch}
          canWrite={canWrite}
          noun="weight"
          format={(v) => `${v} kg`}
        />
      </StudioSection>
    </StepBody>
  );
}

/** The problem with a weight, or null when it is fine (or empty). */
export function weightProblem(kg: number | null): string | null {
  if (kg === null) return null;
  if (!Number.isFinite(kg) || kg <= 0) return 'A weight has to be more than 0 kg — or leave it empty.';
  if (kg > SCENARIO_LIMITS.weightMaxKg) {
    return `That’s heavier than any pet we model — the limit is ${SCENARIO_LIMITS.weightMaxKg} kg.`;
  }
  return null;
}

/**
 * The input keeps its own text so half-typed numbers ("0.", "12.") survive
 * re-renders; the draft gets the parsed number (or null when emptied). The
 * error waits for the admin to leave the field, so it never flashes while
 * they are still typing "0.5".
 */
function WeightField({
  id,
  value,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  value: number | null;
  onChange: (kg: number | null) => void;
  disabled: boolean;
  hint: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (the assistant, "Use built-in") without fighting
  // the admin's own half-typed text.
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value && !(Number.isNaN(parsed) && value === null)) {
      setText(value === null ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const problem = weightProblem(value);
  return (
    <FieldBlock label="Weight in kilograms" htmlFor={id} hint={hint} error={focused ? null : problem}>
      <UnitInput
        id={id}
        unit="kg"
        type="number"
        inputMode="decimal"
        step="0.1"
        min={0.1}
        max={SCENARIO_LIMITS.weightMaxKg}
        value={text}
        disabled={disabled}
        aria-invalid={!focused && problem ? true : undefined}
        placeholder="e.g. 32"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === '') {
            onChange(null);
            return;
          }
          const n = Number(next);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </FieldBlock>
  );
}
