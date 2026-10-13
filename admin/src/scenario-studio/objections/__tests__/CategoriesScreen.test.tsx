/**
 * Scenario Studio → Categories: each category with its knowledge, animals
 * and objections; adding an objection in a category; retire / refused
 * delete / restore of objections; the category editor (new, built-in,
 * knowledge, `_dropped`); the refused category delete; read-only roles and
 * the "database update pending" state. The network is stubbed at the
 * Studio's api module; the store, the screen and the editors are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../../lib/api';

const { fetchObjections, postObjectionOp } = vi.hoisted(() => ({
  fetchObjections: vi.fn(),
  postObjectionOp: vi.fn(),
}));
vi.mock('../../api', () => ({ fetchObjections, postObjectionOp }));

const data = vi.hoisted(() => ({ overrides: [] as unknown[], docs: [] as unknown[] }));
vi.mock('../../../data/queries', () => ({
  useScenarioOverrides: () => ({ data: data.overrides, loading: false, error: null, refetch: () => {} }),
  useKnowledgeDocuments: () => ({ data: data.docs, loading: false, error: null, refetch: () => {} }),
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
import { doc } from '../../steps/__tests__/harness';

const WRITER = ['scenarios.read', 'scenarios.write', 'knowledge.read', 'knowledge.write'];

function row(over: Record<string, unknown>): { id: string } & Record<string, unknown> {
  return {
    id: 'team:an-objection',
    title: 'An objection',
    example: '“A line.”',
    title_fr: null,
    example_fr: null,
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

function category(over: Record<string, unknown>): { id: string } & Record<string, unknown> {
  return {
    id: 'category:x',
    name: 'X',
    nameFr: null,
    description: '',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: null,
    updatedAt: '2026-10-10T00:00:00Z',
    createdAt: '2026-10-09T00:00:00Z',
    deletedAt: null,
    customised: false,
    usage: { objections: 0, scenarios: 0 },
    ...over,
  };
}

const PRO = row({
  id: 'team:probiotics-not-needed',
  title: 'Probiotics: my pet doesn’t need them',
  example: '“Why would he need probiotics?”',
  usage: { scenarios: 1, live: 0, trainee: 0 },
});
const BORED = row({
  id: 'team:cat-bored',
  title: 'Cat gets bored with the same food',
  species: ['cat'],
  categoryId: 'everyday-nutrition',
});
const GONE = row({ id: 'team:raw-goat-milk', title: 'Raw goat milk', species: ['dog'], categoryId: 'category:gi', deletedAt: '2026-10-11T08:00:00Z' });

const WEIGHT = category({
  id: 'weight',
  name: 'Obesity & weight loss',
  description: 'Overweight pets.',
  knowledgeSlugs: ['study:obesity', 'study:bcs'],
  sortOrder: 20,
  customised: true,
});
const PROBIOTICS = category({
  id: 'category:probiotics',
  name: 'Probiotics',
  nameFr: 'Probiotiques',
  description: 'Owners who doubt a daily probiotic.',
  focusArea: 'gi',
  knowledgeSlugs: ['study:obesity'],
  sortOrder: 40,
  usage: { objections: 1, scenarios: 1 },
});
const GI = category({ id: 'category:gi', name: 'GI', sortOrder: 50 });
const DENTAL = category({ id: 'category:dental', name: 'Dental', sortOrder: 60, deletedAt: '2026-10-11T00:00:00Z' });

function renderScreen(permissions: string[] = WRITER) {
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

const card = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  resetObjectionsStore();
  fetchObjections.mockReset();
  postObjectionOp.mockReset();
  fetchObjections.mockResolvedValue({
    objections: [PRO, BORED, GONE],
    // The server merges the built-ins in; Everyday nutrition and Prescription
    // diets are left out here on purpose — the client adds them back.
    categories: [WEIGHT, PROBIOTICS, GI, DENTAL],
  });
  data.overrides = [
    {
      scenario_id: 'admin:a1',
      visible: false,
      pushback_id: PRO.id,
      card_title_override: 'Probiotics after antibiotics',
      updated_at: '2026-10-10T00:00:00Z',
    },
  ];
  data.docs = [
    doc({ slug: 'study:obesity', title: 'Obesity study', tags: { tools: ['roleplay'], species: ['dog', 'puppy', 'cat'] } }),
    doc({ slug: 'study:gut', title: 'Gut health handout', tags: { focus: 'gi', tools: ['roleplay'], species: ['dog', 'puppy', 'cat'] } }),
  ];
});

describe('CategoriesScreen', () => {
  it('lists every category in order with its knowledge, animals and objections', async () => {
    renderScreen();
    expect(screen.getByText(/Categories are the subjects your team trains on/)).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Probiotics' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Everyday nutrition',
      'Obesity & weight loss',
      'Prescription diets',
      'Probiotics',
      'GI',
    ]);

    const pro = card('Probiotics');
    expect(within(pro).getByText('French: Probiotiques')).toBeInTheDocument();
    expect(within(pro).getByText('1 document · Digestive health (GI)')).toBeInTheDocument();
    expect(within(pro).getAllByText('Dogs & cats').length).toBeGreaterThan(0);
    const proList = within(pro).getByRole('list', { name: 'Objections in Probiotics' });
    expect(within(proList).getByText('Probiotics: my pet doesn’t need them')).toBeInTheDocument();
    expect(within(proList).getByRole('button', { name: 'Used by 1 scenario (0 live)' })).toBeInTheDocument();
    expect(within(pro).getByRole('button', { name: 'Delete the category “Probiotics”' })).toBeInTheDocument();

    // A built-in: renamed, knowledge attached, never deletable; its objections read-only.
    const weight = card('Obesity & weight loss');
    expect(within(weight).getByText('Built in')).toBeInTheDocument();
    expect(within(weight).getByText('2 documents')).toBeInTheDocument();
    expect(within(weight).queryByRole('button', { name: /Delete the category/ })).not.toBeInTheDocument();
    expect(within(weight).getByText('Weight / obesity denial')).toBeInTheDocument();
    expect(within(weight).getByText('Built in · read-only')).toBeInTheDocument();

    // Everyday nutrition holds four built-ins + the team's cat-only one.
    const everyday = card('Everyday nutrition');
    expect(within(everyday).getAllByRole('listitem')).toHaveLength(5);
    expect(within(everyday).getByText('Cats only')).toBeInTheDocument();
    expect(within(everyday).getByText('No knowledge attached — scenarios read the whole library')).toBeInTheDocument();

    // An empty team category says so.
    expect(within(card('GI')).getByText('No objections in this category yet.')).toBeInTheDocument();
    expect(within(card('GI')).getByText('None yet — add an objection')).toBeInTheDocument();
    // "Other pushback" is explained once.
    expect(screen.getByText(/“Other pushback” isn’t in a category/)).toBeInTheDocument();
    expect(fetchObjections).toHaveBeenCalledTimes(1);
  });

  it('adds an objection in the category it was opened from', async () => {
    postObjectionOp.mockImplementation(async (body: { objection: Record<string, unknown> }) => ({
      objection: row({ ...body.objection, id: 'team:its-just-a-sensitive-stomach', updatedAt: '2026-10-12T10:00:00Z' }),
    }));
    renderScreen();
    await screen.findByRole('region', { name: 'GI' });
    fireEvent.click(within(card('GI')).getByRole('button', { name: 'Add an objection to GI' }));
    const dialog = await screen.findByRole('dialog', { name: 'New objection' });
    expect(within(dialog).getByLabelText('Category')).toHaveValue('category:gi');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));
    expect(await within(dialog).findByText('Give the objection a short name.')).toBeInTheDocument();
    expect(postObjectionOp).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'It’s just a sensitive stomach' } });
    fireEvent.change(within(dialog).getByLabelText('What an owner typically says'), {
      target: { value: '“He’s always had a funny tummy.”' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    const body = postObjectionOp.mock.calls[0][0];
    expect(body.op).toBe('upsert');
    expect(body.objection).toMatchObject({ title: 'It’s just a sensitive stomach', categoryId: 'category:gi', species: ['dog', 'cat'] });
    expect(body.objection).not.toHaveProperty('focusArea');
    expect(await within(card('GI')).findByText('It’s just a sensitive stomach')).toBeInTheDocument();
  });

  it('retires with the version it loaded, so a concurrent edit can’t be overwritten', async () => {
    postObjectionOp.mockResolvedValue({ objection: row({ ...BORED, visible: false, updatedAt: '2026-10-12T00:00:00Z' }) });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Retire “Cat gets bored with the same food”' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    expect(postObjectionOp.mock.calls[0][0]).toMatchObject({ op: 'upsert', baseUpdatedAt: '2026-10-10T10:00:00Z' });
    expect(await screen.findByRole('button', { name: 'Reactivate “Cat gets bored with the same food”' })).toBeInTheDocument();
  });

  it('won’t delete an objection scenarios still use — it names them and offers Retire', async () => {
    postObjectionOp.mockRejectedValue(
      new ApiError(409, { error: 'In use', code: 'in_use', scenarios: [{ scenario_id: 'admin:a1', title: 'admin:a1' }] }),
    );
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete “Probiotics: my pet doesn’t need them”' }));
    expect(await screen.findByText('Can’t delete it — scenarios still use it')).toBeInTheDocument();
    expect(screen.getAllByText('Probiotics after antibiotics').length).toBeGreaterThan(0);
    expect(screen.queryByText('admin:a1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire instead' })).toBeInTheDocument();
  });

  it('won’t delete a category objections still live in — it names them', async () => {
    postObjectionOp.mockRejectedValue(
      new ApiError(409, { error: 'In use', code: 'in_use', objections: [{ id: PRO.id, title: PRO.title }] }),
    );
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete the category “Probiotics”' }));
    const alert = await screen.findByText('Can’t delete it — objections still live in it');
    expect(postObjectionOp).toHaveBeenCalledWith({ op: 'delete-category', id: 'category:probiotics' });
    expect(within(alert.closest('[role]') ?? alert.parentElement!).getAllByText(PRO.title as string).length).toBeGreaterThan(0);
  });

  it('deletes an empty category after asking, and restores categories and objections from Recently deleted', async () => {
    postObjectionOp.mockResolvedValue({ ok: true });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete the category “GI”' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete the category “GI”?' });
    fetchObjections.mockResolvedValue({
      objections: [PRO, BORED, GONE],
      categories: [WEIGHT, PROBIOTICS, { ...GI, deletedAt: '2026-10-12T09:00:00Z' }, DENTAL],
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete category' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledWith({ op: 'delete-category', id: 'category:gi' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'GI' })).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: /Recently deleted \(3\)/ }));
    const deletedCats = screen.getByRole('list', { name: 'Recently deleted categories' });
    expect(within(deletedCats).getByText('Dental')).toBeInTheDocument();
    const deletedObjections = screen.getByRole('list', { name: 'Recently deleted objections' });
    expect(within(deletedObjections).getByText(/in GI/)).toBeInTheDocument();

    postObjectionOp.mockResolvedValue({ category: { ...DENTAL, deletedAt: null } });
    await act(async () => {
      fireEvent.click(within(deletedCats).getByRole('button', { name: 'Restore “Dental”' }));
    });
    expect(postObjectionOp).toHaveBeenLastCalledWith({ op: 'restore-category', id: 'category:dental' });
  });

  it('creates a category with knowledge from the library, and says calmly what the server left out', async () => {
    postObjectionOp.mockImplementation(async (body: { category: Record<string, unknown> }) => ({
      category: category({ ...body.category, id: 'category:dental-health', sortOrder: 70 }),
      _dropped: ['study:old-handout'],
    }));
    renderScreen();
    await screen.findByRole('region', { name: 'GI' });
    fireEvent.click(screen.getByRole('button', { name: '+ New category' }));
    const dialog = await screen.findByRole('dialog', { name: 'New category' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await within(dialog).findByText('Give the category a name, e.g. Probiotics.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'probiotics' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await within(dialog).findByText('There’s already a category called “probiotics”.')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Dental health' } });
    fireEvent.change(within(dialog).getByLabelText(/Description/), { target: { value: 'Dental diets and chews.' } });
    fireEvent.change(within(dialog).getByLabelText(/Knowledge topic/), { target: { value: 'gi' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Gut health handout/ }));
    expect(within(dialog).getByText('Scenarios in “Dental health” read: 1 document · Digestive health (GI). With documents ticked, they read only those; the topic is used for new uploads.')).toBeInTheDocument();
    // Uploading is offered (knowledge.write).
    expect(within(dialog).getByRole('button', { name: /Upload a document/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    const body = postObjectionOp.mock.calls[0][0];
    expect(body).toEqual({
      op: 'upsert-category',
      category: {
        name: 'Dental health',
        nameFr: null,
        description: 'Dental diets and chews.',
        focusArea: 'gi',
        knowledgeSlugs: ['study:gut'],
        sortOrder: null,
      },
    });
    expect(await screen.findByRole('region', { name: 'Dental health' })).toBeInTheDocument();
    expect(
      (await screen.findAllByText(/One document wasn’t attached because it’s no longer in the library: study:old-handout/)).length,
    ).toBeGreaterThan(0);
  });

  it('edits a built-in category — saved over “no row yet” the first time', async () => {
    postObjectionOp.mockImplementation(async (body: { category: Record<string, unknown> }) => ({
      category: category({ ...body.category, customised: true, updatedAt: '2026-10-12T11:00:00Z' }),
    }));
    renderScreen();
    await screen.findByRole('region', { name: 'Everyday nutrition' });
    fireEvent.click(within(card('Everyday nutrition')).getByRole('button', { name: 'Edit the category “Everyday nutrition”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).getByText(/Built in — you can rename it and attach knowledge/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Obesity study/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    expect(postObjectionOp.mock.calls[0][0]).toMatchObject({
      op: 'upsert-category',
      baseUpdatedAt: null,
      category: { id: 'everyday-nutrition', knowledgeSlugs: ['study:obesity'] },
    });
    expect(await within(card('Everyday nutrition')).findByText('1 document')).toBeInTheDocument();
  });

  it('a stale category save reloads and keeps the admin’s edits', async () => {
    postObjectionOp.mockRejectedValue(
      new ApiError(409, { error: 'Changed', code: 'stale', current: { ...PROBIOTICS, name: 'Probiotics & gut', updatedAt: '2026-10-12T12:00:00Z' } }),
    );
    renderScreen();
    await screen.findByRole('region', { name: 'Probiotics' });
    fireEvent.click(within(card('Probiotics')).getByRole('button', { name: 'Edit the category “Probiotics”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Probiotics (gut)' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText(/Someone else changed this category while you were editing/)).toBeInTheDocument();
    expect(within(dialog).getByText('“Probiotics & gut”')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Probiotics (gut)');
    expect(postObjectionOp.mock.calls[0][0]).toMatchObject({ baseUpdatedAt: '2026-10-10T00:00:00Z' });
  });

  it('hides Upload a document without knowledge.write, and says why', async () => {
    renderScreen(['scenarios.read', 'scenarios.write', 'knowledge.read']);
    await screen.findByRole('region', { name: 'GI' });
    fireEvent.click(within(card('GI')).getByRole('button', { name: 'Edit the category “GI”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).queryByRole('button', { name: /Upload a document/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Uploading needs the knowledge.write permission/)).toBeInTheDocument();
  });

  it('is read-only without scenarios.write', async () => {
    renderScreen(['scenarios.read']);
    await screen.findByRole('region', { name: 'Probiotics' });
    expect(screen.getByText(/adding or changing them needs the/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New category' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add an objection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();

    fireEvent.click(within(card('Probiotics')).getByRole('button', { name: 'View the category “Probiotics”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Category' });
    expect(within(dialog).getByLabelText('Name')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /Save|Add category/ })).not.toBeInTheDocument();
    // Without knowledge.read the library can't be listed; attached documents are still counted.
    expect(within(dialog).getByText(/1 document is attached — it stays attached/)).toBeInTheDocument();
  });

  it('explains calmly when the database update hasn’t been applied', async () => {
    fetchObjections.mockResolvedValue({ objections: [], categories: [], _notice: 'objections_table_missing' });
    renderScreen();
    expect(await screen.findByText('Your own categories and objections need a database update')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New category' })).toBeDisabled();
    // The built-ins are still listed, with their objections.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Everyday nutrition',
      'Weight management',
      'Prescription diets',
    ]);
    expect(within(card('Prescription diets')).getByText('Skepticism on Rx diet')).toBeInTheDocument();
  });
});
