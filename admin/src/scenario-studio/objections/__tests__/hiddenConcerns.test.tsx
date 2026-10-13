/**
 * Categories tab — an objection with no hidden concerns says so on its row
 * ("the AI owner and the scoring will be generic"), and "Add them" opens the
 * editor on Coaching with the hidden-concerns box focused and the reason it
 * matters spelled out. A coached objection, and every built-in, says nothing.
 * The network is stubbed at the Studio's api module; the store, the screen
 * and the editor are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { fetchObjections, postObjectionOp } = vi.hoisted(() => ({
  fetchObjections: vi.fn(),
  postObjectionOp: vi.fn(),
}));
vi.mock('../../api', () => ({ fetchObjections, postObjectionOp }));

vi.mock('../../../data/queries', () => ({
  useScenarioOverrides: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useKnowledgeDocuments: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  ingestKnowledge: vi.fn(),
}));

// eslint-disable-next-line import/first
import { CategoriesScreen } from '../CategoriesScreen';
// eslint-disable-next-line import/first
import { resetObjectionsStore } from '../useObjections';
// eslint-disable-next-line import/first
import { AccessProvider } from '../../../primitives/access';
// eslint-disable-next-line import/first
import { ToastProvider } from '../../../primitives/Toast';
// eslint-disable-next-line import/first
import { ConfirmProvider } from '../../../primitives/Confirm';
// eslint-disable-next-line import/first
import { NO_HIDDEN_CONCERNS } from '../../readinessWarnings';

function row(over: Record<string, unknown>) {
  return {
    id: 'team:probiotics-not-needed',
    title: 'Probiotics: not needed',
    example: '“Why would he need them?”',
    species: ['dog', 'cat'],
    categoryId: 'category:probiotics',
    coaching: {},
    visible: true,
    sortOrder: null,
    updatedAt: '2026-10-10T10:00:00Z',
    createdAt: '2026-10-09T10:00:00Z',
    deletedAt: null,
    usage: { scenarios: 0, live: 0, trainee: 0 },
    ...over,
  };
}

const GENERIC = row({});
const COACHED = row({
  id: 'team:probiotics-upsell',
  title: 'Probiotics: just an upsell',
  coaching: { rootConcerns: ['Feels pressured to buy something extra'] },
});
const PROBIOTICS = {
  id: 'category:probiotics',
  name: 'Probiotics',
  description: '',
  focusArea: null,
  knowledgeSlugs: [],
  sortOrder: 40,
  updatedAt: '2026-10-10T00:00:00Z',
  usage: { objections: 2, scenarios: 0 },
};

function renderScreen(permissions = ['scenarios.read', 'scenarios.write', 'knowledge.read']) {
  return render(
    <AccessProvider permissions={permissions}>
      <ToastProvider>
        <ConfirmProvider>
          <CategoriesScreen query="" onQuery={() => {}} />
        </ConfirmProvider>
      </ToastProvider>
    </AccessProvider>,
  );
}

/** The `<li>` of an objection row, by its name. */
const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

beforeEach(() => {
  resetObjectionsStore();
  fetchObjections.mockReset();
  postObjectionOp.mockReset();
  fetchObjections.mockResolvedValue({ objections: [GENERIC, COACHED], categories: [PROBIOTICS] });
});

describe('Categories tab — objections without hidden concerns', () => {
  it('flags the row, and only that one', async () => {
    renderScreen();
    await screen.findByRole('region', { name: 'Probiotics' });
    expect(within(rowOf('Probiotics: not needed')).getByText(NO_HIDDEN_CONCERNS)).toBeInTheDocument();
    expect(within(rowOf('Probiotics: just an upsell')).queryByText(NO_HIDDEN_CONCERNS)).not.toBeInTheDocument();
    // Built-in objections are coached by the app — never flagged.
    expect(within(screen.getByRole('region', { name: 'Weight management' })).queryByText(NO_HIDDEN_CONCERNS)).not.toBeInTheDocument();
    expect(screen.getAllByText(NO_HIDDEN_CONCERNS)).toHaveLength(1);
  });

  it('“Add them” opens the editor on Coaching, focused on the hidden concerns, and says why they matter', async () => {
    renderScreen();
    await screen.findByRole('region', { name: 'Probiotics' });
    fireEvent.click(screen.getByRole('button', { name: 'Add hidden concerns to “Probiotics: not needed”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit objection' });
    expect(within(dialog).getByRole('button', { name: /^Coaching/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('No hidden concerns yet')).toBeInTheDocument();
    expect(within(dialog).getByText(/the scoring uses them to judge whether the trainee found the real concern/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Trainee hints come from the other boxes/)).toBeInTheDocument();
    const box = within(dialog).getByLabelText(/What the owner is really worried about/);
    await waitFor(() => expect(box).toHaveFocus());
  });

  it('a plain Edit keeps Coaching folded, but its note says it is recommended', async () => {
    renderScreen();
    await screen.findByRole('region', { name: 'Probiotics' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Probiotics: not needed”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit objection' });
    const coaching = within(dialog).getByRole('button', { name: /^Coaching/ });
    expect(coaching).toHaveAttribute('aria-expanded', 'false');
    expect(coaching).toHaveTextContent('Recommended — without hidden concerns the AI owner and the scoring are generic.');
  });

  it('read-only roles see the warning, without the fix', async () => {
    renderScreen(['scenarios.read']);
    await screen.findByRole('region', { name: 'Probiotics' });
    expect(within(rowOf('Probiotics: not needed')).getByText(NO_HIDDEN_CONCERNS)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add hidden concerns/ })).not.toBeInTheDocument();
  });
});
