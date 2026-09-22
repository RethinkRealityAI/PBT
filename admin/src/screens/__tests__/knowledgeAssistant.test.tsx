/**
 * KnowledgeScreen — the tag assistant.
 *
 * The assistant reads a document and proposes what it is and where it should
 * be used; the admin applies or ignores the proposal. These cases pin the
 * contract that matters: it never runs unasked, its proposal lands in the
 * SAME editable fields (so the summary sentence changes with it), the
 * "suggested" marks go away the moment the admin touches a field, and a PDF
 * the assistant already extracted is ingested as text — not extracted twice.
 *
 * Same mocking harness as knowledgeScopes.test.tsx: the data layer is
 * stubbed, every pure helper stays real.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KnowledgeAnalyzeResponse } from '../../../../src/shared/knowledge/knowledgeAnalyze';

const state = {
  docs: { data: [] as unknown[], loading: false, error: null as string | null },
  overrides: { data: [] as unknown[], loading: false, error: null as string | null },
};

const { ingestKnowledge, analyzeKnowledge } = vi.hoisted(() => ({
  ingestKnowledge: vi.fn(async () => ({ ok: true, slug: 'custom:x', chunks: 3 })),
  analyzeKnowledge: vi.fn(),
}));

vi.mock('../../data/queries', () => ({
  useKnowledgeDocuments: () => state.docs,
  useScenarioOverrides: () => state.overrides,
  useAdminSimulationConfig: () => ({
    data: { config: { rag: { enabled: true } } },
    loading: false,
    error: null,
    refetch: () => {},
  }),
  deleteKnowledge: vi.fn(),
  ingestBundledStudies: vi.fn(),
  ingestKnowledge,
  reembedKnowledge: vi.fn(),
  seedKnowledge: vi.fn(),
}));

vi.mock('../../data/knowledgeActions', async () => {
  const actual = await vi.importActual<typeof import('../../data/knowledgeActions')>(
    '../../data/knowledgeActions',
  );
  return {
    ...actual,
    analyzeKnowledge,
    fetchDeletedKnowledge: vi.fn(async () => []),
    restoreKnowledgeDocument: vi.fn(),
    updateKnowledgeDocument: vi.fn(async () => ({
      ok: true,
      slug: 's',
      focus: null,
      citation: null,
      chunks_updated: 2,
    })),
    searchKnowledge: vi.fn(),
  };
});

// eslint-disable-next-line import/first
import { KnowledgeScreen } from '../KnowledgeScreen';
// eslint-disable-next-line import/first
import { AccessProvider } from '../../primitives/access';
// eslint-disable-next-line import/first
import { AUTO_SUGGEST_KEY, confidenceBand } from '../KnowledgeAssistantPanel';

const analyzeMock = vi.mocked(analyzeKnowledge);

const FECAL_ANALYSIS: KnowledgeAnalyzeResponse = {
  analysis: {
    title: 'Feline stool colour guide',
    summary:
      'A clinic handout describing what stool colour means in cats. It lists the colours that need a vet visit and the ones that do not.',
    category: 'custom',
    focus: 'gi',
    tools: ['fecal-scan'],
    species: ['cat'],
    citation: 'Clinic handout, 2026',
    topics: ['stool colour', 'cats', 'when to refer'],
    confidence: 0.86,
    reasons: {
      focus: 'It is about digestion and stool, which is the digestive health area.',
      tools: 'Stool scoring material belongs to Fecal Scan, not to the roleplay tools.',
      species: 'The text only ever talks about cats.',
    },
    warnings: ['Only a short passage was read — check the species before saving.'],
  },
};

const PDF_ANALYSIS: KnowledgeAnalyzeResponse = {
  ...FECAL_ANALYSIS,
  extractedMarkdown: '# Feline stool colour\n\nExtracted from the PDF.',
  extractedCitation: 'Extracted citation, 2026',
};

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'a',
    slug: 'study:davies-2024',
    title: 'Dog owner preferences',
    category: 'clinical',
    source: 'admin',
    metadata: null,
    content: 'body',
    updated_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    chunk_count: 4,
    ...over,
  };
}

function renderScreen(permissions: string[] = ['knowledge.read', 'knowledge.write']) {
  return render(
    <AccessProvider permissions={permissions}>
      <KnowledgeScreen query="" onQuery={() => {}} />
    </AccessProvider>,
  );
}

const LONG_TEXT =
  'Stool colour in cats. Dark tarry stool suggests digested blood from the upper gut, fresh red streaks point to the colon. ' +
  'Pale or grey stool can mean a bile problem. Green stool is usually diet. Record the colour separately from the consistency score.';

function openAddWithText(text = LONG_TEXT) {
  fireEvent.click(screen.getByText('+ Add document'));
  fireEvent.click(screen.getByText('Paste text'));
  fireEvent.change(screen.getByPlaceholderText('Paste the document text…'), {
    target: { value: text },
  });
}

beforeEach(() => {
  state.docs = { data: [doc()], loading: false, error: null };
  state.overrides = { data: [], loading: false, error: null };
  analyzeMock.mockReset();
  ingestKnowledge.mockClear();
  localStorage.removeItem(AUTO_SUGGEST_KEY);
});

describe('confidenceBand', () => {
  it('buckets the number into three words and keeps the percent', () => {
    expect(confidenceBand(0.86)).toMatchObject({ label: 'High confidence', percent: 86 });
    expect(confidenceBand(0.5)).toMatchObject({ label: 'Medium confidence', percent: 50 });
    expect(confidenceBand(0.2)).toMatchObject({ label: 'Low confidence', percent: 20 });
  });
});

describe('the assistant in the add-document form', () => {
  it('only offers itself once there is enough text to read', () => {
    renderScreen();
    openAddWithText('Too short to bother the model with.');
    expect(screen.queryByTestId('assistant-idle')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Paste the document text…'), {
      target: { value: LONG_TEXT },
    });
    expect(screen.getByTestId('assistant-idle')).toBeInTheDocument();
    // …and it does not run on its own.
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('sends the pasted text and the title hint when asked', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Stool colours' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));

    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
    expect(analyzeMock.mock.calls[0][0]).toEqual({ text: LONG_TEXT, title: 'Stool colours' });
  });

  it('shows the summary, topics, reasons and a confidence band', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));

    const card = within(await screen.findByTestId('assistant-result'));
    expect(card.getByText(/A clinic handout describing what stool colour means/)).toBeInTheDocument();
    expect(card.getByText('when to refer')).toBeInTheDocument();
    expect(card.getByText('The text only ever talks about cats.')).toBeInTheDocument();
    expect(card.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-confidence')).toHaveAttribute('title', '86% confidence');
    expect(card.getByText(/check the species before saving/)).toBeInTheDocument();
  });

  it('applies the proposal to the editable fields and the summary sentence follows', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));
    await screen.findByTestId('assistant-result');

    // Before: the default scope.
    expect(
      screen.getByText(/This document is used by Roleplay customer, Session scoring/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestions' }));

    expect(screen.getByPlaceholderText('Document title')).toHaveValue('Feline stool colour guide');
    expect(screen.getByLabelText('Type')).toHaveValue('custom');
    expect(screen.getByLabelText('Citation')).toHaveValue('Clinic handout, 2026');
    expect(
      screen.getByText('This document is used by Fecal Scan, for cats only.'),
    ).toBeInTheDocument();
    // The card folds to one line so the form is what the admin looks at.
    expect(screen.getByTestId('assistant-folded')).toHaveTextContent('Suggestions applied.');
  });

  it('drops the "suggested" mark from a field the moment it is edited', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));
    await screen.findByTestId('assistant-result');
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestions' }));

    // title, type, focus, tools, species, citation
    expect(screen.getAllByTestId('suggested-tag')).toHaveLength(6);

    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'My own title' },
    });
    expect(screen.getAllByTestId('suggested-tag')).toHaveLength(5);

    fireEvent.click(
      within(screen.getByTestId('add-scope-species')).getByRole('button', { name: 'Adult dog' }),
    );
    expect(screen.getAllByTestId('suggested-tag')).toHaveLength(4);
  });

  it('does not overwrite a title the admin already typed', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Keep this' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));
    await screen.findByTestId('assistant-result');
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestions' }));

    expect(screen.getByPlaceholderText('Document title')).toHaveValue('Keep this');
    expect(screen.getAllByTestId('suggested-tag')).toHaveLength(5);
  });

  it('ingests an analysed PDF as text, with the extracted citation, instead of extracting twice', async () => {
    analyzeMock.mockResolvedValue({
      ...PDF_ANALYSIS,
      analysis: { ...PDF_ANALYSIS.analysis, citation: null },
    });
    renderScreen();
    fireEvent.click(screen.getByText('+ Add document'));

    const file = new File(['%PDF-1.4 fake'], 'stool-colours.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('PDF file'), { target: { files: [file] } });

    expect(screen.getByTestId('assistant-idle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));

    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
    expect(analyzeMock.mock.calls[0][0]).toEqual({ pdfBase64: expect.any(String) });

    await screen.findByTestId('assistant-result');
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestions' }));
    expect(screen.getByLabelText('Citation')).toHaveValue('Extracted citation, 2026');

    fireEvent.click(screen.getByRole('button', { name: 'Add document' }));

    await waitFor(() => expect(ingestKnowledge).toHaveBeenCalledTimes(1));
    const body = (ingestKnowledge.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      text: '# Feline stool colour\n\nExtracted from the PDF.',
      title: 'Feline stool colour guide',
      category: 'custom',
      citation: 'Extracted citation, 2026',
      tags: { focus: 'gi', tools: ['fecal-scan'], species: ['cat'] },
    });
    expect(body.pdfBase64).toBeUndefined();
  });

  it('falls back to the PDF path when no analysis ran', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('+ Add document'));
    const file = new File(['%PDF-1.4 fake'], 'paper.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('PDF file'), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Add document' }));

    await waitFor(() => expect(ingestKnowledge).toHaveBeenCalledTimes(1));
    const body = (ingestKnowledge.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body.pdfBase64).toEqual(expect.any(String));
    expect(body.text).toBeUndefined();
  });

  it('says so when the model fails, and offers a retry', async () => {
    analyzeMock.mockRejectedValueOnce(new Error('upstream timeout'));
    analyzeMock.mockResolvedValueOnce(FECAL_ANALYSIS);
    renderScreen();
    openAddWithText();
    fireEvent.click(screen.getByRole('button', { name: 'Read and suggest' }));

    const failed = await screen.findByTestId('assistant-error');
    expect(within(failed).getByText(/couldn’t read this one/)).toBeInTheDocument();
    expect(within(failed).getByText(/fill it in by hand/)).toBeInTheDocument();

    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('assistant-result');
    expect(analyzeMock).toHaveBeenCalledTimes(2);
  });

  it('runs on its own only when the admin asked it to, and remembers that', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    localStorage.setItem(AUTO_SUGGEST_KEY, '1');
    renderScreen();
    openAddWithText();

    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId('assistant-result');
  });
});

describe('the assistant in the document editor', () => {
  it('reads the stored document by slug and applying makes the form dirty', async () => {
    analyzeMock.mockResolvedValue(FECAL_ANALYSIS);
    renderScreen();
    fireEvent.click(screen.getByText('Dog owner preferences'));
    expect(screen.getByRole('button', { name: 'No changes' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Suggest with AI/ }));

    await waitFor(() => expect(analyzeMock).toHaveBeenCalledTimes(1));
    expect(analyzeMock.mock.calls[0][0]).toEqual({ slug: 'study:davies-2024' });

    await screen.findByTestId('assistant-result');
    fireEvent.click(screen.getByRole('button', { name: 'Apply suggestions' }));

    expect(screen.getByLabelText('Citation')).toHaveValue('Clinic handout, 2026');
    expect(
      screen.getByText('This document is used by Fecal Scan, for cats only.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});
