import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postJson } = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock('../../lib/api', () => ({ postJson, apiFetch: vi.fn() }));

import { simulateCustomerTurn, simulateScore } from '../api';
import { SEED_SCENARIOS } from '../../../../src/data/scenarios';

const scenario = SEED_SCENARIOS[0];
const notes = {
  promptPrefix: 'Mention the price twice.',
  promptSuffix: null,
  successCriteria: 'Offers a small-bag trial.',
};

beforeEach(() => {
  postJson.mockReset();
});

describe('Test drive calls — the answer key reaches the scorer only', () => {
  it('a customer turn sends the AI notes but never the success criteria', async () => {
    postJson.mockResolvedValueOnce({ message: { role: 'ai', text: 'Hi', timestamp: 1 } });
    await simulateCustomerTurn({ scenario, history: [], notes });
    const [endpoint, body] = postJson.mock.calls[0];
    expect(endpoint).toBe('ai-roleplay');
    expect(body.promptOverrides).toEqual({ promptPrefix: 'Mention the price twice.', promptSuffix: null });
    expect(JSON.stringify(body)).not.toContain('small-bag trial');
    expect(body).toMatchObject({ preview: true, allowTelemetry: false });
  });

  it('scoring sends the draft criteria explicitly — null when blank, so the saved row is not used', async () => {
    postJson.mockResolvedValue({ report: {} });
    await simulateScore({ scenario, transcript: [], successCriteria: 'Offers a small-bag trial.' });
    await simulateScore({ scenario, transcript: [] });
    const [endpoint, first] = postJson.mock.calls[0];
    expect(endpoint).toBe('ai-evaluate');
    expect(first.promptOverrides).toEqual({ successCriteria: 'Offers a small-bag trial.' });
    expect(first).toMatchObject({ preview: true, allowTelemetry: false });
    expect(postJson.mock.calls[1][1].promptOverrides).toEqual({ successCriteria: null });
  });
});
