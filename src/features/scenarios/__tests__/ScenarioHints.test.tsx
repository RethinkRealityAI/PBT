import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_SCENARIOS, type Scenario } from '../../../data/scenarios';
import { PUSHBACK_KNOWLEDGE } from '../../../data/knowledge/pushbackTaxonomy';
import type { FlagSnapshot } from '../../../services/flagsClient';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import { adaptPetWords } from '../../../shared/scenarios/species';

let flagSnapshot: FlagSnapshot | null = null;

vi.mock('../../../app/providers/FlagProvider', async () => {
  const actual = await vi.importActual<typeof import('../../../app/providers/FlagProvider')>(
    '../../../app/providers/FlagProvider',
  );
  return {
    ...actual,
    useFlags: () => ({
      snapshot: flagSnapshot,
      preview: null,
      ready: true,
      refresh: async () => {},
      getFlag: <T,>(_key: string, fallback: T) => fallback,
      getOverride: () => null,
      getSimulationConfig: () => null,
    }),
  };
});

import { ScenarioHints, scenarioHintCues } from '../ScenarioHints';

const PROBIOTICS: TeamObjection = {
  id: 'team:probiotics',
  title: 'Probiotics',
  example: '"He eats fine."',
  titleFr: null,
  exampleFr: null,
  species: ['dog', 'cat'],
  categoryId: 'category:gi',
  coaching: {
    acknowledgePatterns: ['It makes sense to question adding something new.', 'Second ack', 'Third ack'],
    clarifyQuestions: ['What have you noticed about his stools lately?'],
    // takeActionPatterns left empty on purpose → generic fallback
  },
  visible: true,
  sortOrder: null,
  updatedAt: null,
};

const teamScenario = (species?: 'cat'): Scenario => ({
  ...SEED_SCENARIOS[0],
  ...(species ? { species } : {}),
  pushback: { id: PROBIOTICS.id, title: PROBIOTICS.title, example: PROBIOTICS.example },
});

beforeEach(() => {
  flagSnapshot = { flags: {}, scenarioOverrides: [], objections: [PROBIOTICS], fetchedAt: 0 };
});

describe('ScenarioHints — team objections', () => {
  it("shows the team's own coaching, two cues per group", () => {
    render(<ScenarioHints scenario={teamScenario()} />);
    expect(screen.getByText('It makes sense to question adding something new.')).toBeInTheDocument();
    expect(screen.getByText('Second ack')).toBeInTheDocument();
    expect(screen.queryByText('Third ack')).toBeNull();
    expect(screen.getByText('What have you noticed about his stools lately?')).toBeInTheDocument();
  });

  it('falls back to the generic "Other pushback" cues for a group the team left empty', () => {
    const cues = scenarioHintCues(teamScenario(), 'en', [PROBIOTICS]);
    expect(cues?.takeAction).toEqual(PUSHBACK_KNOWLEDGE.custom.takeActionPatterns);
    expect(cues?.acknowledge[0]).toBe('It makes sense to question adding something new.');
  });

  it('re-words only the CANNED fallback for a cat — never the team-written cues', () => {
    const cues = scenarioHintCues(teamScenario('cat'), 'en', [PROBIOTICS]);
    expect(cues?.takeAction).toEqual(
      PUSHBACK_KNOWLEDGE.custom.takeActionPatterns.map((s) => adaptPetWords(s, 'cat')),
    );
    expect(cues?.clarify).toEqual(['What have you noticed about his stools lately?']);
  });

  it('uses the generic cues entirely when the snapshot no longer carries the objection', () => {
    flagSnapshot = { flags: {}, scenarioOverrides: [], fetchedAt: 0 };
    const cues = scenarioHintCues(teamScenario(), 'en', []);
    expect(cues?.acknowledge).toEqual(PUSHBACK_KNOWLEDGE.custom.acknowledgePatterns);
    render(<ScenarioHints scenario={teamScenario()} />);
    expect(
      screen.getByText(PUSHBACK_KNOWLEDGE.custom.acknowledgePatterns[0]),
    ).toBeInTheDocument();
  });

  it('leaves built-in pushbacks on the taxonomy', () => {
    const cues = scenarioHintCues(SEED_SCENARIOS[0], 'en', [PROBIOTICS]);
    const pb = PUSHBACK_KNOWLEDGE[SEED_SCENARIOS[0].pushback.id];
    expect(cues?.acknowledge).toEqual(pb.acknowledgePatterns);
    expect(cues?.clarify).toEqual(pb.clarifyQuestions);
  });
});
