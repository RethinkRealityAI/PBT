import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { CustomerStep } from '../CustomerStep';
import { emptyAdminDraft } from '../../studioModel';
import { renderStep } from './harness';

describe('CustomerStep', () => {
  it('driver tiles patch the ECHO driver', () => {
    const { patchSpy } = renderStep(CustomerStep);
    const analyzer = screen.getByRole('button', { name: /Analyzer.*Wants evidence/ });
    fireEvent.click(analyzer);
    expect(patchSpy).toHaveBeenCalledWith({ suggested_driver: 'Analyzer' });
    expect(analyzer).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'What does “What is an ECHO driver?” do?' })).toBeInTheDocument();
  });

  it('persona chips patch and explain the one picked', () => {
    const { patchSpy } = renderStep(CustomerStep);
    expect(screen.getByText(/Doubts the recommendation/)).toBeInTheDocument(); // default Skeptical
    fireEvent.click(screen.getByRole('button', { name: 'Bargain-hunter' }));
    expect(patchSpy).toHaveBeenCalledWith({ persona_override: 'Bargain-hunter' });
    expect(screen.getByText(/Price is always part of the conversation/)).toBeInTheDocument();
  });

  it('difficulty tiles; Studio scenarios have no "built-in" option', () => {
    const { patchSpy } = renderStep(CustomerStep);
    expect(screen.queryByRole('button', { name: /Use the built-in level/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^4 · Combative/ }));
    expect(patchSpy).toHaveBeenCalledWith({ difficulty_override: 4 });
    expect(screen.getByText(/Scoring is the same at every level/)).toBeInTheDocument();
  });

  it('library scenarios can go back to the built-in level (null), named', () => {
    const base = { ...emptyAdminDraft('seed-1'), difficulty_override: 3 };
    const { patchSpy } = renderStep(CustomerStep, {
      source: 'library',
      base,
      draft: { ...base, difficulty_override: 1 },
    });
    const builtIn = screen.getByRole('button', { name: /Use the built-in level/ });
    expect(builtIn).toHaveTextContent('Ships as 3 · Hostile');
    fireEvent.click(builtIn);
    expect(patchSpy).toHaveBeenCalledWith({ difficulty_override: null });
    expect(builtIn).toHaveAttribute('aria-pressed', 'true');
  });

  it('opening line + its assistant button', () => {
    const { patchSpy, props } = renderStep(CustomerStep);
    expect(screen.getByText(/Voice sessions open with this line/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The first thing the owner says'), { target: { value: 'Hi.' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ opening_line_override: 'Hi.' });
    fireEvent.click(screen.getByRole('button', { name: /Write three opening lines/ }));
    expect(props.askAssistant).toHaveBeenCalledWith('Write three opening lines');
  });

  it('read-only disables every control but keeps the selection visible', () => {
    renderStep(CustomerStep, {
      canWrite: false,
      draft: { ...emptyAdminDraft('admin:t'), suggested_driver: 'Harmonizer' },
    });
    const harmonizer = screen.getByRole('button', { name: /Harmonizer.*Avoids conflict/ });
    expect(harmonizer).toBeDisabled();
    expect(harmonizer).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Busy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^2 · Skeptical/ })).toBeDisabled();
    expect(screen.getByLabelText('The first thing the owner says')).toBeDisabled();
  });
});
