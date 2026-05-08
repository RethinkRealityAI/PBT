import { useEffect, useRef } from 'react';
import { useSession } from '../../app/providers/SessionProvider';
import { useProfile, type Profile } from '../../app/providers/ProfileProvider';
import { getSupabase } from './supabaseClient';
import { FLAGS } from '../../app/flags';
import { DRIVER_KEYS, type DriverKey } from '../../design-system/tokens';
import {
  backfillLocalDataToCloud,
  hasLocalDataToBackfill,
} from './backfillLocalData';

const DEBOUNCE_MS = 1500;

const isDriverKey = (v: unknown): v is DriverKey =>
  typeof v === 'string' && (DRIVER_KEYS as readonly string[]).includes(v);

/**
 * Two-direction profile sync between Supabase and local state.
 *
 *  - **Push**: when local profile changes (and we're signed in), upsert it
 *    into `profiles` after a debounce.
 *  - **Pull**: on sign-in (or when local profile is missing while
 *    authenticated), fetch the profile row and hydrate local state. This is
 *    what lets a returning user sign in on a fresh device and land on home
 *    with their ECHO already loaded — no quiz redirect.
 *
 * Both directions are best-effort and silent on failure.
 */
export function useCloudSync() {
  const { user } = useSession();
  const { profile, setProfile } = useProfile();
  const profileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedForUserRef = useRef<string | null>(null);
  const backfilledForUserRef = useRef<string | null>(null);

  // ── Anonymous → signed-in backfill ───────────────────────────
  // Catches every auth path (sign-up, sign-in, magic link, external
  // OAuth). The modal triggers this directly too, but having it here
  // means a session restored on a fresh page load also backfills any
  // anonymous activity that happened in this browser.
  useEffect(() => {
    if (!FLAGS.CLOUD_SYNC) return;
    if (!user) {
      backfilledForUserRef.current = null;
      return;
    }
    if (backfilledForUserRef.current === user.id) return;
    if (!hasLocalDataToBackfill()) {
      backfilledForUserRef.current = user.id;
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    backfilledForUserRef.current = user.id;
    void backfillLocalDataToCloud(sb, user.id).catch((err) =>
      console.warn('[cloud-sync] backfill failed', err),
    );
  }, [user]);

  // ── Pull (one-shot per sign-in) ─────────────────────────────
  useEffect(() => {
    if (!FLAGS.CLOUD_SYNC) return;
    if (!user) {
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === user.id) return;
    if (profile) {
      // Already have a local profile — push wins; mark hydrated so we don't
      // overwrite the local copy on next render.
      hydratedForUserRef.current = user.id;
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await sb
        .from('profiles')
        .select('echo_primary, echo_secondary, echo_tally, created_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[cloud-sync] profile pull failed', error);
        return;
      }
      if (
        data &&
        isDriverKey(data.echo_primary) &&
        isDriverKey(data.echo_secondary)
      ) {
        const tally = (data.echo_tally ?? {}) as Record<string, unknown>;
        const safeTally: Record<DriverKey, number> = {
          Activator: typeof tally.Activator === 'number' ? tally.Activator : 0,
          Energizer: typeof tally.Energizer === 'number' ? tally.Energizer : 0,
          Analyzer: typeof tally.Analyzer === 'number' ? tally.Analyzer : 0,
          Harmonizer: typeof tally.Harmonizer === 'number' ? tally.Harmonizer : 0,
        };
        const hydrated: Profile = {
          primary: data.echo_primary,
          secondary: data.echo_secondary,
          tally: safeTally,
          // We don't ship answers in the profiles table — leave empty; the
          // result-screen score percentage gracefully tolerates it.
          answers: [],
          takenAt: data.created_at ?? new Date().toISOString(),
        };
        setProfile(hydrated);
      }
      hydratedForUserRef.current = user.id;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile, setProfile]);

  // ── Push (debounced) ────────────────────────────────────────
  useEffect(() => {
    if (!FLAGS.CLOUD_SYNC) return;
    if (!user || !profile) return;
    const sb = getSupabase();
    if (!sb) return;
    if (profileTimerRef.current) clearTimeout(profileTimerRef.current);
    profileTimerRef.current = setTimeout(() => {
      void sb.from('profiles').upsert({
        user_id: user.id,
        echo_primary: profile.primary,
        echo_secondary: profile.secondary,
        echo_tally: profile.tally,
      });
    }, DEBOUNCE_MS);
    return () => {
      if (profileTimerRef.current) clearTimeout(profileTimerRef.current);
    };
  }, [user, profile]);
}
