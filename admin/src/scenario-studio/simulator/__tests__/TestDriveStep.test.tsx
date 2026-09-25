/**
 * The Test drive step as the editor shell mounts it: simulator + the
 * "What you're testing" / "How to test well" side panel + the trainee-app
 * frame.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TestDriveProps } from '../../types';
import type { StudioDraft } from '../../studioModel';

vi.mock('../../api', () => ({ simulateCustomerTurn: vi.fn(), simulateScore: vi.fn() }));

// eslint-disable-next-line import/first
import { TestDriveStep, summariseDraft } from '../../steps/TestDriveStep';

const DRAFT: StudioDraft = {
  scenario_id: 'admin:td',
  species: 'cat',
  breed: 'Maine Coon',
  life_stage: 'Puppy (<1)',
  weight_kg: 3.2,
  pushback_id: 'weight-denial',
  pushback_notes: 'She’s just fluffy, not fat.',
  suggested_driver: 'Harmonizer',
  persona_override: 'Devoted',
  difficulty_override: 3,
  focus_area: 'weight',
  knowledge_slugs: null,
  prompt_prefix: null,
  prompt_suffix: 'Stay polite.',
};

function props(overrides: Partial<TestDriveProps> = {}): TestDriveProps {
  return {
    draft: DRAFT,
    patch: vi.fn(),
    source: 'admin',
    canWrite: true,
    base: null,
    ctx: { source: 'admin', tested: false, missingSlugs: [], unindexedTitles: [], notRoleplayTitles: [] },
    goTo: vi.fn(),
    askAssistant: vi.fn(),
    knowledge: { docs: [], loading: false, error: null, refetch: vi.fn() },
    scenarioId: 'admin:td',
    onTested: vi.fn(),
    ...overrides,
  };
}

describe('TestDriveStep', () => {
  it('summarises what is being tested in plain words (species-aware)', () => {
    const rows = summariseDraft(DRAFT);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Pet).toBe('🐈 Maine Coon · Kitten (<1) · 3.2 kg');
    expect(byLabel.Pushback).toBe('Weight / obesity denial — “She’s just fluffy, not fat.”');
    expect(byLabel.Owner).toBe('Harmonizer · Devoted · difficulty 3 of 4 (Hostile)');
    expect(byLabel['Opening line']).toBe('The AI writes its own');
    expect(byLabel.Knowledge).toBe('One topic: Weight management');
    expect(byLabel['AI brief']).toBe('Standard briefing + your final reminders');
  });

  it('flags what is missing and says when the whole library is used', () => {
    const rows = summariseDraft({ knowledge_slugs: ['a', 'b'] });
    const pet = rows.find((r) => r.label === 'Pet')!;
    expect(pet.value).toBe('Not set yet');
    expect(pet.needs).toBe('Needs a breed and a life stage');
    expect(rows.find((r) => r.label === 'Pushback')!.needs).toBe('Needs a pushback');
    expect(rows.find((r) => r.label === 'Owner')!.needs).toBe('Needs the owner’s ECHO driver');
    // A complete draft needs nothing.
    expect(summariseDraft(DRAFT).every((r) => r.needs === undefined)).toBe(true);
    expect(rows.find((r) => r.label === 'Knowledge')!.value).toBe('2 chosen documents');
    expect(summariseDraft({}).find((r) => r.label === 'Knowledge')!.value).toBe('The whole knowledge library');
    expect(summariseDraft({}).find((r) => r.label === 'AI brief')!.value).toBe('Standard briefing only');
  });

  it('renders the simulator, the side panel, and edit links to each step', async () => {
    const p = props();
    const user = userEvent.setup();
    render(<TestDriveStep {...p} />);

    expect(screen.getByRole('button', { name: 'Start the conversation' })).toBeInTheDocument();
    const aside = screen.getByRole('complementary', { name: 'About this test' });
    expect(within(aside).getByText('What you’re testing')).toBeInTheDocument();
    expect(within(aside).getByText('How to test well')).toBeInTheDocument();

    await user.click(within(aside).getByRole('button', { name: 'Edit ai brief (AI brief step)' }));
    expect(p.goTo).toHaveBeenCalledWith('brief');
  });

  it('opens the trainee app in a phone frame', async () => {
    const user = userEvent.setup();
    render(<TestDriveStep {...props()} />);
    expect(screen.queryByTitle('Trainee app preview')).not.toBeInTheDocument();

    const aside = screen.getByRole('complementary', { name: 'About this test' });
    await user.click(within(aside).getByRole('button', { name: 'Open in the trainee app' }));
    expect(screen.getByRole('dialog', { name: 'Open in the trainee app' })).toBeInTheDocument();
    expect(screen.getByTitle('Trainee app preview')).toHaveAttribute('src', '/?pbt_preview=1');
  });
});
