/**
 * KnowledgeScreen — scopes (who may retrieve a document, for which animals).
 *
 * The isolation promise is only worth something if an admin can SEE it and
 * CHANGE it, so these cases cover the three surfaces that carry it: the list
 * (chips + filters), the editors (multi-select, and the refusal to save a
 * document nothing can retrieve), and "Try a search" — the card that proves a
 * cat document cannot surface for a dog scan instead of asserting it.
 *
 * Same mocking harness as knowledgeScreenErrors.test.tsx: the data layer is
 * stubbed, every pure helper stays real.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = {
  docs: {
    data: [] as unknown[],
    loading: false,
    error: null as string | null,
  },
  overrides: { data: [] as unknown[], loading: false, error: null as string | null },
};

const { ingestKnowledge } = vi.hoisted(() => ({
  ingestKnowledge: vi.fn(async () => ({ ok: true, slug: 'custom:x', chunks: 3 })),
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
import { searchKnowledge, updateKnowledgeDocument } from '../../data/knowledgeActions';
// eslint-disable-next-line import/first
import { AccessProvider } from '../../primitives/access';

const searchMock = vi.mocked(searchKnowledge);
const updateMock = vi.mocked(updateKnowledgeDocument);

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

const FECAL = doc({
  id: 'f',
  slug: 'fecal:dog',
  title: 'Fecal scoring — adult dog',
  source: 'code-seed',
  metadata: { tags: { focus: 'gi', tools: ['fecal-scan'], species: ['dog'] } },
});

function renderScreen(permissions: string[] = ['knowledge.read', 'knowledge.write']) {
  return render(
    <AccessProvider permissions={permissions}>
      <KnowledgeScreen query="" onQuery={() => {}} />
    </AccessProvider>,
  );
}

beforeEach(() => {
  state.docs = { data: [doc(), FECAL], loading: false, error: null };
  state.overrides = { data: [], loading: false, error: null };
  searchMock.mockReset();
  updateMock.mockClear();
  ingestKnowledge.mockClear();
});

describe('scope chips in the list', () => {
  it('names a fecal document by its tool and its one species', () => {
    renderScreen();
    const row = within(screen.getByTestId('doc-row-fecal:dog'));
    expect(row.getByText('Fecal Scan')).toBeInTheDocument();
    expect(row.getByText('Adult dog')).toBeInTheDocument();
  });

  it('collapses an untagged document to the default training scope', () => {
    renderScreen();
    const row = within(screen.getByTestId('doc-row-study:davies-2024'));
    expect(row.getByText('Training (4)')).toBeInTheDocument();
    expect(row.getByText('All species')).toBeInTheDocument();
  });
});

describe('scope filters', () => {
  it('narrows the list to one tool', () => {
    renderScreen();
    expect(screen.getByText('Dog owner preferences')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Fecal Scan (1)'));

    expect(screen.getByText('Fecal scoring — adult dog')).toBeInTheDocument();
    expect(screen.queryByText('Dog owner preferences')).not.toBeInTheDocument();
  });
});

describe('the document editor', () => {
  /*
    Two rows of ticked chips do not tell a non-technical reader what they have
    built. The sentence does, and it is the thing they can agree or disagree
    with before saving.
  */
  it('states the scope as one sentence', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Fecal scoring — adult dog'));
    expect(
      screen.getByText('This document is used by Fecal Scan, for adult dogs only.'),
    ).toBeInTheDocument();
  });

  it('offers nothing to save until something actually changed', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Fecal scoring — adult dog'));
    expect(screen.getByRole('button', { name: 'No changes' })).toBeDisabled();

    fireEvent.click(
      within(screen.getByTestId('doc-scope-species')).getByRole('button', { name: 'Cat' }),
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  // The preview was the tallest thing in the modal and the least-wanted.
  it('keeps the document text folded away until it is asked for', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Fecal scoring — adult dog'));
    expect(screen.queryByTestId('doc-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show the text/ }));
    expect(screen.getByTestId('doc-content')).toBeInTheDocument();
  });

  it('saves the tool and species arrays it was given', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Fecal scoring — adult dog'));

    const scope = screen.getByTestId('doc-scope-tools');
    // A built-in is editable here too: the scope is the admin's call.
    fireEvent.click(within(scope).getByRole('button', { name: 'Coach hints' }));
    fireEvent.click(within(screen.getByTestId('doc-scope-species')).getByRole('button', { name: 'Cat' }));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      slug: 'fecal:dog',
      tools: ['coach', 'fecal-scan'],
      species: ['dog', 'cat'],
    });
  });

  it('refuses to save a document no tool can retrieve', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Fecal scoring — adult dog'));

    const scope = screen.getByTestId('doc-scope-tools');
    fireEvent.click(within(scope).getByRole('button', { name: 'Fecal Scan' }));

    expect(screen.getByText(/at least one tool/i)).toBeInTheDocument();
    expect(screen.getByText('Save changes')).toBeDisabled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('the add-document form', () => {
  it('files a new document under the tools and species that were ticked', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('+ Add document'));
    fireEvent.click(screen.getByText('Paste text'));

    fireEvent.change(screen.getByPlaceholderText('Paste the document text…'), {
      target: { value: 'Loose stool in puppies.' },
    });
    fireEvent.change(screen.getByPlaceholderText('Document title'), {
      target: { value: 'Stool colour guide' },
    });
    // Default is the four training tools; tick Fecal Scan on purpose.
    fireEvent.click(
      within(screen.getByTestId('add-scope-tools')).getByRole('button', { name: 'Fecal Scan' }),
    );
    fireEvent.click(
      within(screen.getByTestId('add-scope-species')).getByRole('button', { name: 'Cat' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add document' }));

    await waitFor(() => expect(ingestKnowledge).toHaveBeenCalled());
    const body = (ingestKnowledge.mock.calls[0] as unknown[])[0] as {
      tags: Record<string, unknown>;
    };
    expect(body.tags.tools).toEqual(['roleplay', 'scoring', 'coach', 'scenario-builder', 'fecal-scan']);
    expect(body.tags.species).toEqual(['dog', 'puppy']);
  });
});

describe('Try a search', () => {
  it('searches in the scope the admin picked and shows what came back', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          content: 'Score 3.5 — moist stool with no cracks, holds a distinct shape.',
          citation: 'Royal Canin — Fecal Scoring System for Dogs',
          tags: { tools: ['fecal-scan'], species: ['dog'], focus: 'gi' },
          similarity: 0.8412,
          docSlug: 'fecal:dog',
          docTitle: 'Fecal scoring — adult dog',
        },
      ],
      appliedFilter: { tools: ['fecal-scan'], species: ['dog'] },
      focusRelaxed: false,
      latencyMs: 142,
    });

    renderScreen();
    await userEvent.selectOptions(screen.getByLabelText('Search as'), 'fecal-scan');
    await userEvent.selectOptions(screen.getByLabelText('Species'), 'dog');
    fireEvent.change(screen.getByPlaceholderText(/what would the tool be looking for/i), {
      target: { value: 'moist stool no cracks' },
    });
    fireEvent.click(screen.getByText('Run'));

    await waitFor(() => expect(searchMock).toHaveBeenCalled());
    expect(searchMock.mock.calls[0][0]).toEqual({
      query: 'moist stool no cracks',
      tool: 'fecal-scan',
      species: 'dog',
      focus: null,
      k: 4,
    });

    const results = await screen.findByTestId('search-results');
    expect(within(results).getByText('Fecal scoring — adult dog')).toBeInTheDocument();
    expect(within(results).getByText('0.84')).toBeInTheDocument();
    expect(screen.getByText(/"tools":\["fecal-scan"\]/)).toBeInTheDocument();
    expect(screen.getByText(/142\s*ms/)).toBeInTheDocument();
  });

  it('says so when the focus filter had to be dropped', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          content: 'Anything at all.',
          citation: null,
          tags: { tools: ['roleplay'], species: ['dog'] },
          similarity: 0.5,
          docSlug: 'study:davies-2024',
          docTitle: 'Dog owner preferences',
        },
      ],
      appliedFilter: { tools: ['roleplay'] },
      focusRelaxed: true,
      latencyMs: 90,
    });

    renderScreen();
    fireEvent.change(screen.getByPlaceholderText(/what would the tool be looking for/i), {
      target: { value: 'cost objection' },
    });
    fireEvent.click(screen.getByText('Run'));

    expect(await screen.findByText(/Focus relaxed/i)).toBeInTheDocument();
  });

  it('reads an empty result as the isolation working, not as a failure', async () => {
    searchMock.mockResolvedValue({
      results: [],
      appliedFilter: { tools: ['fecal-scan'], species: ['cat'] },
      focusRelaxed: false,
      latencyMs: 61,
    });

    renderScreen();
    fireEvent.change(screen.getByPlaceholderText(/what would the tool be looking for/i), {
      target: { value: 'anything' },
    });
    fireEvent.click(screen.getByText('Run'));

    expect(await screen.findByText(/that’s the isolation working/i)).toBeInTheDocument();
  });
});
