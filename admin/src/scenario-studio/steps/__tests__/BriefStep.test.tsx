import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { ScenarioInspectResponse } from '../../../../../src/shared/ai/contract';

const { inspectScenario } = vi.hoisted(() => ({ inspectScenario: vi.fn() }));
vi.mock('../../api', () => ({ inspectScenario }));

// eslint-disable-next-line import/first
import { BriefStep } from '../BriefStep';
// eslint-disable-next-line import/first
import { PREFIX_EXAMPLES, SUFFIX_EXAMPLES } from '../briefModel';
// eslint-disable-next-line import/first
import { completeDraft, renderStep } from './harness';

const PROMPT = [
  '',
  '# ADMIN NOTES (apply on top of the canonical brief below)',
  'Everyone is polite.',
  '',
  'Be impatient.',
  '',
  'You are roleplaying a Royal Canin customer pushing back during an in-clinic conversation.',
  '',
  '# PUSHBACK',
  'Cost.',
  '',
  '# ADMIN ADDENDUM',
  'Never agree first.',
].join('\n');

function response(over: Partial<ScenarioInspectResponse> = {}): ScenarioInspectResponse {
  return {
    missing: [],
    prompt: PROMPT,
    adminNotes: {
      scenarioPrefix: 'Be impatient.',
      scenarioSuffix: 'Never agree first.',
      globalPrefix: 'Everyone is polite.',
      globalSuffix: null,
    },
    knowledge: { enabled: true, k: 4, mode: 'library', appliedFilter: {}, focusRelaxed: false, passages: [] },
    ...over,
  };
}

beforeEach(() => inspectScenario.mockReset());

describe('BriefStep — notes', () => {
  it('explains the wrap: notes go around a briefing they can’t replace', () => {
    renderStep(BriefStep, { draft: completeDraft() });
    expect(screen.getByText(/you can’t replace it/)).toBeInTheDocument();
    expect(screen.getByText(/never\s+change how conversations are scored/)).toBeInTheDocument();
  });

  it('typing counts against the limit', () => {
    const { patchSpy } = renderStep(BriefStep, { draft: completeDraft() });
    const box = screen.getByLabelText('Opening notes — read first, sets the mood');
    fireEvent.change(box, { target: { value: 'Be curt.' } });
    expect(patchSpy).toHaveBeenLastCalledWith({ prompt_prefix: 'Be curt.' });
    expect(screen.getByText('8/1500')).toBeInTheDocument();
  });

  it('example chips append a sentence, and take it back out', () => {
    const { patchSpy } = renderStep(BriefStep, { draft: completeDraft({ prompt_suffix: 'Be firm.' }) });
    const ex = SUFFIX_EXAMPLES[0];
    const chip = screen.getByRole('button', { name: `+ ${ex.label}` });
    fireEvent.click(chip);
    expect(patchSpy).toHaveBeenLastCalledWith({ prompt_suffix: `Be firm.\n${ex.sentence}` });
    const on = screen.getByRole('button', { name: `✓ ${ex.label}` });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(on);
    expect(patchSpy).toHaveBeenLastCalledWith({ prompt_suffix: 'Be firm.' });
  });

  it('the assistant button hands over its prompt', () => {
    const { props } = renderStep(BriefStep, { draft: completeDraft() });
    fireEvent.click(screen.getByRole('button', { name: /Suggest notes that make this owner more realistic/ }));
    expect(props.askAssistant).toHaveBeenCalledWith('Suggest notes that make this owner more realistic');
  });

  it('read-only disables the notes and the chips', () => {
    renderStep(BriefStep, { canWrite: false, draft: completeDraft({ prompt_prefix: 'Be curt.' }) });
    expect(screen.getByLabelText('Opening notes — read first, sets the mood')).toBeDisabled();
    expect(screen.getByLabelText('Opening notes — read first, sets the mood')).toHaveValue('Be curt.');
    expect(screen.getByRole('button', { name: `+ ${PREFIX_EXAMPLES[1].label}` })).toBeDisabled();
    // Reading the briefing is still allowed.
    expect(screen.getByRole('button', { name: 'See the full briefing' })).toBeEnabled();
  });
});

describe('BriefStep — the full briefing', () => {
  it('shows the exact prompt with the admin’s notes highlighted', async () => {
    inspectScenario.mockResolvedValue(response());
    renderStep(BriefStep, {
      draft: completeDraft({ prompt_prefix: 'Be impatient.', prompt_suffix: 'Never agree first.' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'See the full briefing' }));
    const briefing = await screen.findByTestId('briefing');
    expect(inspectScenario).toHaveBeenCalledWith(
      expect.objectContaining({ include: { prompt: true, knowledge: false } }),
    );
    const own = briefing.querySelectorAll('mark[data-note="scenario"]');
    expect([...own].map((m) => m.textContent)).toEqual(['Be impatient.', 'Never agree first.']);
    const global = briefing.querySelectorAll('mark[data-note="global"]');
    expect([...global].map((m) => m.textContent)).toEqual(['Everyone is polite.']);
    // Section headings stand out.
    expect(screen.getByText('# PUSHBACK').tagName).toBe('SPAN');
    expect(screen.getByText(`${PROMPT.replace(/^\n+/, '').length.toLocaleString('en')} characters`)).toBeInTheDocument();
    expect(screen.getByText('Your notes', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('From AI tuning — every scenario')).toBeInTheDocument();
  });

  it('marks the briefing out of date after an edit, and refreshes on request', async () => {
    inspectScenario.mockResolvedValue(response());
    renderStep(BriefStep, { draft: completeDraft({ prompt_prefix: 'Be impatient.' }) });
    fireEvent.click(screen.getByRole('button', { name: 'See the full briefing' }));
    await screen.findByTestId('briefing');
    expect(screen.queryByText(/Out of date/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Opening notes — read first, sets the mood'), {
      target: { value: 'Be very impatient.' },
    });
    expect(screen.getByText(/Out of date — the scenario changed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByTestId('briefing');
    expect(inspectScenario).toHaveBeenCalledTimes(2);
    expect(inspectScenario.mock.calls[1][0].draft.prompt_prefix).toBe('Be very impatient.');
  });

  it('asks for the earlier steps when the scenario is incomplete', () => {
    const { props } = renderStep(BriefStep, { draft: completeDraft({ breed: null }) });
    expect(screen.getByRole('button', { name: 'See the full briefing' })).toBeDisabled();
    expect(screen.getByText(/the briefing is built from them/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open “The pet” →' }));
    expect(props.goTo).toHaveBeenCalledWith('pet');
  });

  it('an error can be retried', async () => {
    inspectScenario.mockRejectedValueOnce(new Error('Server hiccup')).mockResolvedValueOnce(response());
    renderStep(BriefStep, { draft: completeDraft() });
    fireEvent.click(screen.getByRole('button', { name: 'See the full briefing' }));
    expect(await screen.findByText(/Server hiccup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('briefing')).toBeInTheDocument();
  });
});
