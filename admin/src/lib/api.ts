import { getAccessToken } from './supabase';

const FUNCTIONS_BASE = '/.netlify/functions';

/**
 * Fetch JSON from an admin Netlify Function. Forwards the user's Supabase
 * JWT as a Bearer token; the function verifies it + checks `is_admin`.
 *
 * Throws on non-2xx with the server-supplied error message.
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
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
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
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
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
