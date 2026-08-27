import { useEffect, useState } from 'react';
import { Glass } from '../design-system/Glass';
import { DriverWave } from '../design-system/DriverWave';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { Icon } from '../design-system/Icon';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useNavigation } from '../app/providers/NavigationProvider';
import { useProfile } from '../app/providers/ProfileProvider';
import { useSession } from '../app/providers/SessionProvider';
import { useTheme, type ThemeMode } from '../app/providers/ThemeProvider';
import { useLanguage } from '../app/providers/LanguageProvider';
import { LOCALES, LOCALE_LABELS, type Locale } from '../i18n/locales';
import { ECHO_DRIVERS } from '../data/echoDrivers';
import { DRIVER_COLORS } from '../design-system/tokens';
import { clearAllStorage } from '../lib/storage';
import { isTrainingUseAllowed, setTrainingUseAllowed } from '../lib/privacy';
import { useDialog } from '../lib/useDialog';
import { useT } from '../i18n/useT';
import { AccountUpgradeModal } from '../features/auth/AccountUpgradeModal';
import { getSupabase } from '../features/auth/supabaseClient';
import { ReportModal } from '../features/reporting/ReportModal';
import type { ReportKind } from '../features/reporting/usePlatformReport';

/**
 * Themed modal fill — dark mode must NOT get a forced-light pane or the
 * near-white `--pbt-text` blends out. See "Modals & overlays" in CLAUDE.md.
 */
const MODAL_FILL_DARK =
  'linear-gradient(165deg, rgba(20,18,26,0.80) 0%, rgba(12,11,17,0.60) 100%)';
const MODAL_FILL_LIGHT =
  'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 100%)';

const DANGER = 'var(--pbt-score-poor)';

export function SettingsScreen() {
  const { go, replace } = useNavigation();
  const { profile, setProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const { user } = useSession();
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | null>(null);
  const [reportKind, setReportKind] = useState<ReportKind | null>(null);
  const [allowTraining, setAllowTraining] = useState(() => isTrainingUseAllowed());
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!profile) {
    return (
      <>
        <TopBar showBack title={t('settings.title')} />
        <Page withTabBar>
          <Glass radius={22} padding={22}>
            <p style={{ color: 'var(--pbt-text-muted)' }}>{t('settings.noProfile')}</p>
          </Glass>
        </Page>
      </>
    );
  }

  const driver = ECHO_DRIVERS[profile.primary];
  const driverColors = DRIVER_COLORS[profile.primary];

  // Derive display identity from auth user; fall back to anonymous session
  const userMeta = (user as { user_metadata?: { display_name?: string } } | null)?.user_metadata;
  const displayName = userMeta?.display_name?.trim()
    || (user?.email ? user.email.split('@')[0] : null);
  const headerName = displayName ?? t('settings.anonymousSession');
  const headerSubtitle = user?.email ?? (user ? '' : t('settings.notSignedIn'));
  const avatarText = displayName
    ? displayName.trim().slice(0, 2).toUpperCase()
    : profile.primary[0];

  return (
    <>
      <TopBar title={t('settings.title')} />
      <Page withTabBar>
        <Glass
          radius={22}
          padding={20}
          glow={driverColors.primary}
          style={{ position: 'relative', overflow: 'hidden', marginBottom: 16 }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              opacity: 0.4,
              pointerEvents: 'none',
            }}
          >
            <DriverWave driver={profile.primary} height={60} />
          </div>
          <div className="relative flex items-center gap-4">
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background:
                  'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 20,
                fontWeight: 700,
                boxShadow: '0 6px 16px -6px oklch(0.55 0.22 18 / 0.5)',
              }}
            >
              {avatarText}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, wordBreak: 'break-word' }}>{headerName}</div>
              {headerSubtitle && (
                <div style={{ fontSize: 13, color: 'var(--pbt-text-muted)', wordBreak: 'break-all' }}>
                  {headerSubtitle}
                </div>
              )}
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: driverColors.primary,
                  marginTop: 2,
                  fontWeight: 700,
                }}
              >
                {driver.name}
              </div>
            </div>
          </div>
        </Glass>

        <SectionHeader>{t('settings.section.practice')}</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          <Row label={t('settings.theme.label')}>
            <Segmented
              value={theme}
              onChange={(v) => setTheme(v as ThemeMode)}
              ariaLabel={t('settings.theme.label')}
              options={[
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
                { value: 'system', label: t('settings.theme.system') },
              ]}
            />
          </Row>
          <Row label={t('settings.language.label')}>
            <Segmented
              value={locale}
              onChange={(v) => setLocale(v as Locale)}
              ariaLabel={t('settings.language.label')}
              options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
            />
          </Row>
          <Row
            label={t('settings.retakeQuiz')}
            onClick={() => { setProfile(null); replace('quiz'); }}
          >
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
        </Glass>

        <SectionHeader>{t('settings.section.account')}</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          {user ? (
            <>
              <Row label={t('settings.signedInAs')}>
                <span style={{ color: 'var(--pbt-text-muted)', fontSize: 12 }}>
                  {user.email}
                </span>
              </Row>
              <Row
                label={t('settings.signOut')}
                onClick={async () => {
                  const sb = getSupabase();
                  if (sb) await sb.auth.signOut();
                }}
              >
                <span style={{ color: DANGER }}>→</span>
              </Row>
              <Row
                label={t('settings.delete.row')}
                labelColor={DANGER}
                onClick={() => setDeleteOpen(true)}
              >
                <span style={{ color: DANGER }}>→</span>
              </Row>
            </>
          ) : (
            <>
              <Row
                label={t('settings.saveProgress')}
                onClick={() => setAuthMode('signup')}
              >
                <span style={{ color: driverColors.primary, fontWeight: 600 }}>
                  {t('settings.signUp')}
                </span>
              </Row>
              <Row label={t('settings.signIn')} onClick={() => setAuthMode('signin')}>
                <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
              </Row>
            </>
          )}
        </Glass>

        <AccountUpgradeModal
          open={authMode !== null}
          initialMode={authMode ?? 'signup'}
          onClose={() => setAuthMode(null)}
        />

        <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />

        <SectionHeader>{t('settings.section.feedback')}</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          <Row label={t('settings.report.bug')} onClick={() => setReportKind('bug')}>
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
          <Row
            label={t('settings.report.suggestion')}
            onClick={() => setReportKind('suggestion')}
          >
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
        </Glass>

        <ReportModal
          open={reportKind !== null}
          initialKind={reportKind ?? 'bug'}
          screen="settings"
          onClose={() => setReportKind(null)}
        />

        <SectionHeader>{t('settings.section.about')}</SectionHeader>
        <Glass radius={20} padding={4} style={{ marginBottom: 16 }}>
          <Row label={t('settings.privacy.label')} sublabel={t('settings.privacy.help')}>
            <Segmented
              value={allowTraining ? 'on' : 'off'}
              onChange={(v) => {
                const next = v === 'on';
                setAllowTraining(next);
                setTrainingUseAllowed(next);
              }}
              ariaLabel={t('settings.privacy.ariaLabel')}
              options={[
                { value: 'on', label: t('settings.privacy.on') },
                { value: 'off', label: t('settings.privacy.off') },
              ]}
            />
          </Row>
          {/* The old "Privacy & data" row was the only route back to the terms
              copy, so keep a dedicated link now that the row is a toggle. */}
          <Row label={t('settings.privacy.terms')} onClick={() => go('onboarding')}>
            <span style={{ color: 'var(--pbt-text-muted)' }}>→</span>
          </Row>
          <Row label={t('settings.version')}>
            <span style={{ color: 'var(--pbt-text-muted)', fontFamily: 'var(--pbt-font-mono)', fontSize: 11 }}>
              0.0.1
            </span>
          </Row>
          <Row
            label={t('settings.reset.row')}
            onClick={() => {
              if (confirm(t('settings.reset.confirm'))) {
                clearAllStorage();
                window.location.reload();
              }
            }}
          >
            <span style={{ color: DANGER }}>
              <Icon.close />
            </span>
          </Row>
        </Glass>
      </Page>
    </>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--pbt-text-muted)',
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  sublabel,
  labelColor,
  onClick,
  children,
}: {
  label: string;
  /** One-line explanation rendered under the label. */
  sublabel?: string;
  labelColor?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: sublabel ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        cursor: onClick ? 'pointer' : 'default',
        borderBottom: '0.5px solid rgba(60,20,15,0.06)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 14, color: labelColor, display: 'block' }}>{label}</span>
        {sublabel && (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--pbt-text-muted)',
              marginTop: 4,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

/**
 * Destructive confirm for self-service account deletion (spec §9.11).
 *
 * Requires typing the localised confirm word, then POSTs the caller's access
 * token to `account-delete`. On success the local device is wiped too —
 * signing out alone would leave the anonymous copy of their history behind.
 */
function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The dialog body only exists while it is open, so its focus/Escape wiring is
  // bound on open and torn down on close — and the typed confirmation never
  // survives a dismiss.
  if (!open) return null;
  return <DeleteAccountDialog onClose={onClose} />;
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmWord = t('settings.delete.confirmWord');
  const canDelete = typed.trim().toUpperCase() === confirmWord.toUpperCase() && !busy;

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  // Escape goes through `close` so a delete already in flight can't be
  // dismissed out from under itself.
  const dialogRef = useDialog<HTMLDivElement>(close);

  // Scrolling the page under an open modal is the one part of the dialog
  // contract that lives outside the dialog element itself.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleDelete = async () => {
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setError(t('settings.delete.error'));
      return;
    }
    setBusy(true);
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error(t('settings.delete.notSignedIn'));

      const res = await fetch('/.netlify/functions/account-delete', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error ?? t('settings.delete.requestFailed', { status: res.status }),
        );
      }

      await sb.auth.signOut().catch(() => {});
      clearAllStorage();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.delete.error'));
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal
      aria-labelledby="pbt-delete-title"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(10, 5, 8, 0.18)',
        backdropFilter: 'blur(10px) saturate(180%)',
        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
        padding: 16,
      }}
    >
      <Glass
        radius={28}
        padding={0}
        glow={DANGER}
        backdropSaturatePct={235}
        style={{
          maxWidth: 420,
          width: '100%',
          background: dark ? MODAL_FILL_DARK : MODAL_FILL_LIGHT,
        }}
      >
        <div style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between" style={{ marginBottom: 14 }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: DANGER,
                  marginBottom: 6,
                }}
              >
                {t('settings.delete.eyebrow')}
              </div>
              <h2
                id="pbt-delete-title"
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  color: 'var(--pbt-text)',
                }}
              >
                {t('settings.delete.title')}
              </h2>
            </div>
            <button
              onClick={close}
              aria-label={t('settings.delete.close')}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,20,15,0.06)',
                cursor: 'pointer',
                color: 'var(--pbt-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon.close />
            </button>
          </div>

          <p
            style={{
              margin: '0 0 16px',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--pbt-text)',
            }}
          >
            {t('settings.delete.confirmBody')}
          </p>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text-muted)',
                fontWeight: 700,
                paddingLeft: 4,
              }}
            >
              {t('settings.delete.typePrompt', { word: confirmWord })}
            </span>
            <input
              type="text"
              value={typed}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t('settings.delete.placeholder', { word: confirmWord })}
              className="pbt-glass-input"
            />
          </label>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                fontSize: 13,
                color: 'var(--pbt-score-poor)',
                padding: '6px 10px',
                borderRadius: 12,
                background: 'color-mix(in oklab, var(--pbt-score-poor) 14%, transparent)',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <PillButton variant="ghost" fullWidth onClick={close} disabled={busy}>
              {t('settings.delete.cancel')}
            </PillButton>
            <PillButton fullWidth onClick={handleDelete} disabled={!canDelete}>
              {busy ? t('settings.delete.working') : t('settings.delete.confirm')}
            </PillButton>
          </div>
        </div>
      </Glass>
    </div>
  );
}
