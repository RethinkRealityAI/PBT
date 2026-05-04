import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DRIVER_COLORS,
  DRIVER_KEYS,
  type DriverKey,
} from '../../design-system/tokens';
import {
  readStorage,
  writeStorage,
  type StorageKeyDef,
} from '../../lib/storage';

export interface Profile {
  primary: DriverKey;
  secondary: DriverKey;
  tally: Record<DriverKey, number>;
  answers: DriverKey[];
  takenAt: string;
}

const isDriverKey = (v: unknown): v is DriverKey =>
  typeof v === 'string' && (DRIVER_KEYS as readonly string[]).includes(v);

const isProfile = (v: unknown): v is Profile => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Profile;
  return (
    isDriverKey(p.primary) &&
    isDriverKey(p.secondary) &&
    Array.isArray(p.answers) &&
    p.answers.every(isDriverKey) &&
    typeof p.tally === 'object' &&
    p.tally !== null &&
    typeof p.takenAt === 'string'
  );
};

const PROFILE_KEY: StorageKeyDef<Profile | null> = {
  key: 'profile',
  fallback: null,
  validate: (v): v is Profile | null => v === null || isProfile(v),
};

interface ProfileContextValue {
  profile: Profile | null;
  /** True once a profile is set; canvas should tint to the primary driver color. */
  locked: boolean;
  setProfile: (profile: Profile | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(() =>
    readStorage(PROFILE_KEY),
  );

  const setProfile = useCallback((next: Profile | null) => {
    setProfileState(next);
    writeStorage(PROFILE_KEY, next);
  }, []);

  // Apply driver-tint CSS variables to :root so all glass/wave components react.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (profile) {
      const c = DRIVER_COLORS[profile.primary];
      root.style.setProperty('--pbt-driver-primary', c.primary);
      root.style.setProperty('--pbt-driver-accent', c.accent);
      root.style.setProperty('--pbt-driver-soft', c.soft);
      root.style.setProperty('--pbt-driver-wave', c.wave);
    } else {
      const c = DRIVER_COLORS.Activator;
      root.style.setProperty('--pbt-driver-primary', c.primary);
      root.style.setProperty('--pbt-driver-accent', c.accent);
      root.style.setProperty('--pbt-driver-soft', c.soft);
      root.style.setProperty('--pbt-driver-wave', c.wave);
    }
  }, [profile]);

  const value = useMemo(
    () => ({ profile, locked: profile !== null, setProfile }),
    [profile, setProfile],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    return { profile: null, locked: false, setProfile: () => {} };
  }
  return ctx;
}
