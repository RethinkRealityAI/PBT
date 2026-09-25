/**
 * KnowledgeStep — modes, document status, the inline upload, the preview.
 * The network layer is stubbed; every pure helper stays real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ScenarioInspectResponse } from '../../../../../src/shared/ai/contract';
import type { KnowledgeAnalyzeResponse } from '../../../../../src/shared/knowledge/knowledgeAnalyze';

const { inspectScenario, ingestKnowledge, analyzeKnowledge } = vi.hoisted(() => ({
  inspectScenario: vi.fn(),
  ingestKnowledge: vi.fn(),
  analyzeKnowledge: vi.fn(),
}));

vi.mock('../../api', () => ({ inspectScenario }));
vi.mock('../../../data/queries', () => ({ ingestKnowledge }));
vi.mock('../../../data/knowledgeActions', async () => {
  const actual = await vi.importActual<typeof import('../../../data/knowledgeActions')>(
    '../../../data/knowledgeActions',
  );
  return { ...actual, analyzeKnowledge };
});

// eslint-disable-next-line import/first
import { KnowledgeStep } from '../KnowledgeStep';
// eslint-disable-next-line import/first
import { completeDraft, doc, knowledgeState, renderStep } from './harness';

const DOCS = [
  doc({ slug: 'study:obesity', title: 'Obesity study', tags: { focus: 'weight', tools: ['roleplay', 'scoring'], species: ['dog', 'puppy', 'cat'] } }),
  doc({ slug: 'study:urinary', title: 'Urinary handout', tags: { focus: 'urinary', tools: ['roleplay'], species: ['dog', 'puppy', 'cat'] } }),
  doc({ slug: 'fecal:cat', title: 'Cat stool chart', tags: { tools: ['fecal-scan'], species: ['cat'] } }),
  doc({ slug: 'study:dogs', title: 'Adult dog nutrition', tags: { tools: ['roleplay'], species: ['dog'] } }),
  doc({ slug: 'study:empty', title: 'Unindexed protocol', chunk_count: 0, tags: { tools: ['roleplay'] } }),
];

function inspectResponse(over: Partial<ScenarioInspectResponse['knowledge']> = {}): ScenarioInspectResponse {
  return {
    missing: [],
    prompt: null,
    adminNotes: { scenarioPrefix: null, scenarioSuffix: null, globalPrefix: null, globalSuffix: null },
    knowledge: {
      enabled: true,
      k: 4,
      mode: 'library',
      appliedFilter: { tools: ['roleplay'], species: ['cat'] },
      focusRelaxed: false,
      passages: [
        {
          slug: 'study:urinary',
          title: 'Urinary handout',
          citation: 'Clinic protocol, 2026',
          snippet: 'Cats with crystals do better on a wet urinary diet.',
          similarity: 0.82,
        },
      ],
      ...over,
    },
  };
}

beforeEach(() => {
  inspectScenario.mockReset();
  ingestKnowledge.mockReset();
  analyzeKnowledge.mockReset();
});

const modeTile = (name: RegExp) => within(screen.getByRole('group', { name: 'Where should the AI look?' })).getByRole('button', { name });

describe('KnowledgeStep — modes', () => {
  it('derives the mode from the draft', () => {
    renderStep(KnowledgeStep, { draft: completeDraft({ knowledge_slugs: ['study:obesity'] }), knowledge: knowledgeState({ docs: DOCS }) });
    expect(modeTile(/^Whole library/)).toHaveAttribute('aria-pressed', 'false');
    expect(modeTile(/Specific documents/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('switching to one topic detaches the documents, says so, and can be undone', () => {
    const { patchSpy } = renderStep(KnowledgeStep, {
      draft: completeDraft({ knowledge_slugs: ['study:obesity', 'study:urinary'] }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    fireEvent.click(modeTile(/One topic/));
    expect(patchSpy).toHaveBeenLastCalledWith({ knowledge_slugs: null });
    expect(modeTile(/One topic/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Detached 2 attached documents/)).toBeInTheDocument();
    expect(screen.getByText(/Pick a topic — until you do, the AI searches the whole library/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(patchSpy).toHaveBeenLastCalledWith({ focus_area: null, knowledge_slugs: ['study:obesity', 'study:urinary'] });
    expect(modeTile(/Specific documents/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('switching to the whole library clears the topic', () => {
    const { patchSpy } = renderStep(KnowledgeStep, {
      draft: completeDraft({ focus_area: 'urinary' }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    fireEvent.click(modeTile(/Whole library/));
    expect(patchSpy).toHaveBeenLastCalledWith({ focus_area: null, knowledge_slugs: null });
    expect(screen.getByText(/Removed the topic “Urinary health”/)).toBeInTheDocument();
  });

  it('topics show how many readable documents they hold, and warn when there are none', () => {
    const { patchSpy } = renderStep(KnowledgeStep, {
      draft: completeDraft({ species: 'cat', focus_area: 'weight' }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    const topics = screen.getByRole('group', { name: 'Topic' });
    expect(within(topics).getByRole('button', { name: /Weight management · 1/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(topics).getByRole('button', { name: /Senior care · 0/ }));
    expect(patchSpy).toHaveBeenLastCalledWith({ focus_area: 'aging', knowledge_slugs: null });
    expect(screen.getByText('Nothing is filed under this topic yet')).toBeInTheDocument();
  });

  it('stays on Specific documents when the admin unticks the last one', () => {
    renderStep(KnowledgeStep, { draft: completeDraft(), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(modeTile(/Specific documents/));
    const box = screen.getByRole('checkbox', { name: /Obesity study/ });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(modeTile(/Specific documents/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('follows changes made elsewhere (the assistant, a revert)', () => {
    const { outside } = renderStep(KnowledgeStep, {
      draft: completeDraft({ focus_area: 'weight' }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    expect(modeTile(/One topic/)).toHaveAttribute('aria-pressed', 'true');
    outside({ focus_area: null, knowledge_slugs: ['study:obesity'] });
    expect(modeTile(/Specific documents/)).toHaveAttribute('aria-pressed', 'true');
    outside({ knowledge_slugs: null });
    expect(modeTile(/Whole library/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('KnowledgeStep — specific documents', () => {
  function openDocuments(draftOver = {}, permissions?: string[]) {
    const r = renderStep(
      KnowledgeStep,
      { draft: completeDraft(draftOver), knowledge: knowledgeState({ docs: DOCS }) },
      permissions ? { permissions } : {},
    );
    if (!('knowledge_slugs' in draftOver)) fireEvent.click(modeTile(/Specific documents/));
    return r;
  }

  it('lists documents; ticking one attaches it', () => {
    const { patchSpy } = openDocuments();
    expect(screen.getByText(/Nothing is ticked yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Obesity study/ }));
    expect(patchSpy).toHaveBeenLastCalledWith({ knowledge_slugs: ['study:obesity'] });
    expect(screen.getByText('1 of 40 attached')).toBeInTheDocument();
  });

  it('documents the roleplay can’t read are greyed with the reason and the fix', () => {
    openDocuments();
    const fecal = screen.getByRole('checkbox', { name: /Cat stool chart/ });
    expect(fecal).toBeDisabled();
    const row = fecal.closest('label')!;
    expect(within(row).getByText('Not used by roleplay')).toBeInTheDocument();
    expect(within(row).getByText(/add “Roleplay customer” to its “Used by” list/)).toBeInTheDocument();
  });

  it('wrong-species documents are blocked for this scenario', () => {
    openDocuments({ species: 'cat' });
    const dogs = screen.getByRole('checkbox', { name: /Adult dog nutrition/ });
    expect(dogs).toBeDisabled();
    expect(within(dogs.closest('label')!).getByText('Not for cats')).toBeInTheDocument();
  });

  it('unindexed and missing attachments are called out; missing ones can be removed', () => {
    const { patchSpy } = openDocuments({ knowledge_slugs: ['study:empty', 'study:gone'] });
    expect(screen.getByText('One attached document isn’t searchable yet')).toBeInTheDocument();
    expect(screen.getByText('Attached to documents that no longer exist')).toBeInTheDocument();
    expect(screen.getByText('1 of 40 attached · 1 missing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove missing document study:gone' }));
    expect(patchSpy).toHaveBeenLastCalledWith({ knowledge_slugs: ['study:empty'] });
  });

  it('stops at the 40-document cap', () => {
    const forty = Array.from({ length: 40 }, (_, i) => `s${i}`);
    openDocuments({ knowledge_slugs: forty });
    expect(screen.getByText(/40 documents attached — the most a scenario can hold/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Obesity study/ })).toBeDisabled();
  });

  it('a role without knowledge access gets a friendly message and can keep the whole library', () => {
    renderStep(
      KnowledgeStep,
      { draft: completeDraft(), knowledge: knowledgeState({ error: 'Forbidden' }) },
      { permissions: ['scenarios.read', 'scenarios.write'] },
    );
    expect(screen.getByText('You can’t browse the knowledge library')).toBeInTheDocument();
    expect(modeTile(/Whole library/)).toHaveAttribute('aria-pressed', 'true');
    expect(modeTile(/Whole library/)).toBeEnabled();
    expect(screen.getByText(/Ask someone with knowledge access/)).toBeInTheDocument();
  });

  it('read-only disables the mode tiles and the checkboxes', () => {
    renderStep(KnowledgeStep, {
      canWrite: false,
      draft: completeDraft({ knowledge_slugs: ['study:obesity'] }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    expect(modeTile(/One topic/)).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Obesity study/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Obesity study/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: /Upload a document/ })).not.toBeInTheDocument();
  });
});

describe('KnowledgeStep — upload', () => {
  const ANALYSIS: KnowledgeAnalyzeResponse = {
    analysis: {
      title: 'Urinary diet protocol',
      summary: 'How the clinic introduces a urinary diet to cat owners.',
      category: 'custom',
      focus: 'urinary',
      tools: ['fecal-scan'],
      species: ['cat'],
      citation: 'Clinic protocol, 2026',
      topics: ['urinary diet', 'cats'],
      confidence: 0.9,
      reasons: { focus: 'It is about urinary diets.', tools: 'x', species: 'Only cats are mentioned.' },
      warnings: [],
    },
  };
  const LONG_TEXT = 'Urinary crystals in cats respond well to a wet therapeutic diet. '.repeat(6);

  it('reads the text, then files it for roleplay + scoring and attaches it', async () => {
    analyzeKnowledge.mockResolvedValue(ANALYSIS);
    ingestKnowledge.mockResolvedValue({ ok: true, slug: 'custom:urinary-protocol', chunks: 3 });
    const knowledge = knowledgeState({ docs: DOCS });
    const { patchSpy } = renderStep(KnowledgeStep, {
      draft: completeDraft({ species: 'cat', focus_area: 'weight' }),
      knowledge,
    });

    fireEvent.click(screen.getByRole('button', { name: /Upload a document/ }));
    const dialog = screen.getByRole('dialog', { name: 'Upload a document' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Paste text/ }));
    fireEvent.change(within(dialog).getByLabelText('The text'), { target: { value: LONG_TEXT } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Read it for me/ }));

    await within(dialog).findByText('How the clinic introduces a urinary diet to cat owners.');
    expect(analyzeKnowledge).toHaveBeenCalledWith({ text: LONG_TEXT.trim() });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Urinary diet protocol');
    expect(within(dialog).getByRole('button', { name: 'Urinary health' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText(/the topic “Weight management” is cleared/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to library and attach' }));
    await waitFor(() => expect(ingestKnowledge).toHaveBeenCalledTimes(1));
    const body = ingestKnowledge.mock.calls[0][0];
    expect(body).toMatchObject({
      text: LONG_TEXT.trim(),
      title: 'Urinary diet protocol',
      category: 'custom',
      citation: 'Clinic protocol, 2026',
    });
    expect(body.tags.focus).toBe('urinary');
    expect(body.tags.tools).toEqual(expect.arrayContaining(['roleplay', 'scoring']));
    expect(body.tags.tools).not.toContain('fecal-scan');
    expect(body.tags.species).toEqual(['cat']);

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith({ knowledge_slugs: ['custom:urinary-protocol'], focus_area: null }),
    );
    expect(knowledge.refetch).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Upload a document' })).not.toBeInTheDocument();
    expect(modeTile(/Specific documents/)).toHaveAttribute('aria-pressed', 'true');
    // Not yet in the refetched list, but it must not read as "missing".
    expect(screen.queryByText('Attached to documents that no longer exist')).not.toBeInTheDocument();
  });

  it('a PDF the assistant already extracted is ingested as text', async () => {
    analyzeKnowledge.mockResolvedValue({ ...ANALYSIS, extractedMarkdown: '# Extracted', extractedCitation: 'From the PDF' });
    ingestKnowledge.mockResolvedValue({ ok: true, slug: 'custom:pdf', chunks: 2 });
    renderStep(KnowledgeStep, { draft: completeDraft(), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(screen.getByRole('button', { name: /Upload a document/ }));
    const dialog = screen.getByRole('dialog', { name: 'Upload a document' });
    const file = new File(['%PDF-1.4 hello'], 'protocol.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText('PDF file'), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Read it for me/ }));
    await within(dialog).findByLabelText('Title');
    expect(analyzeKnowledge.mock.calls[0][0]).toHaveProperty('pdfBase64');
    fireEvent.change(within(dialog).getByLabelText('Citation'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to library and attach' }));
    await waitFor(() => expect(ingestKnowledge).toHaveBeenCalledTimes(1));
    const body = ingestKnowledge.mock.calls[0][0];
    expect(body.text).toBe('# Extracted');
    expect(body).not.toHaveProperty('pdfBase64');
    expect(body.citation).toBe('From the PDF');
    // A dog scenario files for adult dogs and puppies.
    expect(body.tags.species).toEqual(['dog', 'puppy']);
  });

  it('a failed read keeps the admin moving, and ingest errors show inline', async () => {
    analyzeKnowledge.mockRejectedValue(new Error('Gemini is busy'));
    ingestKnowledge.mockRejectedValue(new Error('Embedding failed'));
    renderStep(KnowledgeStep, { draft: completeDraft(), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(screen.getByRole('button', { name: /Upload a document/ }));
    const dialog = screen.getByRole('dialog', { name: 'Upload a document' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Paste text/ }));
    fireEvent.change(within(dialog).getByLabelText('Title', { exact: false }), { target: { value: 'My notes' } });
    fireEvent.change(within(dialog).getByLabelText('The text'), { target: { value: LONG_TEXT } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Read it for me/ }));
    expect(await within(dialog).findByText(/Gemini is busy/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /fill it in myself/ }));
    expect(within(dialog).getByLabelText('Title')).toHaveValue('My notes');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to library and attach' }));
    expect(await within(dialog).findByText('Embedding failed')).toBeInTheDocument();
  });

  it('is only offered to roles that can add knowledge', () => {
    renderStep(
      KnowledgeStep,
      { draft: completeDraft(), knowledge: knowledgeState({ docs: DOCS }) },
      { permissions: ['scenarios.read', 'scenarios.write', 'knowledge.read'] },
    );
    expect(screen.queryByRole('button', { name: /Upload a document/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Ask someone with knowledge access/)).toBeInTheDocument();
  });
});

describe('KnowledgeStep — preview', () => {
  it('runs the real retrieval for the draft and shows the passages and the scope', async () => {
    inspectScenario.mockResolvedValue(inspectResponse());
    renderStep(KnowledgeStep, { draft: completeDraft({ species: 'cat' }), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(screen.getByRole('button', { name: 'Preview what the AI will read' }));
    expect(await screen.findByText('Cats with crystals do better on a wet urinary diet.')).toBeInTheDocument();
    expect(inspectScenario).toHaveBeenCalledWith(
      expect.objectContaining({ include: { prompt: false, knowledge: true } }),
    );
    expect(screen.getByText('Searching: roleplay documents · cats · whole library')).toBeInTheDocument();
    expect(screen.getByText('82% match')).toBeInTheDocument();
    expect(screen.getByText('Clinic protocol, 2026')).toBeInTheDocument();
  });

  it('says when research grounding is off, and marks the preview stale after an edit', async () => {
    inspectScenario.mockResolvedValue(inspectResponse({ enabled: false, passages: [] }));
    renderStep(KnowledgeStep, { draft: completeDraft(), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(screen.getByRole('button', { name: 'Preview what the AI will read' }));
    expect(
      await screen.findByText(/Research grounding is switched off for every scenario in AI tuning/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Out of date/)).not.toBeInTheDocument();
    fireEvent.click(modeTile(/One topic/));
    fireEvent.click(within(screen.getByRole('group', { name: 'Topic' })).getByRole('button', { name: /Urinary health/ }));
    expect(screen.getByText(/Out of date — the scenario changed/)).toBeInTheDocument();
  });

  it('asks for the earlier steps first when the draft can’t be searched yet', () => {
    const { props } = renderStep(KnowledgeStep, {
      draft: completeDraft({ pushback_id: null, suggested_driver: null }),
      knowledge: knowledgeState({ docs: DOCS }),
    });
    expect(screen.getByRole('button', { name: 'Preview what the AI will read' })).toBeDisabled();
    expect(screen.getByText(/Finish the pet, pushback and owner steps first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open “The owner” →' }));
    expect(props.goTo).toHaveBeenCalledWith('customer');
    expect(inspectScenario).not.toHaveBeenCalled();
  });

  it('shows the server’s missing list and focus relaxation honestly', async () => {
    inspectScenario.mockResolvedValue({ ...inspectResponse({ focusRelaxed: true }), missing: [] });
    renderStep(KnowledgeStep, { draft: completeDraft({ focus_area: 'aging' }), knowledge: knowledgeState({ docs: DOCS }) });
    fireEvent.click(screen.getByRole('button', { name: 'Preview what the AI will read' }));
    expect(await screen.findByText(/Nothing on this topic matched, so the search widened/)).toBeInTheDocument();
  });
});
