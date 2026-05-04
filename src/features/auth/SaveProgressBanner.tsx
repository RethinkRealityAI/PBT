import { useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { useSession } from '../../app/providers/SessionProvider';
import {
  readStorage,
  writeStorage,
  type StorageKeyDef,
} from '../../lib/storage';
import { AccountUpgradeModal } from './AccountUpgradeModal';

const BANNER_KEY: StorageKeyDef<string | null> = {
  key: 'banner_dismissed_until',
  fallback: null,
  validate: (v): v is string | null => v === null || typeof v === 'string',
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function SaveProgressBanner() {
  const { user } = useSession();
  const dismissedUntil = readStorage(BANNER_KEY);
  const [hidden, setHidden] = useState(
    user !== null ||
      (dismissedUntil !== null && new Date(dismissedUntil).getTime() > Date.now()),
  );
  const [open, setOpen] = useState(false);

  if (hidden || user) return null;

  return (
    <>
      <Glass
        radius={18}
        padding={14}
        glow="oklch(0.62 0.22 22)"
        style={{ marginBottom: 14 }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background:
                'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Icon.user />
          </div>
          <div className="flex-1">
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Save your progress
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--pbt-text-muted)',
                marginTop: 2,
              }}
            >
              Keep your scores across devices. No verification needed.
            </div>
          </div>
          <button
            onClick={() => setOpen(true)}
            style={{
              padding: '8px 14px',
              border: 'none',
              borderRadius: 9999,
              background:
                'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign up
          </button>
          <button
            onClick={() => {
              const until = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
              writeStorage(BANNER_KEY, until);
              setHidden(true);
            }}
            aria-label="Maybe later"
            style={{
              width: 32,
              height: 32,
              border: 'none',
              borderRadius: '50%',
              background: 'transparent',
              color: 'var(--pbt-text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon.close />
          </button>
        </div>
      </Glass>
      <AccountUpgradeModal
        open={open}
        initialMode="signup"
        onClose={() => setOpen(false)}
      />
    </>
  );
}
