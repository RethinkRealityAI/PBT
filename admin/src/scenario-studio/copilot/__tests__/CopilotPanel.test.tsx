/**
 * The assistant panel, end to end against a mocked `askScenarioAgent`.
 *
 * A small stateful harness plays the Studio shell: it owns the draft (merging
 * `onPatch`) and the lifted transcript, exactly like the real editor, so these
 * tests exercise the same round-trips an admin does — ask, get a card, edit
 * it, apply it, and see the outcome go back to the model on the next turn.
 */
import { StrictMode, useState } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ScenarioAgentRequest, ScenarioAgentResponse } from '../../../../../src/shared/ai/contract';
import { pickAgentDraft } from '../../../../../src/shared/ai/scenarioAgent';
import type { KnowledgeDocument } from '../../../data/types';
import { emptyAdminDraft, type StudioDraft, type StudioStepKey } from '../../studioModel';
import { EMPTY_TRANSCRIPT, type CopilotTranscript } from '../types';
import { CopilotPanel } from '../CopilotPanel';

const { askScenarioAgent } = vi.hoisted(() => ({
  askScenarioAgent: vi.fn<(req: ScenarioAgentRequest) => Promise<ScenarioAgentResponse>>(),
}));
vi.mock('../../api', () => ({ askScenarioAgent }));

function doc(slug: string, title: string, over: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: slug,
    slug,
    title,
    category: 'clinical',
    source: 'upload',
    metadata: { tags: { tools: ['roleplay', 'scoring'] } },
    content: '',
    updated_at: '2026-09-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    chunk_count: 6,
    ...over,
  };
}

const DOCS: KnowledgeDocument[] = [
  doc('study:weight', 'Weight-loss outcomes in dogs'),
  doc('custom:cat-obesity', 'Feline obesity notes'),
  // Not readable by the roleplay customer / not indexed — never attachable.
  doc('fecal:dog', 'Fecal chart (dog)', { metadata: { tags: { tools: ['fecal-scan'] } } }),
  doc('custom:unindexed', 'Still indexing', { chunk_count: 0 }),
];

const spies = {
  onPatch: vi.fn(),
  onGoToStep: vi.fn(),
  onPendingConsumed: vi.fn(),
};

function Harness({
  initialDraft = emptyAdminDraft('admin:t1', null),
  step = 'pet',
  canWrite = true,
  pending = null,
  initialTranscript = EMPTY_TRANSCRIPT,
}: {
  initialDraft?: StudioDraft;
  step?: StudioStepKey;
  canWrite?: boolean;
  pending?: { id: number; text: string } | null;
  initialTranscript?: CopilotTranscript;
}) {
  const [draft, setDraft] = useState<StudioDraft>(initialDraft);
  const [transcript, setTranscript] = useState<CopilotTranscript>(initialTranscript);
  const [pendingPrompt, setPendingPrompt] = useState(pending);
  return (
    <div style={{ height: 600 }}>
      <CopilotPanel
        scenarioId="admin:t1"
        draft={draft}
        step={step}
        canWrite={canWrite}
        knowledge={{ docs: DOCS, loading: false, error: null, refetch: () => {} }}
        onPatch={(p, summary) => {
          spies.onPatch(p, summary);
          setDraft((d) => ({ ...d, ...p }));
        }}
        onGoToStep={spies.onGoToStep}
        transcript={transcript}
        onTranscriptChange={setTranscript}
        pendingPrompt={pendingPrompt}
        onPendingConsumed={() => {
          spies.onPendingConsumed();
          setPendingPrompt(null);
        }}
        variant="docked"
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </div>
  );
}

function currentDraft(): StudioDraft {
  return JSON.parse(screen.getByTestId('draft').textContent ?? '{}') as StudioDraft;
}

function reply(over: Partial<ScenarioAgentResponse> = {}): ScenarioAgentResponse {
  return { reply: '', actions: [], suggestions: [], ...over };
}

function composer(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Message the scenario assistant' }) as HTMLTextAreaElement;
}

function typeAndSend(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: 'Enter' });
}

/** The card (A2UI surface) containing `text`, once it appears. */
async function findCard(text: string | RegExp): Promise<HTMLElement> {
  const el = await screen.findByText(text);
  const cardEl = el.closest('[data-kind="card"]');
  if (!cardEl) throw new Error('not inside a card');
  return cardEl as HTMLElement;
}

/**
 * An assistant bubble. (Its text also sits in the polite live region that
 * announces it, so plain `findByText` would see two.)
 */
function findReply(text: string | RegExp, kind: 'assistant' | 'offline' = 'assistant') {
  return screen.findByText(text, { selector: `[data-kind="${kind}"] *` });
}

beforeEach(() => {
  askScenarioAgent.mockReset();
  spies.onPatch.mockReset();
  spies.onGoToStep.mockReset();
  spies.onPendingConsumed.mockReset();
});

describe('CopilotPanel', () => {
  it('greets an empty draft with starter prompts for the current step', () => {
    render(<Harness step="customer" />);
    expect(screen.getByText('Scenario assistant')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is saved until you press Save/)).toBeInTheDocument();
    expect(screen.getByText(/Tell me about the conversation you want your team to practise/)).toBeInTheDocument();
    const starters = within(screen.getByRole('group', { name: 'Starter prompts' })).getAllByRole('button');
    expect(starters).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Write three opening lines/ })).toBeInTheDocument();
  });

  it('a started draft is greeted by its step instead', () => {
    render(<Harness step="brief" initialDraft={{ ...emptyAdminDraft('admin:t1'), breed: 'Beagle' }} />);
    expect(screen.getByText('Want help with the AI brief?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Make the owner more resistant to price talk/ })).toBeInTheDocument();
  });

  it('a starter chip sends a message and renders the reply + a proposal card', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({
        reply: 'Labradors are a classic for this — here is a start.',
        actions: [{ tool: 'update_fields', fields: { breed: 'Labrador Retriever', life_stage: 'Adult (3-7)' } }],
        suggestions: ['Make the owner harder to move'],
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Suggest a breed where weight denial is common/ }));

    // The admin's words appear at once, with a typing indicator while waiting.
    expect(screen.getByText('Suggest a breed where weight denial is common', { selector: '[data-kind="user"]' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'The assistant is thinking' })).toBeInTheDocument();

    expect(await findReply('Labradors are a classic for this — here is a start.')).toBeInTheDocument();
    expect(askScenarioAgent).toHaveBeenCalledTimes(1);
    const req = askScenarioAgent.mock.calls[0][0];
    expect(req.messages).toEqual([{ role: 'user', content: 'Suggest a breed where weight denial is common' }]);
    expect(req.step).toBe('pet');
    expect(req.draft).toEqual(pickAgentDraft(emptyAdminDraft('admin:t1', null)));

    const card = await findCard('Suggested changes');
    expect(within(card).getByRole('textbox', { name: 'Breed (suggested)' })).toHaveValue('Labrador Retriever');
    expect(within(card).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Make the owner harder to move/ })).toBeInTheDocument();
    // Starters are gone once the conversation has begun.
    expect(screen.queryByRole('group', { name: 'Starter prompts' })).not.toBeInTheDocument();
  });

  it('Apply patches the draft with the (edited) change and leaves a result pill', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({
        reply: 'Try this.',
        actions: [{ tool: 'update_fields', fields: { breed: 'Labrador Retriever', life_stage: 'Adult (3-7)' } }],
      }),
    );
    render(<Harness />);
    typeAndSend('A lab whose owner denies the weight');
    const card = await findCard('Suggested changes');

    fireEvent.change(within(card).getByRole('textbox', { name: 'Breed (suggested)' }), {
      target: { value: 'Golden Retriever' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }));

    expect(spies.onPatch).toHaveBeenCalledTimes(1);
    expect(spies.onPatch).toHaveBeenCalledWith(
      { breed: 'Golden Retriever', life_stage: 'Adult (3-7)' },
      'Applied: Breed, Life stage',
    );
    expect(currentDraft()).toMatchObject({ breed: 'Golden Retriever', life_stage: 'Adult (3-7)' });
    expect(screen.queryByText('Suggested changes')).not.toBeInTheDocument();
    expect(screen.getByText(/Applied: Breed, Life stage/, { selector: '[data-kind="result"]' })).toBeInTheDocument();

    // The outcome goes back to the model with the next message.
    askScenarioAgent.mockResolvedValueOnce(reply({ reply: 'Noted.' }));
    typeAndSend('Thanks');
    await findReply('Noted.');
    const wire = askScenarioAgent.mock.calls[1][0].messages;
    expect(wire[wire.length - 1]).toEqual({ role: 'user', content: '[tool_result] Applied: Breed, Life stage\n\nThanks' });
    expect(askScenarioAgent.mock.calls[1][0].draft).toMatchObject({ breed: 'Golden Retriever' });
  });

  it('an edit that makes the card illegal changes nothing', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({ reply: 'Here.', actions: [{ tool: 'update_fields', fields: { breed: 'Beagle' } }] }),
    );
    render(<Harness />);
    typeAndSend('a beagle');
    const card = await findCard('Suggested changes');
    fireEvent.change(within(card).getByRole('textbox', { name: 'Breed (suggested)' }), { target: { value: '   ' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(spies.onPatch).not.toHaveBeenCalled();
    expect(screen.getByText('That didn’t look valid, so nothing changed.')).toBeInTheDocument();
  });

  it('Not now dismisses the card without touching the draft', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({ reply: 'Maybe?', actions: [{ tool: 'set_ai_notes', prompt_prefix: 'Be stubborn about cost.' }] }),
    );
    render(<Harness step="brief" />);
    typeAndSend('Notes please');
    const card = await findCard('Notes for the AI customer');
    expect(within(card).getByRole('textbox', { name: 'Opening notes for the AI' })).toHaveValue('Be stubborn about cost.');
    fireEvent.click(within(card).getByRole('button', { name: 'Not now' }));
    expect(spies.onPatch).not.toHaveBeenCalled();
    expect(screen.getByText('Dismissed', { selector: '[data-kind="result"]' })).toBeInTheDocument();
    expect(screen.queryByText('Notes for the AI customer')).not.toBeInTheDocument();
  });

  it('an ask answer applies its field and is sent as the admin’s next message', async () => {
    askScenarioAgent
      .mockResolvedValueOnce(
        reply({
          reply: 'One quick question first.',
          actions: [
            {
              tool: 'ask',
              question: 'Is the patient a dog or a cat?',
              field: 'species',
              options: [
                { label: 'Dog', value: 'dog' },
                { label: 'Cat', value: 'cat' },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(reply({ reply: 'A cat it is.' }));
    render(<Harness />);
    typeAndSend('Help me start');
    const card = await findCard('Is the patient a dog or a cat?');
    fireEvent.click(within(card).getByRole('button', { name: 'Cat' }));

    expect(spies.onPatch).toHaveBeenCalledWith({ species: 'cat' }, 'Applied: Species');
    expect(screen.getByText(/Answered: Cat/, { selector: '[data-kind="result"]' })).toBeInTheDocument();
    expect(screen.getByText('Cat', { selector: '[data-kind="user"]' })).toBeInTheDocument();

    await findReply('A cat it is.');
    expect(askScenarioAgent).toHaveBeenCalledTimes(2);
    const second = askScenarioAgent.mock.calls[1][0];
    expect(second.messages[second.messages.length - 1]).toEqual({
      role: 'user',
      content: '[tool_result] Answered: Cat\n\nCat',
    });
    expect(second.draft.species).toBe('cat');
  });

  it('picking an offered option fills that field', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({
        reply: 'Three openers:',
        actions: [
          {
            tool: 'offer_options',
            field: 'opening_line_override',
            options: ['Why would I pay more for this?', 'He eats fine, honestly.'],
          },
        ],
      }),
    );
    render(<Harness step="customer" />);
    typeAndSend('Write three opening lines');
    const card = await findCard('Opening line ideas');
    fireEvent.click(within(card).getByRole('button', { name: 'He eats fine, honestly.' }));
    expect(spies.onPatch).toHaveBeenCalledWith(
      { opening_line_override: 'He eats fine, honestly.' },
      'Applied: Opening line',
    );
    expect(screen.getByText(/Using: He eats fine, honestly\./)).toBeInTheDocument();
  });

  it('attaching documents adds the ticked ones to what is already attached', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({
        reply: 'These two fit.',
        actions: [
          { tool: 'attach_knowledge', mode: 'documents', slugs: ['study:weight', 'custom:cat-obesity'] },
        ],
      }),
    );
    render(
      <Harness
        step="knowledge"
        initialDraft={{ ...emptyAdminDraft('admin:t1'), knowledge_slugs: ['custom:mine'] }}
      />,
    );
    typeAndSend('Which documents should this scenario use?');
    const card = await findCard('Ground the AI in these documents');
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Weight-loss outcomes in dogs' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(spies.onPatch).toHaveBeenCalledWith(
      { knowledge_slugs: ['custom:mine', 'custom:cat-obesity'] },
      'Applied: Attached documents',
    );
  });

  it('drops proposals for documents the roleplay customer cannot read', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({
        reply: 'Attach these.',
        actions: [{ tool: 'attach_knowledge', mode: 'documents', slugs: ['fecal:dog', 'custom:unindexed'] }],
      }),
    );
    render(<Harness step="knowledge" />);
    typeAndSend('Attach something');
    await findReply('Attach these.');
    expect(screen.queryByText('Ground the AI in these documents')).not.toBeInTheDocument();
  });

  it('a go-to-step card navigates', async () => {
    askScenarioAgent.mockResolvedValueOnce(
      reply({ reply: 'Next up:', actions: [{ tool: 'go_to_step', step: 'knowledge' }] }),
    );
    render(<Harness />);
    typeAndSend('What next?');
    fireEvent.click(await screen.findByRole('button', { name: 'Open Knowledge →' }));
    expect(spies.onGoToStep).toHaveBeenCalledWith('knowledge');
    expect(screen.getByText(/Opened: Knowledge/)).toBeInTheDocument();
  });

  it('an API error shows the offline message and Retry re-asks', async () => {
    askScenarioAgent
      .mockRejectedValueOnce(new Error('Too many requests'))
      .mockResolvedValueOnce(reply({ reply: 'Back on track.' }));
    render(<Harness />);
    typeAndSend('Make it a cat');
    expect(
      await findReply(
        'I couldn’t reach the assistant just now (Too many requests). Your draft is safe — keep going with the steps, or try again.',
        'offline',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await findReply('Back on track.')).toBeInTheDocument();
    expect(askScenarioAgent).toHaveBeenCalledTimes(2);
    // Same conversation resent — the message is not duplicated, the offline note is gone.
    expect(askScenarioAgent.mock.calls[1][0].messages).toEqual([{ role: 'user', content: 'Make it a cat' }]);
    expect(screen.getAllByText('Make it a cat')).toHaveLength(1);
    expect(screen.queryByText(/couldn’t reach the assistant/, { selector: '[data-kind="offline"] *' })).not.toBeInTheDocument();
  });

  it('never sends twice while a reply is pending', async () => {
    let resolve: (r: ScenarioAgentResponse) => void = () => {};
    askScenarioAgent.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<Harness />);
    typeAndSend('First');
    typeAndSend('Second');
    fireEvent.click(screen.getByRole('button', { name: 'Waiting for the assistant' }));
    expect(askScenarioAgent).toHaveBeenCalledTimes(1);
    // The unsent text stays in the composer.
    expect(composer()).toHaveValue('Second');
    await act(async () => resolve(reply({ reply: 'Got it.' })));
    expect(await findReply('Got it.')).toBeInTheDocument();
  });

  it('a queued prompt is sent exactly once, even under StrictMode', async () => {
    askScenarioAgent.mockResolvedValue(reply({ reply: 'On it.' }));
    render(
      <StrictMode>
        <Harness pending={{ id: 1, text: 'A senior cat whose owner refuses a diet change' }} />
      </StrictMode>,
    );
    expect(await findReply('On it.')).toBeInTheDocument();
    await waitFor(() => expect(spies.onPendingConsumed).toHaveBeenCalled());
    expect(askScenarioAgent).toHaveBeenCalledTimes(1);
    expect(spies.onPendingConsumed).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('A senior cat whose owner refuses a diet change')).toHaveLength(1);
  });

  it('view-only roles get a disabled composer and starters', () => {
    render(<Harness canWrite={false} />);
    expect(composer()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText('View only — your role can’t edit scenarios')).toBeInTheDocument();
    for (const b of within(screen.getByRole('group', { name: 'Starter prompts' })).getAllByRole('button')) {
      expect(b).toBeDisabled();
    }
    fireEvent.click(screen.getAllByRole('button', { name: /Suggest a breed/ })[0]);
    expect(askScenarioAgent).not.toHaveBeenCalled();
  });

  it('Shift+Enter keeps typing; the counter appears near the limit', () => {
    render(<Harness />);
    fireEvent.change(composer(), { target: { value: 'line one' } });
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
    expect(askScenarioAgent).not.toHaveBeenCalled();
    fireEvent.change(composer(), { target: { value: 'x'.repeat(1900) } });
    expect(screen.getByText('1900/2000')).toBeInTheDocument();
  });

  it('the drawer variant has a close button', () => {
    const onClose = vi.fn();
    render(
      <CopilotPanel
        scenarioId="admin:t1"
        draft={emptyAdminDraft('admin:t1')}
        step="pet"
        canWrite
        knowledge={{ docs: [], loading: false, error: null, refetch: () => {} }}
        onPatch={() => {}}
        onGoToStep={() => {}}
        transcript={EMPTY_TRANSCRIPT}
        onTranscriptChange={() => {}}
        pendingPrompt={null}
        onPendingConsumed={() => {}}
        variant="drawer"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a reply that lands after switching scenarios is not written into the new one', async () => {
    let resolve: (r: ScenarioAgentResponse) => void = () => {};
    askScenarioAgent.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const onTranscriptChange = vi.fn();
    const panel = (scenarioId: string, transcript: CopilotTranscript) => (
      <CopilotPanel
        scenarioId={scenarioId}
        draft={emptyAdminDraft(scenarioId)}
        step="pet"
        canWrite
        knowledge={{ docs: [], loading: false, error: null, refetch: () => {} }}
        onPatch={() => {}}
        onGoToStep={() => {}}
        transcript={transcript}
        onTranscriptChange={onTranscriptChange}
        pendingPrompt={null}
        onPendingConsumed={() => {}}
        variant="docked"
      />
    );
    const { rerender } = render(panel('admin:a', EMPTY_TRANSCRIPT));
    typeAndSend('For scenario A');
    expect(askScenarioAgent).toHaveBeenCalledTimes(1);
    const writesBefore = onTranscriptChange.mock.calls.length;

    rerender(panel('admin:b', EMPTY_TRANSCRIPT));
    await act(async () => resolve(reply({ reply: 'Answer meant for A.' })));
    expect(onTranscriptChange.mock.calls.length).toBe(writesBefore);
    expect(screen.queryByText('Answer meant for A.')).not.toBeInTheDocument();
    // …and the panel is free again for B.
    await waitFor(() => expect(screen.queryByRole('status', { name: /thinking/ })).not.toBeInTheDocument());
  });

  it('renders a restored transcript without calling the model', () => {
    const restored: CopilotTranscript = {
      items: [
        { id: 'u1', kind: 'user', text: 'Earlier question', at: 1 },
        { id: 'a2', kind: 'assistant', text: 'Earlier answer', at: 2 },
        { id: 'r3', kind: 'result', text: 'Applied: Breed', ok: true, at: 3 },
      ],
      surfaces: {},
      suggestions: ['Keep going'],
      seq: 3,
    };
    render(<Harness initialTranscript={restored} />);
    expect(screen.getByText('Earlier answer')).toBeInTheDocument();
    expect(screen.getByText('Earlier answer').closest('.pbt-studio-in')).toBeNull(); // no replayed entrance
    expect(screen.getByRole('button', { name: /Keep going/ })).toBeInTheDocument();
    expect(askScenarioAgent).not.toHaveBeenCalled();
  });
});
