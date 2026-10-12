/**
 * Step 2 — "What is the owner pushing back on?"
 *
 * The kind of objection — the built-in ones and the team's own for this
 * animal, each with the line an owner would say, plus "Something else" — the
 * objection in the owner's own words (required for "Something else"), and
 * the backstory the AI customer builds the conversation on.
 *
 * A team objection is added right here ("+ New objection", the same editor
 * as the Objections tab) and picked as soon as it's saved. Picking one that
 * belongs to a knowledge topic also points the scenario at that topic — but
 * only while no knowledge has been chosen yet, and with an Undo.
 */
import { useState } from 'react';
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
import { Button, InlineAlert } from '../../primitives/form';
import { PUSHBACK_EXAMPLES } from '../../../../src/shared/scenarios/enums';
import { adaptPetWords, speciesOf, type ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { topicLabel } from '../../../../src/shared/scenarios/objections';
import { hasText } from '../studioModel';
import {
  animalsInSentence,
  animalsLabel,
  checkObjection,
  objectionLabel,
  pickObjectionPatch,
  pushbackOptionsFor,
  type ObjectionCheck,
  type ObjectionRef,
  type PushbackOption,
} from '../objections/objectionsModel';
import { useObjectionsContext } from '../objections/ObjectionsContext';
import { ObjectionEditor } from '../objections/ObjectionEditor';
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

export function PushbackStep({ draft, patch, canWrite, base, askAssistant }: StepProps) {
  const notesId = useFieldId();
  const backstoryId = useFieldId();
  const objectionsApi = useObjectionsContext();
  const team = objectionsApi.objections;
  const species = speciesOf(draft.species);
  const pushbackId = draft.pushback_id ?? null;
  const isCustom = pushbackId === 'custom';
  const notes = draft.pushback_notes ?? '';
  const backstory = draft.context_override ?? '';
  const legacyTitle = (draft.title_override ?? '').trim();
  const options = pushbackOptionsFor(species, team);
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
  const showTeamGroup = options.team.length > 0 || offPicker !== null;
  /** "Knowledge topic set to … to match this objection" — with an Undo. */
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const canAddObjection = canWrite && objectionsApi.available;
  const teamExample = team.find((o) => o.id === pushbackId)?.example ?? null;

  function choose(option: Pick<PushbackOption, 'id' | 'focusArea'>) {
    const picked = pickObjectionPatch(draft, option);
    patch(picked.patch);
    setFocusNote(picked.focusSet);
  }

  function teamTile(o: PushbackOption, flag?: string) {
    const topic = topicLabel(o.focusArea);
    return (
      <OptionTile
        key={o.id}
        selected={pushbackId === o.id}
        onSelect={() => choose(o)}
        disabled={!canWrite}
        title={o.title}
        description={o.example ? <span style={{ fontStyle: 'italic' }}>{o.example}</span> : undefined}
        footer={
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {flag && <TileTag tone="warn">{flag}</TileTag>}
            {topic && <TileTag>{topic}</TileTag>}
            {o.species.length === 1 && <TileTag>{animalsLabel(o.species)}</TileTag>}
          </span>
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
        hint="Pick the objection the trainee has to work through."
      >
        <Group label="The kind of pushback">
          {showTeamGroup && <GroupHeading>Built in</GroupHeading>}
          <FitGrid min={210}>
            {options.builtIn.map((o) => (
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
          {showTeamGroup && (
            <>
              <GroupHeading>Your team’s objections</GroupHeading>
              <FitGrid min={210}>
                {options.team.map((o) => teamTile(o))}
                {offPicker &&
                  teamTile(
                    {
                      id: offPicker.id,
                      title: offPicker.title,
                      example: offPicker.example,
                      builtIn: false,
                      species: [...offPicker.species],
                      focusArea: offPicker.focusArea,
                    },
                    offPicker.visible ? `For ${animalsInSentence(offPicker.species)} only` : 'Retired',
                  )}
              </FitGrid>
            </>
          )}
          <div style={{ marginTop: 10, display: 'grid' }}>
            <OptionTile
              compact
              selected={pushbackId === 'custom'}
              onSelect={() => choose({ id: 'custom', focusArea: null })}
              disabled={!canWrite}
              glyph={<span aria-hidden>✎</span>}
              title={pushbackTitle('custom')}
              description={pushbackExample('custom', species)}
            />
          </div>
        </Group>

        <ObjectionNote check={check} species={species} />

        {focusNote && pushbackId && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: 12.5,
              color: COLOR.inkSoft,
            }}
          >
            <span>Knowledge topic set to {topicLabel(focusNote) ?? focusNote} to match this objection.</span>
            {canWrite && (
              <button
                type="button"
                style={linkButton}
                onClick={() => {
                  patch({ focus_area: null });
                  setFocusNote(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}

        {(canAddObjection || options.hiddenForSpecies > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {canAddObjection && (
              <Button size="sm" tone="secondary" onClick={() => setEditorOpen(true)}>
                + New objection
              </Button>
            )}
            <Caption>
              {canAddObjection ? 'Not here? Add it for your whole team — a new subject like probiotics, say. ' : ''}
              {options.hiddenForSpecies > 0 &&
                `${options.hiddenForSpecies} of your team’s objections ${
                  options.hiddenForSpecies === 1 ? 'is' : 'are'
                } only for ${species === 'cat' ? 'dogs' : 'cats'}, so ${
                  options.hiddenForSpecies === 1 ? 'it isn’t' : 'they aren’t'
                } shown here.`}
            </Caption>
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
          <ObjectionEditor
            open={editorOpen}
            onClose={() => setEditorOpen(false)}
            defaultSpecies={[species]}
            canWrite={canWrite}
            onSaved={(saved) => choose(saved)}
          />
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
          objection above — or restore it from “Recently deleted” on the Objections tab.
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
          another objection, or add {species === 'cat' ? 'cats' : 'dogs'} to it on the Objections tab.
        </InlineAlert>
      );
    case 'retired':
      return (
        <InlineAlert tone="warn" title={`“${check.title}” is retired`}>
          This scenario still plays, but the objection isn’t offered for new scenarios any more. Pick
          another, or reactivate it on the Objections tab.
          {!check.fits && ` It’s also set up for ${animalsInSentence(check.species)} only.`}
        </InlineAlert>
      );
    default:
      return null;
  }
}
