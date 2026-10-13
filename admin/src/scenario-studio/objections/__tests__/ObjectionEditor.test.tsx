/**
 * The objection editor's French hint lists: the three trainee-hint boxes in
 * the "French version" section, the "seen in English" note, and what a save
 * sends (`coachingFr`, an explicit `{}` when cleared). The store is a stub
 * provided through `ObjectionsProvider`; the editor and its model are real.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ObjectionEditor } from '../ObjectionEditor';
import { NO_OBJECTIONS, ObjectionsProvider } from '../ObjectionsContext';
import type { ObjectionsApi } from '../useObjections';
import { AccessProvider } from '../../../primitives/access';
import { ToastProvider } from '../../../primitives/Toast';
import { ConfirmProvider } from '../../../primitives/Confirm';
import type { AdminObjection } from '../../../../../src/shared/scenarios/objections';

const NOTE = 'French trainees will see these hints in English until you add French versions.';

function objection(over: Partial<AdminObjection> = {}): AdminObjection {
  return {
    id: 'team:probiotics-not-needed',
    title: 'Probiotics: not needed',
    example: '“Why would he need them?”',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    categoryId: 'everyday-nutrition',
    coaching: {},
    coachingFr: {},
    visible: true,
    sortOrder: null,
    updatedAt: '2026-10-10T10:00:00Z',
    createdAt: '2026-10-09T10:00:00Z',
    deletedAt: null,
    usage: { scenarios: 0, live: 0, trainee: 0 },
    ...over,
  };
}

function renderEditor(o: AdminObjection, save = vi.fn(async (body: Record<string, unknown>) => ({ ...o, ...body }) as AdminObjection)) {
  const api: ObjectionsApi = {
    ...NO_OBJECTIONS,
    status: 'ready' as ObjectionsApi['status'],
    objections: [o],
    loaded: true,
    available: true,
    save: save as unknown as ObjectionsApi['save'],
  };
  render(
    <AccessProvider permissions={['scenarios.read', 'scenarios.write']}>
      <ToastProvider>
        <ConfirmProvider>
          <ObjectionsProvider value={api}>
            <ObjectionEditor open onClose={() => {}} objection={o} canWrite />
          </ObjectionsProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AccessProvider>,
  );
  return { save, dialog: screen.getByRole('dialog', { name: 'Edit objection' }) };
}

describe('ObjectionEditor — French hint lists', () => {
  it('opens the French section on stored French hints and fills the three boxes', () => {
    const { dialog } = renderEditor(
      objection({
        coaching: { acknowledgePatterns: ['Fair question.'] },
        coachingFr: { acknowledgePatterns: ['Bonne question.', 'C’est logique.'] },
      }),
    );
    const ack = within(dialog).getByLabelText(/Good ways to acknowledge it \(French\)/);
    expect(ack).toHaveValue('Bonne question.\nC’est logique.');
    expect(ack).toHaveAttribute('lang', 'fr-CA');
    expect(within(dialog).getByLabelText(/Good questions to ask \(French\)/)).toHaveValue('');
    expect(within(dialog).getByLabelText(/Good next steps to offer \(French\)/)).toHaveValue('');
    // Every English hint group with lines has a French version: no note.
    expect(within(dialog).queryByText(NOTE)).not.toBeInTheDocument();
    // The AI-only lists have no French box.
    expect(within(dialog).queryByLabelText(/really worried about \(French\)/)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Common mistakes \(French\)/)).not.toBeInTheDocument();
  });

  it('says French trainees see English hints until French ones are added, and the note goes once they are', () => {
    const { dialog } = renderEditor(objection({ coaching: { clarifyQuestions: ['What changed?'] } }));
    // No French yet: the section starts folded — open it.
    fireEvent.click(within(dialog).getByRole('button', { name: /French version/ }));
    expect(within(dialog).getByText(NOTE)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Good questions to ask \(French\)/), {
      target: { value: 'Qu’est-ce qui a changé?' },
    });
    expect(within(dialog).queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('saves the French lists as coachingFr, one item per line', async () => {
    const { dialog, save } = renderEditor(objection({ coaching: { acknowledgePatterns: ['Fair question.'] } }));
    fireEvent.click(within(dialog).getByRole('button', { name: /French version/ }));
    fireEvent.change(within(dialog).getByLabelText(/Good ways to acknowledge it \(French\)/), {
      target: { value: 'Bonne question.\n\n  C’est logique.  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [body, base] = save.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(body.coachingFr).toEqual({ acknowledgePatterns: ['Bonne question.', 'C’est logique.'] });
    expect(body.coaching).toEqual({ acknowledgePatterns: ['Fair question.'] });
    expect(base).toBe('2026-10-10T10:00:00Z');
  });

  it('flags a French box over the limit and does not save', async () => {
    const { dialog, save } = renderEditor(objection());
    fireEvent.click(within(dialog).getByRole('button', { name: /French version/ }));
    fireEvent.change(within(dialog).getByLabelText(/Good next steps to offer \(French\)/), {
      target: { value: 'a\nb\nc\nd\ne\nf\ng' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Up to 6 lines here (now 7).')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
