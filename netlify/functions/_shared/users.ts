/**
 * Auth-user lookups the Supabase admin API doesn't offer directly.
 * `listUsers` is paged, so we walk pages until the address turns up. The
 * cohort is small (hundreds); if it ever isn't, replace this with a
 * `auth.users` view exposed to the service role.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

const PER_PAGE = 1000;
const MAX_PAGES = 10;

export async function findUserByEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === needle);
    if (hit) return hit;
    if (users.length < PER_PAGE) return null;
  }
  return null;
}

/** Map of user id → email, for enriching profile lists. */
export async function emailsByUserId(sb: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) if (u.id && u.email) out.set(u.id, u.email);
    if (users.length < PER_PAGE) break;
  }
  return out;
}
