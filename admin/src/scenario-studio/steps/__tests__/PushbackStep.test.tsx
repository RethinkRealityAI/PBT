import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PushbackStep } from '../PushbackStep';
import { emptyAdminDraft } from '../../studioModel';
import { renderStep } from './harness';

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
});
