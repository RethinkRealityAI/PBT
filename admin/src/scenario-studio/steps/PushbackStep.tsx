/**
 * Step 2 — "What is the owner pushing back on?"
 *
 * Category first: chips for the subjects that hold an objection for this
 * scenario's animal (Everyday nutrition, Obesity & weight loss, Probiotics…),
 * then the objections of the chosen category — the built-in ones and the
 * team's own, each with the line an owner would say — plus "Something else"
 * (the objection in the owner's own words, required for it), and the
 * backstory the AI customer builds the conversation on.
 *
 * A team objection is added right here ("+ New objection in <category>", the
 * same editor as the Categories tab) and picked as soon as it's saved; a new
 * category can be added too. Knowledge is no longer set from here: a
 * scenario reads its CATEGORY's knowledge (shown under the chips) unless it
 * picks its own on the Knowledge step.
 */
import { useEffect, useState } from 'react';
import type { StepProps } from '../types';
import {
  AssistButton,
  Chip,
  FieldBlock,
  OptionTile,
  StudioSection,
  TextArea,
  useFieldId,
} from '../ui';
import { COLOR } from '../../lib/tokens';
import { Button, InlineAlert } from '../../primitives/form';
import { PUSHBACK_EXAMPLES } from '../../../../src/shared/scenarios/enums';
import { adaptPetWords, speciesOf, type ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { objectionCategoryId } from '../../../../src/shared/scenarios/objectionCategories';
import { hasText } from '../studioModel';
import {
  animalsInSentence,
  animalsLabel,
  checkObjection,
  objectionLabel,
  pushbackChoicesFor,
  type ObjectionCheck,
  type ObjectionRef,
  type PushbackOption,
} from '../objections/objectionsModel';
import { hasCategoryKnowledge, knowledgeSummaryText } from '../objections/categoriesModel';
import { useObjectionsContext } from '../objections/ObjectionsContext';
import { ObjectionEditor } from '../objections/ObjectionEditor';
import { CategoryEditor } from '../objections/CategoryEditor';
import { BodyPortal } from '../objections/editorParts';
import { BuiltInHint, Caption, FitGrid, Group, StepBody, linkButton } from './stepParts';

/** What each tile is called. `custom` reads as a choice, not a setting. */
export function pushbackTitle(id: string, team: readonly ObjectionRef[] = []): string {
  return id === 'custom' ? 'Something else' : objectionLabel(id, team);
}

/** The example line, spoken about the right animal. Display only. */
export function pushbackExample(id: string, species: ScenarioSpecies): string {
  if (id === 'custom') return 'Describe it in your own words below.';
  // The same word map the prompts use, so the tile never disagrees with
  // what the AI owner will actually say ("Dog", "puppy", …).
  return adaptPetWords(PUSHBACK_EXAMPLES[id] ?? '', species);
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

export function PushbackStep({ draft, patch, canWrite, base, askAssistant, knowledge }: StepProps) {
  const notesId = useFieldId();
  const backstoryId = useFieldId();
  const objectionsApi = useObjectionsContext();
  const team = objectionsApi.objections;
  const categories = objectionsApi.categories;
  const species = speciesOf(draft.species);
  const pushbackId = draft.pushback_id ?? null;
  const isCustom = pushbackId === 'custom';
  const notes = draft.pushback_notes ?? '';
  const backstory = draft.context_override ?? '';
  const legacyTitle = (draft.title_override ?? '').trim();
  const check = checkObjection({
    pushbackId,
    species,
    team,
    deleted: objectionsApi.deleted,
    loaded: objectionsApi.loaded,
  });
  /** The draft's team objection when it is still around but not offered (retired / other animal). */
  const offPicker =
    check && (check.state === 'retired' || check.state === 'wrong-species')
      ? team.find((o) => o.id === check.id) ?? null
      : null;

  // The category chips. The draft's own category is always one of them (and
  // pre-selected); a chip the admin clicks wins until the objection changes
  // from elsewhere (the assistant, a revert), which re-selects its category.
  const draftCategoryId = objectionCategoryId(pushbackId, team);
  const [picked, setPicked] = useState<string | null>(null);
  /** A category created from this step — offered even before it holds an objection. */
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
  }, [pushbackId]);
  const choices = pushbackChoicesFor(species, team, categories, [draftCategoryId, created, picked]);
  const activeId =
    (picked && choices.some((c) => c.category.id === picked) ? picked : null) ??
    (draftCategoryId && choices.some((c) => c.category.id === draftCategoryId) ? draftCategoryId : null) ??
    choices[0]?.category.id ??
    null;
  const active = choices.find((c) => c.category.id === activeId) ?? null;
  const offPickerHere = offPicker && offPicker.categoryId === activeId ? offPicker : null;
  const teamTiles = active ? active.team.length + (offPickerHere ? 1 : 0) : 0;

  const [editorOpen, setEditorOpen] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState<'new' | 'edit' | null>(null);
  const canAddObjection = canWrite && objectionsApi.available;
  const teamExample = team.find((o) => o.id === pushbackId)?.example ?? null;

  function choose(option: Pick<PushbackOption, 'id'>) {
    patch({ pushback_id: option.id });
  }

  function teamTile(o: PushbackOption, flag?: string) {
    return (
      <OptionTile
        key={o.id}
        selected={pushbackId === o.id}
        onSelect={() => choose(o)}
        disabled={!canWrite}
        title={o.title}
        description={o.example ? <span style={{ fontStyle: 'italic' }}>{o.example}</span> : undefined}
        footer={
          flag || o.species.length === 1 ? (
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {flag && <TileTag tone="warn">{flag}</TileTag>}
              {o.species.length === 1 && <TileTag>{animalsLabel(o.species)}</TileTag>}
            </span>
          ) : undefined
        }
      />
    );
  }

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
        hint="Pick the subject, then the objection the trainee has to work through."
      >
        <div role="group" aria-label="Category" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {choices.map((c) => (
            <Chip
              key={c.category.id}
              selected={c.category.id === activeId}
              onClick={() => setPicked(c.category.id)}
              title={c.category.description || undefined}
            >
              {c.category.name}
              <span style={{ marginLeft: 6, opacity: 0.7, fontFamily: 'var(--pbt-mono)', fontSize: 11 }}>
                {c.builtIn.length + c.team.length}
              </span>
            </Chip>
          ))}
        </div>

        {active && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Caption>
              {hasCategoryKnowledge(active.category)
                ? `Scenarios in ${active.category.name} read its knowledge: ${knowledgeSummaryText(active.category)}.`
                : `${active.category.name} has no knowledge attached, so its scenarios read the whole library.`}
            </Caption>
            {canAddObjection && (
              <button type="button" style={linkButton} onClick={() => setCategoryEditor('edit')}>
                {hasCategoryKnowledge(active.category) ? `Edit ${active.category.name}` : `Add knowledge to ${active.category.name}`}
              </button>
            )}
          </div>
        )}

        <Group label="The kind of pushback">
          {active && active.builtIn.length > 0 && teamTiles > 0 && <GroupHeading>Built in</GroupHeading>}
          {active && active.builtIn.length > 0 && (
            <FitGrid min={210}>
              {active.builtIn.map((o) => (
                <OptionTile
                  key={o.id}
                  selected={pushbackId === o.id}
                  onSelect={() => choose(o)}
                  disabled={!canWrite}
                  title={pushbackTitle(o.id)}
                  description={<span style={{ fontStyle: 'italic' }}>{pushbackExample(o.id, species)}</span>}
                />
              ))}
            </FitGrid>
          )}
          {active && teamTiles > 0 && (
            <>
              {active.builtIn.length > 0 && <GroupHeading>Your team’s objections</GroupHeading>}
              <FitGrid min={210}>
                {active.team.map((o) => teamTile(o))}
                {offPickerHere &&
                  teamTile(
                    {
                      id: offPickerHere.id,
                      title: offPickerHere.title,
                      example: offPickerHere.example,
                      builtIn: false,
                      species: [...offPickerHere.species],
                      categoryId: offPickerHere.categoryId,
                    },
                    offPickerHere.visible ? `For ${animalsInSentence(offPickerHere.species)} only` : 'Retired',
                  )}
              </FitGrid>
            </>
          )}
          {active && active.builtIn.length === 0 && teamTiles === 0 && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px dashed rgba(60,20,15,0.16)',
                background: 'rgba(255,255,255,0.45)',
                fontSize: 13,
                color: COLOR.inkMute,
              }}
            >
              No objections in {active.category.name} for {species === 'cat' ? 'cats' : 'dogs'} yet.
              {canAddObjection ? ' Add the first one below.' : ''}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'grid' }}>
            <OptionTile
              compact
              selected={pushbackId === 'custom'}
              onSelect={() => choose({ id: 'custom' })}
              disabled={!canWrite}
              glyph={<span aria-hidden>✎</span>}
              title={pushbackTitle('custom')}
              description={`${pushbackExample('custom', species)} Not in any category.`}
            />
          </div>
        </Group>

        <ObjectionNote check={check} species={species} />

        {(canAddObjection || (active?.hiddenForSpecies ?? 0) > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {canAddObjection && active && (
              <Button size="sm" tone="secondary" onClick={() => setEditorOpen(true)}>
                + New objection in {active.category.name}
              </Button>
            )}
            {canAddObjection && (
              <Button size="sm" tone="ghost" onClick={() => setCategoryEditor('new')}>
                + New category
              </Button>
            )}
            {active && active.hiddenForSpecies > 0 && (
              <Caption>
                {`${active.hiddenForSpecies} of the objections in ${active.category.name} ${
                  active.hiddenForSpecies === 1 ? 'is' : 'are'
                } only for ${species === 'cat' ? 'dogs' : 'cats'}, so ${
                  active.hiddenForSpecies === 1 ? 'it isn’t' : 'they aren’t'
                } shown here.`}
              </Caption>
            )}
          </div>
        )}

        <BuiltInHint
          base={base}
          draft={draft}
          field="pushback_id"
          patch={patch}
          canWrite={canWrite}
          noun="pushback"
          format={(v) => pushbackTitle(String(v), team)}
        />
        {canAddObjection && (
          <BodyPortal>
            <ObjectionEditor
              open={editorOpen}
              onClose={() => setEditorOpen(false)}
              defaultSpecies={[species]}
              defaultCategoryId={activeId}
              knowledge={knowledge}
              canWrite={canWrite}
              onSaved={(saved) => {
                choose(saved);
                setPicked(saved.categoryId);
              }}
            />
            <CategoryEditor
              open={categoryEditor !== null}
              onClose={() => setCategoryEditor(null)}
              category={categoryEditor === 'edit' ? active?.category ?? null : null}
              canWrite={canWrite}
              knowledge={knowledge}
              onSaved={(saved) => {
                setCreated(saved.id);
                setPicked(saved.id);
              }}
            />
          </BodyPortal>
        )}
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
            placeholder={
              teamExample
                ? `e.g. ${teamExample}`
                : (NOTES_PLACEHOLDER[pushbackId ?? 'cost'] ?? NOTES_PLACEHOLDER.cost)
            }
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

function GroupHeading({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 750, color: COLOR.inkMute, margin: '4px 0 8px', letterSpacing: '0.01em' }}>
      {children}
    </div>
  );
}

function TileTag({ children, tone }: { children: string; tone?: 'warn' }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: tone === 'warn' ? 'color-mix(in oklab, oklch(0.62 0.18 70) 16%, white)' : 'rgba(60,20,15,0.06)',
        color: tone === 'warn' ? 'oklch(0.42 0.12 70)' : COLOR.inkSoft,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Where the scenario's team objection stands, said plainly: retired, for
 * the other animal, or gone. Nothing for a built-in or a healthy one.
 */
function ObjectionNote({ check, species }: { check: ObjectionCheck | null; species: ScenarioSpecies }) {
  if (!check) return null;
  const animal = species === 'cat' ? 'a cat' : 'a dog';
  switch (check.state) {
    case 'deleted':
      return (
        <InlineAlert tone="error" title="This scenario’s objection was deleted">
          “{check.title}” no longer exists, so this scenario can’t be played or saved. Pick another
          objection above — or restore it from “Recently deleted” on the Categories tab.
        </InlineAlert>
      );
    case 'unknown':
      return (
        <InlineAlert tone="error" title="This scenario’s objection can’t be found">
          It may have been removed. Pick another objection above before saving.
        </InlineAlert>
      );
    case 'wrong-species':
      return (
        <InlineAlert tone="warn" title={`“${check.title}” isn’t set up for ${animal}`}>
          It’s for {animalsInSentence(check.species)} only, but this scenario is about {animal}. Pick
          another objection, or add {species === 'cat' ? 'cats' : 'dogs'} to it on the Categories tab.
        </InlineAlert>
      );
    case 'retired':
      return (
        <InlineAlert tone="warn" title={`“${check.title}” is retired`}>
          This scenario still plays, but the objection isn’t offered for new scenarios any more. Pick
          another, or reactivate it on the Categories tab.
          {!check.fits && ` It’s also set up for ${animalsInSentence(check.species)} only.`}
        </InlineAlert>
      );
    default:
      return null;
  }
}
