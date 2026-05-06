import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { useSession } from '../../app/providers/SessionProvider';
import { useProfile } from '../../app/providers/ProfileProvider';
import { useTheme } from '../../app/providers/ThemeProvider';
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
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const driverColors = profile
    ? DRIVER_COLORS[profile.primary]
    : DRIVER_COLORS.Activator;
  const dismissedUntil = readStorage(BANNER_KEY);
  const [dismissed, setDismissed] = useState(
    dismissedUntil !== null && new Date(dismissedUntil).getTime() > Date.now(),
  );
  const [open, setOpen] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  const visible = !user && !dismissed;

  useEffect(() => {
    if (!welcomeName) return;
    const t = setTimeout(() => setWelcomeName(null), 2500);
    return () => clearTimeout(t);
  }, [welcomeName]);

  return (
    <>
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

      {visible && (
        <Glass
          radius={14}
          padding={0}
          blur={dark ? 36 : 22}
          tint={dark ? 0.44 : 0.12}
          style={{ marginBottom: 10, position: 'relative', overflow: 'hidden' }}
        >
          {/* Single rail: dismiss · driver tile · headline · CTA */}
          {/* Single tight row: title (15px, 600) · Sign up · dismiss — matches ACT Guide title height */}
          <div
            className="flex items-center"
            style={{ padding: '8px 8px 8px 16px', gap: 10 }}
          >
            <div
              className="min-w-0 flex-1"
              style={{
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1.2,
                letterSpacing: '-0.015em',
                color: 'var(--pbt-text)',
              }}
            >
              Save your progress
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                border: `1px solid color-mix(in oklab, ${driverColors.primary} 34%, rgba(255,255,255,0.5))`,
                borderRadius: 9999,
                background: `linear-gradient(180deg, ${driverColors.primary}, ${driverColors.accent})`,
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: `0 1px 0 rgba(255,255,255,0.34) inset, 0 6px 14px -8px color-mix(in oklab, ${driverColors.primary} 42%, transparent)`,
              }}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => {
                const until = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
                writeStorage(BANNER_KEY, until);
                setDismissed(true);
              }}
              aria-label="Maybe later"
              style={{
                width: 28,
                height: 28,
                border: 'none',
                borderRadius: '50%',
                background: 'transparent',
                color: 'var(--pbt-text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
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
