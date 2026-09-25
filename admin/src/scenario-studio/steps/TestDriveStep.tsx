/**
 * Step 6 — Test drive.
 *
 * The admin has a real conversation with the AI owner before trainees do
 * (the Simulator: real `ai-roleplay` + `ai-evaluate`, preview mode, nothing
 * recorded), or opens the trainee app itself in a phone frame for voice.
 * The side panel says, in plain words, what is being tested and how to test
 * it well.
 *
 * The editor shell renders the step heading; this renders the body only.
 */
import { useState, type ReactNode } from 'react';
import { STUDIO_STEP_LABELS } from '../../../../src/shared/ai/scenarioAgent';
import { focusAreaLabel } from '../../../../src/shared/knowledge/focusAreas';
import { DIFFICULTY_LABELS, PUSHBACK_LABELS } from '../../../../src/shared/scenarios/enums';
import { missingScenarioFields } from '../../../../src/shared/scenarios/draftToScenario';
import { lifeStageLabel, speciesOf } from '../../../../src/shared/scenarios/species';
import { Glass } from '../../primitives';
import { Button } from '../../primitives/form';
import { COLOR, RADIUS } from '../../lib/tokens';
import { Kicker, SPECIES_GLYPH } from '../ui';
import { hasText, type StudioDraft, type StudioStepKey } from '../studioModel';
import type { TestDriveProps } from '../types';
import { Simulator } from '../simulator/Simulator';
import { TrainerAppFrame } from '../simulator/TrainerAppFrame';
import { MISSING_FIELD_PHRASE, MISSING_FIELD_STEP, joinList } from '../simulator/simulatorModel';

export function TestDriveStep({ draft, scenarioId, onTested, goTo }: TestDriveProps) {
  const [appOpen, setAppOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      {/* Side by side from ~1000 px of step width; stacks (simulator first) below. */}
      <div style={{ flex: '999 1 640px', minWidth: 0 }}>
        <Simulator
          draft={draft}
          scenarioId={scenarioId}
          onTested={onTested}
          goTo={goTo}
          onOpenTraineeApp={() => setAppOpen(true)}
        />
      </div>

      <aside
        aria-label="About this test"
        style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 14 }}
      >
        <WhatYoureTesting draft={draft} goTo={goTo} />
        <HowToTestWell />
        <VoiceCard onOpen={() => setAppOpen(true)} />
      </aside>

      <TrainerAppFrame
        open={appOpen}
        onClose={() => setAppOpen(false)}
        draft={draft}
        scenarioId={scenarioId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Side panel
// ─────────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Glass padding="16px 18px" radius={RADIUS.lg}>
      <section style={{ display: 'grid', gap: 12 }}>
        <Kicker>{title}</Kicker>
        {children}
      </section>
    </Glass>
  );
}

const NOT_SET = 'Not set yet';

/** The draft, summarised in plain words, one row per step it came from. */
export function summariseDraft(draft: StudioDraft): Array<{
  step: StudioStepKey;
  label: string;
  value: string;
  /** What this row still needs before the owner can talk ("Needs a breed"). */
  needs?: string;
}> {
  const species = speciesOf(draft.species);
  // Same test the simulator's blocked state uses, so the two never disagree.
  const missing = missingScenarioFields(draft);
  const needs = (step: StudioStepKey): string | undefined => {
    const fields = missing.filter((f) => MISSING_FIELD_STEP[f] === step);
    return fields.length
      ? `Needs ${joinList(fields.map((f) => MISSING_FIELD_PHRASE[f] ?? f.toLowerCase()))}`
      : undefined;
  };
  const petBits = [
    hasText(draft.breed) ? draft.breed!.trim() : null,
    hasText(draft.life_stage) ? lifeStageLabel(draft.life_stage, draft.species) : null,
    typeof draft.weight_kg === 'number' && draft.weight_kg > 0 ? `${draft.weight_kg} kg` : null,
  ].filter(Boolean);

  const pushback = hasText(draft.pushback_id)
    ? PUSHBACK_LABELS[draft.pushback_id!] ?? draft.pushback_id!
    : null;
  const inWords = hasText(draft.pushback_notes) ? ` — “${clip(draft.pushback_notes!, 90)}”` : '';

  const difficulty = draft.difficulty_override ?? 2;
  const ownerBits = [
    hasText(draft.suggested_driver) ? draft.suggested_driver : null,
    hasText(draft.persona_override) ? draft.persona_override : 'Skeptical',
    `difficulty ${difficulty} of 4 (${DIFFICULTY_LABELS[difficulty] ?? 'Skeptical'})`,
  ].filter(Boolean);

  const slugs = (draft.knowledge_slugs ?? []).filter((s) => hasText(s));
  const knowledge =
    slugs.length > 0
      ? `${slugs.length} chosen document${slugs.length === 1 ? '' : 's'}`
      : hasText(draft.focus_area)
        ? `One topic: ${focusAreaLabel(draft.focus_area)}`
        : 'The whole knowledge library';

  const notes = [
    hasText(draft.prompt_prefix) && 'opening notes',
    hasText(draft.prompt_suffix) && 'final reminders',
  ].filter(Boolean) as string[];
  const brief = notes.length
    ? `Standard briefing + your ${notes.join(' and ')}`
    : 'Standard briefing only';

  return [
    {
      step: 'pet',
      label: 'Pet',
      value: petBits.length ? `${SPECIES_GLYPH[species]} ${petBits.join(' · ')}` : NOT_SET,
      needs: needs('pet'),
    },
    {
      step: 'pushback',
      label: 'Pushback',
      value: pushback ? `${pushback}${inWords}` : NOT_SET,
      needs: needs('pushback'),
    },
    {
      step: 'customer',
      label: 'Owner',
      value: ownerBits.join(' · '),
      needs: needs('customer'),
    },
    {
      step: 'customer',
      label: 'Opening line',
      value: hasText(draft.opening_line_override)
        ? `“${clip(draft.opening_line_override!, 90)}”`
        : 'The AI writes its own',
    },
    { step: 'knowledge', label: 'Knowledge', value: knowledge },
    { step: 'brief', label: 'AI brief', value: brief },
  ];
}

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function WhatYoureTesting({ draft, goTo }: { draft: StudioDraft; goTo: (s: StudioStepKey) => void }) {
  const rows = summariseDraft(draft);
  return (
    <Panel title="What you’re testing">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {rows.map((r) => (
          <li key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.inkMute }}>{r.label}</div>
              <div
                style={{
                  marginTop: 1,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: r.value === NOT_SET ? COLOR.inkMute : COLOR.ink,
                  fontWeight: 500,
                  overflowWrap: 'anywhere',
                }}
              >
                {r.value}
              </div>
              {r.needs && (
                <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: COLOR.danger }}>
                  {r.needs}
                </div>
              )}
            </div>
            <button
              type="button"
              className="pbt-focusable"
              onClick={() => goTo(r.step)}
              aria-label={`Edit ${r.label.toLowerCase()} (${STUDIO_STEP_LABELS[r.step]} step)`}
              style={{
                flexShrink: 0,
                padding: '2px 4px',
                border: 'none',
                background: 'none',
                color: COLOR.brand,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--pbt-font)',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function HowToTestWell() {
  const tips: Array<{ title: string; body: string }> = [
    {
      title: 'Try a weak answer first',
      body: 'Brush the objection off. The owner should stay firm — a scenario that folds straight away teaches nothing.',
    },
    {
      title: 'Then acknowledge and clarify',
      body: 'Name the worry, then ask about it. The owner should soften as they feel heard.',
    },
    {
      title: 'Aim for a next step',
      body: 'A good test ends with the owner agreeing to something — a trial bag, a weigh-in, a follow-up call.',
    },
  ];
  return (
    <Panel title="How to test well">
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {tips.map((t, i) => (
          <li key={t.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                color: COLOR.brand,
                background: COLOR.brandSoft,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: COLOR.inkSoft }}>
              <strong style={{ color: COLOR.ink, fontWeight: 700 }}>{t.title}.</strong> {t.body}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function VoiceCard({ onOpen }: { onOpen: () => void }) {
  return (
    <Panel title="Voice & the real app">
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: COLOR.inkSoft }}>
        Want to hear the owner, or see exactly what trainees see? Open this scenario in the trainee
        app — voice included. Nothing is recorded there either.
      </p>
      <div>
        <Button onClick={onOpen}>Open in the trainee app</Button>
      </div>
    </Panel>
  );
}
