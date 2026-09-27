import { getAccessToken } from './supabase';

const FUNCTIONS_BASE = '/.netlify/functions';

/**
 * A non-2xx answer from a Netlify Function. Still an `Error` whose message
 * is the server's own text (every existing `catch` keeps working), but it
 * also carries what the message used to swallow: the HTTP `status`, the
 * function's machine `code` when it sent one, and the parsed `body` (a 409
 * from the scenario save carries the row that won). Callers that map errors
 * to copy should branch on `status` / `code`, never on the wording.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' && body.error ? body.error : `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof body.code === 'string' ? body.code : null;
    this.body = body;
  }
}

async function throwApiError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as unknown;
  throw new ApiError(
    res.status,
    body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {},
  );
}

/**
 * Fetch JSON from an admin Netlify Function. Forwards the user's Supabase
 * JWT as a Bearer token; the function verifies it + checks `is_admin`.
 *
 * Throws an {@link ApiError} on non-2xx (message = the server's error text).
 */
export async function apiFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');

  const url = new URL(`${FUNCTIONS_BASE}/${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

/** POST JSON to an admin Netlify Function, same auth + error contract. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  return (await res.json()) as T;
}

/** Range → days mapping shared with the queries layer. */
const RANGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '28d': 28, '90d': 90 };

/**
 * 'all' fetches from the epoch (rangeToSince) but charts a 1-year window
 * (rangeToDays): trend buckets stay readable while lists and KPI counts
 * include every row ever recorded.
 */
export function rangeToDays(range: string): number {
  if (range === 'all') return 365;
  return RANGE_DAYS[range] ?? 28;
}

export function rangeToSince(range: string): string {
  if (range === 'all') return new Date(0).toISOString();
  const days = rangeToDays(range);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
