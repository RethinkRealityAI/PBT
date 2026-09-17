import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ENDPOINTS } from '../../shared/ai/contract';
import { setTrainingUseAllowed } from '../../lib/privacy';

/**
 * The one place the browser talks to the AI functions. Pins the parts every
 * AI call depends on: identity header, privacy/preview flags, base URL,
 * and the error shape callers branch on.
 */
const { session } = vi.hoisted(() => ({
  session: { token: null as string | null, client: true },
}));

vi.mock('../../features/auth/supabaseClient', () => ({
  getSupabase: () =>
    session.client
      ? {
          auth: {
            getSession: async () => ({
              data: { session: session.token ? { access_token: session.token } : null },
            }),
          },
        }
      : null,
}));

import { AiApiError, postAi } from '../aiApi';

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function jsonResponse(status: number, data: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function lastRequest(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];
  return { url, init };
}

beforeEach(() => {
  session.token = null;
  session.client = true;
  fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('postAi — request shape', () => {
  it('POSTs JSON to the same-origin function path with no auth header when anonymous', async () => {
    const out = await postAi<{ ok: boolean }>(AI_ENDPOINTS.roleplay, { scenario: 's' });
    expect(out).toEqual({ ok: true });
    const { url, init } = lastRequest();
    expect(url).toBe(AI_ENDPOINTS.roleplay);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers.authorization).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('attaches the Supabase access token as a Bearer header when signed in', async () => {
    session.token = 'jwt-123';
    await postAi(AI_ENDPOINTS.hint, {});
    expect(lastRequest().init.headers.authorization).toBe('Bearer jwt-123');
  });

  it('still works with Supabase disabled (no env) — anonymous-first', async () => {
    session.client = false;
    await postAi(AI_ENDPOINTS.hint, {});
    expect(lastRequest().init.headers.authorization).toBeUndefined();
  });

  it('merges allowTelemetry + preview defaults into the body', async () => {
    await postAi(AI_ENDPOINTS.evaluate, { transcript: [] });
    const body = JSON.parse(lastRequest().init.body as string);
    expect(body).toEqual({ transcript: [], allowTelemetry: true, preview: false });
  });

  it('reflects the privacy opt-out in allowTelemetry', async () => {
    setTrainingUseAllowed(false);
    await postAi(AI_ENDPOINTS.evaluate, {});
    expect(JSON.parse(lastRequest().init.body as string).allowTelemetry).toBe(false);
  });

  it('leaves caller-set allowTelemetry / preview alone', async () => {
    await postAi(AI_ENDPOINTS.evaluate, { allowTelemetry: false, preview: true });
    const body = JSON.parse(lastRequest().init.body as string);
    expect(body.allowTelemetry).toBe(false);
    expect(body.preview).toBe(true);
  });

  it('prefixes VITE_AI_FUNCTIONS_BASE (trailing slash tolerated) so tests can target netlify dev', async () => {
    vi.stubEnv('VITE_AI_FUNCTIONS_BASE', 'http://localhost:8888/');
    await postAi(AI_ENDPOINTS.vision, {});
    expect(lastRequest().url).toBe(`http://localhost:8888${AI_ENDPOINTS.vision}`);
  });
});

describe('postAi — failures', () => {
  it('maps a non-2xx with a contract error body onto AiApiError {status, code, message}', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(413, { error: 'Image too large', code: 'payload_too_large' }),
    );
    const err = await postAi(AI_ENDPOINTS.vision, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiApiError);
    const e = err as AiApiError;
    expect(e.status).toBe(413);
    expect(e.code).toBe('payload_too_large');
    expect(e.message).toBe('Image too large');
  });

  it("falls back to code 'server' when the error body is missing or unrecognised", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const e = (await postAi(AI_ENDPOINTS.hint, {}).catch((x: unknown) => x)) as AiApiError;
    expect(e).toBeInstanceOf(AiApiError);
    expect(e.status).toBe(500);
    expect(e.code).toBe('server');

    fetchMock.mockResolvedValueOnce(jsonResponse(418, { error: 'teapot', code: 'nonsense' }));
    const e2 = (await postAi(AI_ENDPOINTS.hint, {}).catch((x: unknown) => x)) as AiApiError;
    expect(e2.code).toBe('server');
    expect(e2.message).toBe('teapot');
  });

  it("maps a network failure onto AiApiError {status: 0, code: 'server'}", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const e = (await postAi(AI_ENDPOINTS.roleplay, {}).catch((x: unknown) => x)) as AiApiError;
    expect(e).toBeInstanceOf(AiApiError);
    expect(e.status).toBe(0);
    expect(e.code).toBe('server');
    expect(e.message).toContain('Failed to fetch');
  });

  it('treats a 2xx with a non-JSON body as a server error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('unexpected token');
      },
    });
    const e = (await postAi(AI_ENDPOINTS.roleplay, {}).catch((x: unknown) => x)) as AiApiError;
    expect(e.code).toBe('server');
    expect(e.status).toBe(200);
  });
});
