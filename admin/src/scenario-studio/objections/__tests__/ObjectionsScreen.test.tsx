/**
 * Scenario Studio → Objections: the list, adding one, retiring, the
 * refused delete (scenarios still use it), restore, read-only roles and the
 * "database update pending" state. The network is stubbed at the Studio's
 * api module; the store and the screen are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '../../../lib/api';

const { fetchObjections, postObjectionOp } = vi.hoisted(() => ({
  fetchObjections: vi.fn(),
  postObjectionOp: vi.fn(),
}));
vi.mock('../../api', () => ({ fetchObjections, postObjectionOp }));

const overrides = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('../../../data/queries', () => ({
  useScenarioOverrides: () => ({ data: overrides.data, loading: false, error: null, refetch: () => {} }),
}));

// eslint-disable-next-line import/first
import { ObjectionsScreen } from '../ObjectionsScreen';
// eslint-disable-next-line import/first
import { resetObjectionsStore } from '../useObjections';
// eslint-disable-next-line import/first
import { AccessProvider } from '../../../primitives/access';
// eslint-disable-next-line import/first
import { ToastProvider } from '../../../primitives/Toast';
// eslint-disable-next-line import/first
import { ConfirmProvider } from '../../../primitives/Confirm';

const WRITER = ['scenarios.read', 'scenarios.write'];

function row(over: Record<string, unknown>): { id: string } & Record<string, unknown> {
  return {
    id: 'team:an-objection',
    title: 'An objection',
    example: '“A line.”',
    title_fr: null,
    example_fr: null,
    species: ['dog', 'cat'],
    focusArea: null,
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

const PRO = row({
  id: 'team:probiotics-not-needed',
  title: 'Probiotics: my pet doesn’t need them',
  example: '“Why would he need probiotics?”',
  focusArea: 'gi',
  usage: { scenarios: 1, live: 0, trainee: 0 },
});
const BORED = row({ id: 'team:cat-bored', title: 'Cat gets bored with the same food', species: ['cat'] });
const GONE = row({ id: 'team:raw-goat-milk', title: 'Raw goat milk', species: ['dog'], deletedAt: '2026-10-11T08:00:00Z' });

function renderScreen(permissions: string[] = WRITER) {
  return render(
    <AccessProvider permissions={permissions}>
      <ToastProvider>
        <ConfirmProvider>
          <ObjectionsScreen query="" onQuery={() => {}} />
        </ConfirmProvider>
      </ToastProvider>
    </AccessProvider>,
  );
}

beforeEach(() => {
  resetObjectionsStore();
  fetchObjections.mockReset();
  postObjectionOp.mockReset();
  fetchObjections.mockResolvedValue({ objections: [PRO, BORED, GONE] });
  overrides.data = [
    {
      scenario_id: 'admin:a1',
      visible: false,
      pushback_id: PRO.id,
      card_title_override: 'Probiotics after antibiotics',
      updated_at: '2026-10-10T00:00:00Z',
    },
  ];
});

describe('ObjectionsScreen', () => {
  it('explains objections and lists the team’s and the built-in ones', async () => {
    renderScreen();
    expect(screen.getByText(/Objections are the pushbacks your scenarios are built on/)).toBeInTheDocument();
    const team = await screen.findByRole('list', { name: 'Your team’s objections' });
    // A→Z when nobody set an order.
    expect(within(team).getAllByRole('listitem').map((li) => li.textContent?.slice(0, 12))).toEqual([
      'Cat gets bor',
      'Probiotics: ',
    ]);
    const pro = within(team).getByText('Probiotics: my pet doesn’t need them').closest('li')!;
    expect(within(pro).getByText('Active')).toBeInTheDocument();
    expect(within(pro).getByText('Dogs & cats')).toBeInTheDocument();
    expect(within(pro).getByText('Digestive health (GI)')).toBeInTheDocument();
    expect(within(pro).getByRole('button', { name: 'Used by 1 scenario (0 live)' })).toBeInTheDocument();
    expect(within(team).getByText('Cats only')).toBeInTheDocument();
    // Deleted ones sit under their own disclosure.
    expect(within(team).queryByText('Raw goat milk')).not.toBeInTheDocument();

    const builtIn = screen.getByRole('list', { name: 'Built-in objections' });
    expect(within(builtIn).getAllByRole('listitem')).toHaveLength(7);
    expect(within(builtIn).getByText('Other pushback')).toBeInTheDocument();
    expect(fetchObjections).toHaveBeenCalledTimes(1);
  });

  it('adds a new objection through the editor', async () => {
    postObjectionOp.mockImplementation(async (body: { objection: Record<string, unknown> }) => ({
      objection: row({ ...body.objection, id: 'team:probiotics-yogurt-is-enough', updatedAt: '2026-10-12T10:00:00Z' }),
    }));
    renderScreen();
    await screen.findByRole('list', { name: 'Your team’s objections' });
    fireEvent.click(screen.getByRole('button', { name: '+ New objection' }));
    const dialog = await screen.findByRole('dialog', { name: 'New objection' });

    // Nothing is sent while required answers are missing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));
    expect(await within(dialog).findByText('Give the objection a short name.')).toBeInTheDocument();
    expect(postObjectionOp).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Probiotics: yogurt is enough' } });
    fireEvent.change(within(dialog).getByLabelText('What an owner typically says'), {
      target: { value: '“I give her yogurt every morning.”' },
    });
    fireEvent.change(within(dialog).getByLabelText('Knowledge topic'), { target: { value: 'gi' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Coaching/ }));
    fireEvent.change(within(dialog).getByLabelText('What the owner is really worried about'), {
      target: { value: 'Thinks probiotics are an upsell\n\nWorried about cost' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add objection' }));

    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    const body = postObjectionOp.mock.calls[0][0];
    expect(body.op).toBe('upsert');
    expect(body.objection).not.toHaveProperty('id');
    expect(body.objection).toMatchObject({
      title: 'Probiotics: yogurt is enough',
      species: ['dog', 'cat'],
      focusArea: 'gi',
      visible: true,
      coaching: { rootConcerns: ['Thinks probiotics are an upsell', 'Worried about cost'] },
    });
    expect(body).not.toHaveProperty('baseUpdatedAt');
    expect(await screen.findByText('Probiotics: yogurt is enough')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retires with the version it loaded, so a concurrent edit can’t be overwritten', async () => {
    postObjectionOp.mockResolvedValue({ objection: row({ ...BORED, visible: false, updatedAt: '2026-10-12T00:00:00Z' }) });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Retire “Cat gets bored with the same food”' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledTimes(1));
    const body = postObjectionOp.mock.calls[0][0];
    expect(body).toMatchObject({ op: 'upsert', baseUpdatedAt: '2026-10-10T10:00:00Z' });
    expect(body.objection).toMatchObject({ id: BORED.id, visible: false });
    expect(await screen.findByRole('button', { name: 'Reactivate “Cat gets bored with the same food”' })).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  it('won’t delete an objection scenarios still use — it names them and offers Retire', async () => {
    postObjectionOp.mockRejectedValue(
      new ApiError(409, {
        error: 'A scenario uses this objection.',
        code: 'in_use',
        scenarios: [{ scenario_id: 'admin:a1', title: 'admin:a1' }],
      }),
    );
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete “Probiotics: my pet doesn’t need them”' }));
    expect(await screen.findByText('Can’t delete it — scenarios still use it')).toBeInTheDocument();
    // Named by the scenario's title, never its id.
    expect(screen.getByText('Probiotics after antibiotics')).toBeInTheDocument();
    expect(screen.queryByText('admin:a1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire instead' })).toBeInTheDocument();
    expect(postObjectionOp).toHaveBeenCalledWith({ op: 'delete', id: PRO.id });
  });

  it('deletes an unused one after asking, and restores it from Recently deleted', async () => {
    postObjectionOp.mockResolvedValue({ ok: true });
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete “Cat gets bored with the same food”' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete “Cat gets bored with the same food”?' });
    fetchObjections.mockResolvedValue({ objections: [PRO, { ...BORED, deletedAt: '2026-10-12T09:00:00Z' }, GONE] });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete objection' }));
    await waitFor(() => expect(postObjectionOp).toHaveBeenCalledWith({ op: 'delete', id: BORED.id }));

    fireEvent.click(await screen.findByRole('button', { name: /Recently deleted \(2\)/ }));
    const deleted = screen.getByRole('list', { name: 'Recently deleted objections' });
    expect(within(deleted).getByText('Cat gets bored with the same food')).toBeInTheDocument();

    postObjectionOp.mockResolvedValue({ objection: { ...GONE, deletedAt: null } });
    fetchObjections.mockResolvedValue({ objections: [PRO, { ...BORED, deletedAt: '2026-10-12T09:00:00Z' }, { ...GONE, deletedAt: null }] });
    await act(async () => {
      fireEvent.click(within(deleted).getByRole('button', { name: 'Restore “Raw goat milk”' }));
    });
    expect(postObjectionOp).toHaveBeenLastCalledWith({ op: 'restore', id: GONE.id });
    expect(await within(screen.getByRole('list', { name: 'Your team’s objections' })).findByText('Raw goat milk')).toBeInTheDocument();
  });

  it('is read-only without scenarios.write', async () => {
    renderScreen(['scenarios.read']);
    await screen.findByRole('list', { name: 'Your team’s objections' });
    expect(screen.getByText(/adding or changing them needs the/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New objection' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retire/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View “Probiotics: my pet doesn’t need them”' }));
    const dialog = await screen.findByRole('dialog', { name: 'Objection' });
    expect(within(dialog).getByLabelText('Name')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /Save|Add objection/ })).not.toBeInTheDocument();
  });

  it('explains calmly when the database update hasn’t been applied', async () => {
    fetchObjections.mockResolvedValue({ objections: [], _notice: 'objections_table_missing' });
    renderScreen();
    expect(await screen.findByText('Your own objections need a database update')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New objection' })).toBeDisabled();
    // The built-ins are still listed.
    expect(within(screen.getByRole('list', { name: 'Built-in objections' })).getAllByRole('listitem')).toHaveLength(7);
  });
});
