import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { useSession } from '../../app/providers/SessionProvider';
import { useProfile } from '../../app/providers/ProfileProvider';
import { DRIVER_COLORS } from '../../design-system/tokens';
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
  const { profile } = useProfile();
  const driverColors = profile ? DRIVER_COLORS[profile.primary] : null;
  const dismissedUntil = readStorage(BANNER_KEY);
  const [dismissed, setDismissed] = useState(
    dismissedUntil !== null && new Date(dismissedUntil).getTime() > Date.now(),
  );
  const [open, setOpen] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  // Hide the banner reactively when the user signs in.
  const visible = !user && !dismissed;

  // Auto-dismiss the welcome overlay after 2.5 s.
  useEffect(() => {
    if (!welcomeName) return;
    const t = setTimeout(() => setWelcomeName(null), 2500);
    return () => clearTimeout(t);
  }, [welcomeName]);

  return (
    <>
      {/* Welcome overlay — shown immediately after sign-up */}
      <AnimatePresence>
        {welcomeName && (
          <motion.div
            key="welcome-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(14,3,6,0.72)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              style={{ textAlign: 'center', padding: '0 32px' }}
            >
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'oklch(0.78 0.18 22)',
                  marginBottom: 12,
                }}
              >
                Account created
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.05,
                  color: '#fff',
                }}
              >
                {`Welcome,\n${welcomeName}.`}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save-progress banner — only for anonymous users */}
      {visible && (
        <Glass
          radius={18}
          padding={14}
          style={{ marginBottom: 14 }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--pbt-text)',
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
                border: driverColors
                  ? `1px solid color-mix(in oklab, ${driverColors.primary} 34%, rgba(255,255,255,0.5))`
                  : '1px solid color-mix(in oklab, var(--pbt-driver-primary) 34%, rgba(255,255,255,0.5))',
                borderRadius: 9999,
                background: driverColors
                  ? `linear-gradient(180deg, ${driverColors.primary}, ${driverColors.accent})`
                  : 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: driverColors
                  ? `0 1px 0 rgba(255,255,255,0.34) inset, 0 8px 18px -10px color-mix(in oklab, ${driverColors.primary} 42%, transparent)`
                  : '0 1px 0 rgba(255,255,255,0.34) inset, 0 8px 18px -10px color-mix(in oklab, var(--pbt-driver-primary) 42%, transparent)',
              }}
            >
              Sign up
            </button>
            <button
              onClick={() => {
                const until = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
                writeStorage(BANNER_KEY, until);
                setDismissed(true);
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
      )}

      <AccountUpgradeModal
        open={open}
        initialMode="signup"
        onClose={() => setOpen(false)}
        onSuccess={(name) => setWelcomeName(name)}
      />
    </>
  );
}
