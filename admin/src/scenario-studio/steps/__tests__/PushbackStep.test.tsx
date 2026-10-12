import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { PushbackStep } from '../PushbackStep';
import { emptyAdminDraft } from '../../studioModel';
import type { StepProps } from '../../types';
import { NO_OBJECTIONS, ObjectionsProvider } from '../../objections/ObjectionsContext';
import type { ObjectionsApi } from '../../objections/useObjections';
import type { AdminObjection } from '../../../../../src/shared/scenarios/objections';
import { renderStep } from './harness';

function objection(over: Partial<AdminObjection> & Pick<AdminObjection, 'id' | 'title'>): AdminObjection {
  return {
    example: '“A line the owner says.”',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    focusArea: null,
    coaching: {},
    visible: true,
    sortOrder: null,
    updatedAt: '2026-10-10T10:00:00Z',
    createdAt: '2026-10-10T10:00:00Z',
    deletedAt: null,
    usage: { scenarios: 0, live: 0, trainee: 0 },
    ...over,
  };
}

const PRO = objection({ id: 'team:probiotics', title: 'Probiotics: not needed', focusArea: 'gi' });
const BORED = objection({ id: 'team:cat-bored', title: 'Cat gets bored', species: ['cat'] });
const OLD = objection({ id: 'team:old', title: 'Old objection', visible: false });

function api(over: Partial<ObjectionsApi> = {}): ObjectionsApi {
  return {
    ...NO_OBJECTIONS,
    status: 'ready',
    loaded: true,
    available: true,
    loadedAt: 1,
    objections: [PRO, BORED, OLD],
    deleted: [objection({ id: 'team:gone', title: 'Gone objection', deletedAt: '2026-10-11T00:00:00Z' })],
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

describe('PushbackStep', () => {
  it('seven tiles, each with the line an owner would say', () => {
    const { patchSpy } = renderStep(PushbackStep);
    const group = screen.getByRole('group', { name: 'The kind of pushback' });
    expect(group.querySelectorAll('button')).toHaveLength(7);
    const cost = screen.getByRole('button', { name: /Cost \/ price pushback/ });
    expect(cost).toHaveTextContent('too expensive');
    fireEvent.click(cost);
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: 'cost' });
    expect(cost).toHaveAttribute('aria-pressed', 'true');
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

  // ── Team objections ──

  it('offers the team’s objections for the animal, apart from the built-ins', () => {
    renderStep(withObjections(api()), { draft: { ...emptyAdminDraft('admin:t'), species: 'cat' } });
    const group = screen.getByRole('group', { name: 'The kind of pushback' });
    expect(within(group).getByText('Built in')).toBeInTheDocument();
    expect(within(group).getByText('Your team’s objections')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Probiotics: not needed/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Cat gets bored/ })).toBeInTheDocument();
    // Retired ones are never offered.
    expect(within(group).queryByRole('button', { name: /Old objection/ })).not.toBeInTheDocument();
  });

  it('leaves a cat-only objection out of a dog scenario, and says why', () => {
    renderStep(withObjections(api()));
    expect(screen.queryByRole('button', { name: /Cat gets bored/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 of your team’s objections is only for cats, so it isn’t shown here/)).toBeInTheDocument();
  });

  it('picking a team objection also points an empty scenario at its knowledge topic — with an Undo', () => {
    const { patchSpy } = renderStep(withObjections(api()));
    fireEvent.click(screen.getByRole('button', { name: /Probiotics: not needed/ }));
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: PRO.id, focus_area: 'gi' });
    expect(screen.getByText('Knowledge topic set to Digestive health (GI) to match this objection.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(patchSpy).toHaveBeenLastCalledWith({ focus_area: null });
    expect(screen.queryByText(/Knowledge topic set to/)).not.toBeInTheDocument();
  });

  it('never overwrites knowledge the admin already chose', () => {
    const { patchSpy } = renderStep(withObjections(api()), {
      draft: { ...emptyAdminDraft('admin:t'), knowledge_slugs: ['study:a'] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Probiotics: not needed/ }));
    expect(patchSpy).toHaveBeenCalledWith({ pushback_id: PRO.id });
    expect(screen.queryByText(/Knowledge topic set to/)).not.toBeInTheDocument();
  });

  it('says when the scenario’s objection was deleted, retired, or is for the other animal', () => {
    const { outside } = renderStep(withObjections(api()), {
      draft: { ...emptyAdminDraft('admin:t'), pushback_id: 'team:gone' },
    });
    expect(screen.getByText('This scenario’s objection was deleted')).toBeInTheDocument();
    expect(screen.getByText(/“Gone objection” no longer exists/)).toBeInTheDocument();

    outside({ pushback_id: OLD.id });
    expect(screen.getByText('“Old objection” is retired')).toBeInTheDocument();
    // Still shown (selected) so the admin sees what the scenario uses.
    expect(screen.getByRole('button', { name: /Old objection/ })).toHaveAttribute('aria-pressed', 'true');

    outside({ pushback_id: BORED.id });
    expect(screen.getByText('“Cat gets bored” isn’t set up for a dog')).toBeInTheDocument();
  });

  it('adds a new objection from the step and picks it once it is saved', async () => {
    const saved = objection({ id: 'team:yogurt', title: 'Yogurt is enough', species: ['cat'], focusArea: 'gi' });
    const save = vi.fn(async () => saved);
    const { patchSpy } = renderStep(withObjections(api({ save })), {
      draft: { ...emptyAdminDraft('admin:t'), species: 'cat' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ New objection' }));
    const dialog = await screen.findByRole('dialog', { name: 'New objection' });
    // A new objection starts for the scenario's animal.
    expect(within(dialog).getByRole('button', { name: /Cats/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: /Dogs/ })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Yogurt is enough' } });
    fireEvent.change(within(dialog).getByLabelText('What an owner typically says'), {
      target: { value: '“A spoon of yogurt does the same.”' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]).toEqual([
      expect.objectContaining({ title: 'Yogurt is enough', species: ['cat'], visible: true }),
      undefined,
    ]);
    expect((save.mock.calls[0] as unknown[])[0]).not.toHaveProperty('id');
    await waitFor(() => expect(patchSpy).toHaveBeenCalledWith({ pushback_id: 'team:yogurt', focus_area: 'gi' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers no "+ New objection" without the database update, or read-only', () => {
    renderStep(withObjections(api({ available: false, missingTable: true, objections: [] })));
    expect(screen.queryByRole('button', { name: '+ New objection' })).not.toBeInTheDocument();
  });
});
