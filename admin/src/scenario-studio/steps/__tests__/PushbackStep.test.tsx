import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PushbackStep } from '../PushbackStep';
import { emptyAdminDraft } from '../../studioModel';
import type { StepProps } from '../../types';
import { NO_OBJECTIONS, ObjectionsProvider } from '../../objections/ObjectionsContext';
import type { ObjectionsApi } from '../../objections/useObjections';
import type { AdminObjection } from '../../../../../src/shared/scenarios/objections';
import type { AdminObjectionCategory } from '../../../../../src/shared/scenarios/objectionCategories';
import { builtInAdminCategories } from '../../objections/categoriesModel';
import { renderStep } from './harness';

const PROBIOTICS = 'category:probiotics';

function objection(over: Partial<AdminObjection> & Pick<AdminObjection, 'id' | 'title'>): AdminObjection {
  return {
    example: '“A line the owner says.”',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    categoryId: PROBIOTICS,
    coaching: {},
    coachingFr: {},
    visible: true,
    sortOrder: null,
    updatedAt: '2026-10-10T10:00:00Z',
    createdAt: '2026-10-10T10:00:00Z',
    deletedAt: null,
    usage: { scenarios: 0, live: 0, trainee: 0 },
    ...over,
  };
}

const PRO = objection({ id: 'team:probiotics', title: 'Probiotics: not needed' });
const BORED = objection({ id: 'team:cat-bored', title: 'Cat gets bored', species: ['cat'], categoryId: 'everyday-nutrition' });
const OLD = objection({ id: 'team:old', title: 'Old objection', visible: false });

const PROBIOTICS_CATEGORY: AdminObjectionCategory = {
  id: PROBIOTICS,
  name: 'Probiotics',
  nameFr: null,
  description: 'Owners who doubt a daily probiotic.',
  focusArea: 'gi',
  knowledgeSlugs: ['study:a'],
  sortOrder: 40,
  builtIn: false,
  updatedAt: '2026-10-10T00:00:00Z',
  createdAt: '2026-10-10T00:00:00Z',
  deletedAt: null,
  customised: false,
  usage: { objections: 2, scenarios: 0 },
};

function api(over: Partial<ObjectionsApi> = {}): ObjectionsApi {
  return {
    ...NO_OBJECTIONS,
    status: 'ready',
    loaded: true,
    available: true,
    loadedAt: 1,
    objections: [PRO, BORED, OLD],
    deleted: [objection({ id: 'team:gone', title: 'Gone objection', deletedAt: '2026-10-11T00:00:00Z' })],
    categories: [...builtInAdminCategories(), PROBIOTICS_CATEGORY],
    ...over,
  };
}

/** The step inside the Studio's objections context. */
function withObjections(value: ObjectionsApi) {
  return function Wrapped(props: StepProps) {
    return (
      <ObjectionsProvider value={value}>
        <PushbackStep {...props} />
      </ObjectionsProvider>
    );
  };
}

const chip = (name: RegExp | string) => within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name });

describe('PushbackStep', () => {
  it('category first: chips for the subjects, then that category’s objections with the owner’s line', () => {
    const { patchSpy } = renderStep(PushbackStep);
    const chips = within(screen.getByRole('group', { name: 'Category' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent?.replace(/\d+$/, ''))).toEqual([
      'Everyday nutrition',
      'Weight management',
      'Prescription diets',
    ]);
    // The first is selected; its four built-ins + "Something else" are offered.
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    const group = screen.getByRole('group', { name: 'The kind of pushback' });
    expect(group.querySelectorAll('button')).toHaveLength(5);
    const cost = screen.getByRole('button', { name: /Cost \/ price pushback/ });
    expect(cost).toHaveTextContent('too expensive');
    fireEvent.click(cost);
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: 'cost' });
    expect(cost).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip(/Weight management/));
    expect(chip(/Weight management/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Weight \/ obesity denial/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cost \/ price pushback/ })).not.toBeInTheDocument();
    // Choosing a chip changes nothing in the scenario by itself.
    expect(patchSpy).toHaveBeenCalledTimes(1);
  });

  it('pre-selects the category of the scenario’s objection', () => {
    renderStep(PushbackStep, { draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'rx-diet' } });
    expect(chip(/Prescription diets/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Skepticism on Rx diet/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the category a new scenario was started from — until it has an objection', () => {
    const StartedFromWeight = (p: StepProps) => <PushbackStep {...p} initialCategoryId="weight" />;
    const { patchSpy } = renderStep(StartedFromWeight);
    expect(chip(/Weight management/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Weight \/ obesity denial/ })).toBeInTheDocument();
    // Nothing is picked for the admin.
    expect(patchSpy).not.toHaveBeenCalled();
    // Picking an objection in another category moves the chips with it.
    fireEvent.click(chip(/Prescription diets/));
    fireEvent.click(screen.getByRole('button', { name: /Skepticism on Rx diet/ }));
    expect(chip(/Prescription diets/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('a scenario that already has an objection opens on its own category, whatever it was started from', () => {
    const StartedFromWeight = (p: StepProps) => <PushbackStep {...p} initialCategoryId="weight" />;
    renderStep(StartedFromWeight, { draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'rx-diet' } });
    expect(chip(/Prescription diets/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('the example speaks about the right animal', () => {
    renderStep(PushbackStep, { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    expect(screen.getByRole('button', { name: /Switching brands/ })).toHaveTextContent('My cat already eats fine');
  });

  it('"Something else" makes the owner’s words required', () => {
    const { patchSpy } = renderStep(PushbackStep);
    expect(screen.getByLabelText('Anything specific they say')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Something else/ }));
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: 'custom' });
    const notes = screen.getByLabelText('What exactly are they objecting to?');
    expect(screen.getByText(/Needed for “Something else”/)).toBeInTheDocument();
    fireEvent.change(notes, { target: { value: 'No medication, ever.' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ pushback_notes: 'No medication, ever.' });
  });

  it('backstory is optional free text with guidance', () => {
    const { patchSpy } = renderStep(PushbackStep);
    const box = screen.getByLabelText('The situation');
    expect(screen.getByText(/The pet’s name, age, weight or body condition/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'Bella is 6.' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ context_override: 'Bella is 6.' });
  });

  it('the assistant buttons hand over their prompts', () => {
    const { props } = renderStep(PushbackStep, {
      draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'cost' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Write a backstory for me/ }));
    expect(props.askAssistant).toHaveBeenCalledWith('Write a backstory for me');
    fireEvent.click(screen.getByRole('button', { name: /Put it in the owner’s words/ }));
    expect(props.askAssistant).toHaveBeenLastCalledWith('Put the pushback in the owner’s words');
  });

  it('an old saved title can be cleared, and is invisible when there is none', () => {
    const { patchSpy } = renderStep(PushbackStep, {
      draft: { ...emptyAdminDraft('admin:t'), title_override: 'Old title' },
    });
    expect(screen.getByText(/An old title is still saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear old title' }));
    expect(patchSpy).toHaveBeenCalledWith({ title_override: null });
    expect(screen.queryByText(/An old title is still saved/)).not.toBeInTheDocument();
  });

  it('read-only disables every control', () => {
    renderStep(PushbackStep, {
      canWrite: false,
      draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'cost', title_override: 'Old' },
    });
    expect(screen.getByRole('button', { name: /Cost \/ price pushback/ })).toBeDisabled();
    expect(screen.getByLabelText('Anything specific they say')).toBeDisabled();
    expect(screen.getByLabelText('The situation')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear old title' })).toBeDisabled();
  });

  // ── Categories and team objections ──

  it('offers a team category when it holds an objection for the animal, with its knowledge said once', () => {
    renderStep(withObjections(api()), { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    fireEvent.click(chip(/Probiotics/));
    const group = screen.getByRole('group', { name: 'The kind of pushback' });
    expect(within(group).getByRole('button', { name: /Probiotics: not needed/ })).toBeInTheDocument();
    // Retired ones are never offered.
    expect(within(group).queryByRole('button', { name: /Old objection/ })).not.toBeInTheDocument();
    expect(screen.getByText('Scenarios in Probiotics read its knowledge: 1 document · Digestive health (GI).')).toBeInTheDocument();
  });

  it('puts a team objection beside the built-ins of its category', () => {
    renderStep(withObjections(api()), { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    const group = screen.getByRole('group', { name: 'The kind of pushback' });
    expect(within(group).getByText('Built in')).toBeInTheDocument();
    expect(within(group).getByText('Your team’s objections')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Cat gets bored/ })).toBeInTheDocument();
  });

  it('leaves a cat-only objection out of a dog scenario, and says why', () => {
    renderStep(withObjections(api()));
    expect(screen.queryByRole('button', { name: /Cat gets bored/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('1 of the objections in Everyday nutrition is only for cats, so it isn’t shown here.'),
    ).toBeInTheDocument();
  });

  it('picking a team objection sets only the pushback — knowledge comes from its category', () => {
    const { patchSpy } = renderStep(withObjections(api()));
    fireEvent.click(chip(/Probiotics/));
    fireEvent.click(screen.getByRole('button', { name: /Probiotics: not needed/ }));
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: PRO.id });
    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Knowledge topic set to/)).not.toBeInTheDocument();
  });

  it('says when the scenario’s objection was deleted, retired, or is for the other animal', () => {
    const { outside } = renderStep(withObjections(api()), {
      draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'team:gone' },
    });
    expect(screen.getByText('This scenario’s objection was deleted')).toBeInTheDocument();
    expect(screen.getByText(/“Gone objection” no longer exists/)).toBeInTheDocument();
    expect(screen.getByText(/on the Categories tab/)).toBeInTheDocument();

    outside({ pushback_id: OLD.id });
    expect(screen.getByText('“Old objection” is retired')).toBeInTheDocument();
    // Its category is selected and it is still shown (selected) so the admin sees what the scenario uses.
    expect(chip(/Probiotics/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Old objection/ })).toHaveAttribute('aria-pressed', 'true');

    outside({ pushback_id: BORED.id });
    expect(screen.getByText('“Cat gets bored” isn’t set up for a dog')).toBeInTheDocument();
  });

  it('adds a new objection in the chosen category and picks it once it is saved', async () => {
    const saved = objection({ id: 'team:yogurt', title: 'Yogurt is enough', species: ['cat'] });
    const save = vi.fn(async () => saved);
    const { patchSpy } = renderStep(withObjections(api({ save })), {
      draft: { ...emptyAdminDraft('admin:t'), species: 'cat' },
    });
    fireEvent.click(chip(/Probiotics/));
    fireEvent.click(screen.getByRole('button', { name: '+ New objection in Probiotics' }));
    const dialog = await screen.findByRole('dialog', { name: 'New objection' });
    // A new objection starts for the scenario's animal, in the chosen category.
    expect(within(dialog).getByRole('button', { name: /Cats/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: /Dogs/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByLabelText('Category')).toHaveValue(PROBIOTICS);
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Yogurt is enough' } });
    fireEvent.change(within(dialog).getByLabelText('What an owner typically says'), {
      target: { value: '“A spoon of yogurt does the same.”' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]).toEqual([
      expect.objectContaining({ title: 'Yogurt is enough', species: ['cat'], categoryId: PROBIOTICS, visible: true }),
      undefined,
    ]);
    expect((save.mock.calls[0] as unknown[])[0]).not.toHaveProperty('id');
    expect((save.mock.calls[0] as unknown[])[0]).not.toHaveProperty('focusArea');
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith({ pushback_id: 'team:yogurt' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the category editor for a new category', async () => {
    renderStep(withObjections(api()));
    fireEvent.click(screen.getByRole('button', { name: '+ New category' }));
    const dialog = await screen.findByRole('dialog', { name: 'New category' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
  });

  it('offers no "+ New objection" or "+ New category" without the database update, or read-only', () => {
    renderStep(withObjections(api({ available: false, missingTable: true, objections: [] })));
    expect(screen.queryByRole('button', { name: /\+ New objection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New category' })).not.toBeInTheDocument();
  });
});
