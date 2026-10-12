import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_SCENARIOS, type Scenario } from '../../../data/scenarios';

const { insert, getSupabase, logEvent } = vi.hoisted(() => ({
  insert: vi.fn(),
  getSupabase: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('../../auth/supabaseClient', () => ({ getSupabase }));
vi.mock('../../../lib/analytics', () => ({ logEvent }));

import { isMissingSpeciesColumn, persistUserScenario } from '../persistScenario';

const DOG: Scenario = SEED_SCENARIOS[0];
const CAT: Scenario = { ...SEED_SCENARIOS[0], species: 'cat', breed: 'Maine Coon' };

beforeEach(() => {
  insert.mockReset();
  getSupabase.mockReset();
  logEvent.mockReset();
  getSupabase.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ insert }),
  });
});

describe('persistUserScenario — species', () => {
  it("writes 'cat' for a cat scenario and 'dog' for a scenario without species", async () => {
    insert.mockResolvedValue({ error: null });
    await persistUserScenario(CAT);
    await persistUserScenario(DOG);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toMatchObject({ species: 'cat', breed: 'Maine Coon' });
    expect(insert.mock.calls[1][0]).toMatchObject({ species: 'dog' });
    expect(logEvent.mock.calls[0][0].meta).toMatchObject({ species: 'cat' });
  });

  it('retries once WITHOUT species when the column is not there yet (PGRST204)', async () => {
    insert
      .mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'species' column of 'user_scenarios' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });
    await persistUserScenario(CAT);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toHaveProperty('species', 'cat');
    const retried = insert.mock.calls[1][0];
    expect(retried).not.toHaveProperty('species');
    expect(retried).toMatchObject({ creator_id: 'user-1', breed: 'Maine Coon', pushback_id: 'weight-denial' });
  });

  it('also retries on Postgres undefined_column (42703)', async () => {
    insert
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column "species" does not exist' } })
      .mockResolvedValueOnce({ error: null });
    await persistUserScenario(DOG);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).not.toHaveProperty('species');
  });

  it('does NOT retry for another error (a different missing column is a real fault)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    insert.mockResolvedValueOnce({
      error: { code: 'PGRST204', message: "Could not find the 'persona' column" },
    });
    await persistUserScenario(CAT);
    expect(insert).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('writes nothing for an anonymous user', async () => {
    getSupabase.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ insert }),
    });
    await persistUserScenario(CAT);
    expect(insert).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledOnce();
  });
});

describe('isMissingSpeciesColumn', () => {
  it('matches only a species-column miss', () => {
    expect(isMissingSpeciesColumn({ code: 'PGRST204', message: "the 'species' column" })).toBe(true);
    expect(isMissingSpeciesColumn({ code: '42703', message: 'column species does not exist' })).toBe(true);
    expect(isMissingSpeciesColumn({ code: '23505', message: 'species' })).toBe(false);
    expect(isMissingSpeciesColumn({ code: '42703', message: 'column persona does not exist' })).toBe(false);
    expect(isMissingSpeciesColumn(null)).toBe(false);
  });
});
