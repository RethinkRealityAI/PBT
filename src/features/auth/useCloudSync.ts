import { useEffect, useRef } from 'react';
import { useSession } from '../../app/providers/SessionProvider';
import { useProfile } from '../../app/providers/ProfileProvider';
import { getSupabase } from './supabaseClient';
import { FLAGS } from '../../app/flags';

const DEBOUNCE_MS = 1500;

/**
 * When signed in and CLOUD_SYNC is on, mirrors profile + session changes to
 * Supabase with a debounce. Idempotent — safe to call multiple times.
 */
export function useCloudSync() {
  const { user } = useSession();
  const { profile } = useProfile();
  const profileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
