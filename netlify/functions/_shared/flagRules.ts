/**
 * Feature-switch resolution — ONE implementation for every server path.
 *
 * `flags-resolve` uses it to build the app's snapshot; `ai-voice-token` uses
 * it to refuse a voice session when *Voice mode in chat* is off for the
 * caller. Same rule order, same audience matching, same sticky percentage
 * buckets, so the server never disagrees with what the app was shown.
 *
 * Audience matching for a rule (all keys AND-ed; arrays are OR within):
 *   drivers          — caller's primary driver matches
 *   user_ids         — caller's auth user id matches
 *   anon_session_ids — caller's pbt:session_id matches
 *   percentage       — sticky bucket (hash of user id, else session id) < percentage
 *   clinic_ids       — reserved
 *
 * Highest-priority enabled rule whose audience matches wins. If none match,
 * the flag's default_value applies.
 *
 * Flags are configuration, not access control: the audience beyond the
 * verified user id is whatever the caller says it is.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AudienceInput {
  user_id?: string | null;
  anon_session_id?: string | null;
  driver?: string | null;
  clinic_id?: string | null;
  preview?: boolean;
}

export interface FlagRow {
  key: string;
  default_value: unknown;
  value_type: string;
}

export interface RuleRow {
  id: string;
  flag_key: string;
  priority: number;
  audience: Record<string, unknown>;
  value: unknown;
  enabled: boolean;
}

/**
 * Stable 0–99 bucket for percentage rollout. djb2 over a salt + identifier
 * keeps the same caller in the same bucket across requests (sticky).
 */
export function bucketFor(salt: string, id: string): number {
  let h = 5381;
  const s = `${salt}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

export function audienceMatches(
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

/** `rules` must be enabled-only and sorted by priority, highest first. */
export function resolveFlags(
  flags: FlagRow[],
  rules: RuleRow[],
  who: AudienceInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of flags) out[f.key] = f.default_value;
  // First matching rule per key wins.
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

const SWITCH_CACHE_TTL_MS = 30_000;
const switchCache = new Map<string, { flag: FlagRow | null; rules: RuleRow[]; at: number }>();

/** Test hook — forget cached switch rows. */
export function resetSwitchCache(): void {
  switchCache.clear();
}

/**
 * Is a boolean switch on for this caller? Reads the one flag row and its
 * enabled rules (cached 30 s per instance), then resolves exactly as
 * `flags-resolve` does.
 *
 * FAIL-OPEN: a missing flag row, a read error or a non-boolean value all
 * answer `true`. A database hiccup must not switch a working feature off;
 * the admin's explicit `false` is the only thing that does.
 */
export async function isSwitchOn(
  sb: SupabaseClient,
  key: string,
  who: AudienceInput,
  now = Date.now(),
): Promise<boolean> {
  try {
    let entry = switchCache.get(key);
    if (!entry || now - entry.at > SWITCH_CACHE_TTL_MS) {
      const [flagRes, rulesRes] = await Promise.all([
        sb.from('flags').select('key, default_value, value_type').eq('key', key).maybeSingle(),
        sb
          .from('flag_rules')
          .select('id, flag_key, priority, audience, value, enabled')
          .eq('flag_key', key)
          .eq('enabled', true)
          .order('priority', { ascending: false }),
      ]);
      if (flagRes.error || rulesRes.error) {
        console.warn('[flags] switch read failed; treating as on', key, flagRes.error ?? rulesRes.error);
        return true;
      }
      entry = {
        flag: (flagRes.data ?? null) as FlagRow | null,
        rules: (rulesRes.data ?? []) as RuleRow[],
        at: now,
      };
      switchCache.set(key, entry);
    }
    if (!entry.flag) return true;
    const value = resolveFlags([entry.flag], entry.rules, who)[key];
    return value !== false;
  } catch (err) {
    console.warn('[flags] switch read threw; treating as on', key, err);
    return true;
  }
}
