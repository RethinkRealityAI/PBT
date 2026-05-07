/**
 * Public flag-resolve endpoint.
 *
 * Consumer apps (anonymous + authed) POST a small audience descriptor and
 * receive a `{ flagKey: value }` map for every registered flag, plus any
 * scenario_overrides keyed by scenario_id.
 *
 * Caching: in-function memoization keyed by (audience hash). TTL 60s. The
 * function itself reads with the service role; no JWT required from the
 * caller (resolved values are not sensitive — they're effectively
 * public configuration the consumer would receive anyway).
 *
 * Audience matching for a rule (all keys AND-ed; arrays are OR within):
 *   drivers          — caller's primary driver matches
 *   user_ids         — caller's auth user id matches
 *   anon_session_ids — caller's pbt:session_id matches
 *   percentage       — sticky bucket (hash session id) < percentage
 *   clinic_ids       — reserved (Phase 5)
 *
 * Highest-priority enabled rule whose audience matches wins. If none match,
 * the flag's default_value is returned.
 */
import { errorResponse, getServiceClient, jsonResponse } from './_shared/admin';

const CACHE_TTL_MS = 60_000;

interface AudienceInput {
  user_id?: string | null;
  anon_session_id?: string | null;
  driver?: string | null;
  clinic_id?: string | null;
  preview?: boolean;
}

interface FlagRow {
  key: string;
  default_value: unknown;
  value_type: string;
}

interface RuleRow {
  id: string;
  flag_key: string;
  priority: number;
  audience: Record<string, unknown>;
  value: unknown;
  enabled: boolean;
}

interface OverrideRow {
  scenario_id: string;
  visible: boolean;
  sort_order: number | null;
  title_override: string | null;
  context_override: string | null;
  opening_line_override: string | null;
  difficulty_override: number | null;
  persona_override: string | null;
  prompt_prefix: string | null;
  prompt_suffix: string | null;
}

interface ResolvedSnapshot {
  flags: Record<string, unknown>;
  scenarioOverrides: OverrideRow[];
  fetchedAt: number;
}

let snapshotCache: { value: ResolvedSnapshot; expiresAt: number } | null = null;

async function loadSnapshot(): Promise<{
  flags: FlagRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
}> {
  const sb = getServiceClient();
  const [flagsRes, rulesRes, overridesRes] = await Promise.all([
    sb.from('flags').select('key, default_value, value_type'),
    sb
      .from('flag_rules')
      .select('id, flag_key, priority, audience, value, enabled')
      .eq('enabled', true)
      .order('priority', { ascending: false }),
    sb
      .from('scenario_overrides')
      .select(
        'scenario_id, visible, sort_order, title_override, context_override, opening_line_override, difficulty_override, persona_override, prompt_prefix, prompt_suffix',
      ),
  ]);
  if (flagsRes.error) throw flagsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (overridesRes.error) throw overridesRes.error;
  return {
    flags: (flagsRes.data ?? []) as FlagRow[],
    rules: (rulesRes.data ?? []) as RuleRow[],
    overrides: (overridesRes.data ?? []) as OverrideRow[],
  };
}

/**
 * Stable 0–99 bucket for percentage rollout. djb2 over a salt + identifier
 * keeps the same caller in the same bucket across requests (sticky).
 */
function bucketFor(salt: string, id: string): number {
  let h = 5381;
  const s = `${salt}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

function audienceMatches(
  audience: Record<string, unknown>,
  flagKey: string,
  who: AudienceInput,
): boolean {
  const a = audience ?? {};
  const drivers = Array.isArray(a.drivers) ? (a.drivers as string[]) : null;
  if (drivers && drivers.length > 0) {
    if (!who.driver || !drivers.includes(who.driver)) return false;
  }
  const userIds = Array.isArray(a.user_ids) ? (a.user_ids as string[]) : null;
  if (userIds && userIds.length > 0) {
    if (!who.user_id || !userIds.includes(who.user_id)) return false;
  }
  const anonIds = Array.isArray(a.anon_session_ids)
    ? (a.anon_session_ids as string[])
    : null;
  if (anonIds && anonIds.length > 0) {
    if (!who.anon_session_id || !anonIds.includes(who.anon_session_id)) return false;
  }
  const clinicIds = Array.isArray(a.clinic_ids) ? (a.clinic_ids as string[]) : null;
  if (clinicIds && clinicIds.length > 0) {
    if (!who.clinic_id || !clinicIds.includes(who.clinic_id)) return false;
  }
  if (typeof a.percentage === 'number') {
    const pct = Math.max(0, Math.min(100, a.percentage));
    const id = who.user_id ?? who.anon_session_id ?? '';
    if (!id) return false;
    if (bucketFor(flagKey, id) >= pct) return false;
  }
  return true;
}

function resolveFlags(
  flags: FlagRow[],
  rules: RuleRow[],
  who: AudienceInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of flags) out[f.key] = f.default_value;
  // Rules already sorted by priority desc — first matching rule per key wins.
  const claimed = new Set<string>();
  for (const r of rules) {
    if (claimed.has(r.flag_key)) continue;
    if (audienceMatches(r.audience, r.flag_key, who)) {
      out[r.flag_key] = r.value;
      claimed.add(r.flag_key);
    }
  }
  return out;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }
  let who: AudienceInput = {};
  if (req.method === 'POST') {
    try {
      who = (await req.json()) as AudienceInput;
    } catch {
      return errorResponse(400, 'Invalid JSON');
    }
  } else {
    const params = new URL(req.url).searchParams;
    who = {
      user_id: params.get('user_id'),
      anon_session_id: params.get('anon_session_id'),
      driver: params.get('driver'),
      clinic_id: params.get('clinic_id'),
    };
  }

  try {
    const now = Date.now();
    if (!snapshotCache || snapshotCache.expiresAt < now) {
      const raw = await loadSnapshot();
      snapshotCache = {
        value: {
          // The flags map is audience-dependent so it's recomputed per request,
          // but the underlying rows are reused for CACHE_TTL_MS.
          flags: {},
          scenarioOverrides: raw.overrides,
          fetchedAt: now,
        },
        expiresAt: now + CACHE_TTL_MS,
      };
      // Stash the raw rows on the snapshot for resolve.
      (snapshotCache.value as ResolvedSnapshot & {
        _flags?: FlagRow[];
        _rules?: RuleRow[];
      })._flags = raw.flags;
      (snapshotCache.value as ResolvedSnapshot & {
        _flags?: FlagRow[];
        _rules?: RuleRow[];
      })._rules = raw.rules;
    }
    const snap = snapshotCache.value as ResolvedSnapshot & {
      _flags?: FlagRow[];
      _rules?: RuleRow[];
    };
    const resolved = resolveFlags(snap._flags ?? [], snap._rules ?? [], who);

    return jsonResponse(
      {
        flags: resolved,
        scenarioOverrides: snap.scenarioOverrides,
        fetchedAt: snapshotCache.value.fetchedAt,
      },
      {
        headers: {
          'cache-control': 'public, max-age=30',
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve flags';
    console.error('[flags-resolve]', msg);
    return errorResponse(500, msg);
  }
};
