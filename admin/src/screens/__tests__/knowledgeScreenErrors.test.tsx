/**
 * KnowledgeScreen: what happens when a read fails.
 *
 * Two different failures, two different honest answers — an empty table is not
 * an acceptable rendering of either:
 *   • documents fail → block the list (an empty table reads as "no documents")
 *   • the scenario cross-read fails → "couldn't check usage", never an empty
 *     "Used by scenarios" section, which reads as "safe to delete".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = {
  docs: {
    data: [] as unknown[],
    loading: false,
    error: null as string | null,
  },
  overrides: { data: [] as unknown[], loading: false, error: null as string | null },
};

vi.mock('../../data/queries', () => ({
  useKnowledgeDocuments: () => state.docs,
  useScenarioOverrides: () => state.overrides,
  deleteKnowledge: vi.fn(),
  ingestBundledStudies: vi.fn(),
  ingestKnowledge: vi.fn(),
  reembedKnowledge: vi.fn(),
  seedKnowledge: vi.fn(),
}));

vi.mock('../../data/knowledgeActions', async () => {
  const actual = await vi.importActual<typeof import('../../data/knowledgeActions')>(
    '../../data/knowledgeActions',
  );
  return {
    ...actual,
    // Network fetchers only — the pure helpers stay real.
    fetchDeletedKnowledge: vi.fn(async () => []),
    restoreKnowledgeDocument: vi.fn(),
    updateKnowledgeDocument: vi.fn(),
  };
});

// eslint-disable-next-line import/first
import { KnowledgeScreen } from '../KnowledgeScreen';
import { AccessProvider } from '../../primitives/access';

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

describe('KnowledgeScreen read errors', () => {
  it('lists documents when the read succeeds', () => {
    state.docs = { data: [doc()], loading: false, error: null };
    state.overrides = { data: [], loading: false, error: null };
    renderScreen();
    expect(screen.getByText('Dog owner preferences')).toBeInTheDocument();
    expect(screen.getByText('+ Add document')).toBeInTheDocument();
  });

  it('blocks the table when the document read fails', () => {
    state.docs = { data: [], loading: false, error: 'Request failed (500)' };
    state.overrides = { data: [], loading: false, error: null };
    renderScreen();
    expect(screen.getByText('Couldn’t load the knowledge library')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    // "No documents yet" would be a lie the admin might act on.
    expect(screen.queryByText('No documents yet')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add document')).not.toBeInTheDocument();
  });

  it('hides the write controls without knowledge.write', () => {
    state.docs = { data: [doc()], loading: false, error: null };
    state.overrides = { data: [], loading: false, error: null };
    renderScreen(['knowledge.read']);
    expect(screen.queryByText('+ Add document')).not.toBeInTheDocument();
    expect(screen.queryByText('Load built-in knowledge')).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
