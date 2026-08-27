import { useEffect, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { Segmented } from '../../design-system/Segmented';
import { useTheme } from '../../app/providers/ThemeProvider';
import { getSupabase } from './supabaseClient';
import {
  checkPassword,
  preloadPasswordStrength,
  type PasswordCheck,
  type PasswordFeedbackCode,
} from './passwordStrength';
import type { CatalogKey } from '../../i18n/catalog';
import { FLAGS } from '../../app/flags';
import { useProfile, type Profile } from '../../app/providers/ProfileProvider';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../lib/storage';
import { backfillLocalDataToCloud } from './backfillLocalData';
import { DRIVER_KEYS, type DriverKey } from '../../design-system/tokens';
import { useT } from '../../i18n/useT';
import { useDialog } from '../../lib/useDialog';

const isDriverKey = (v: unknown): v is DriverKey =>
  typeof v === 'string' && (DRIVER_KEYS as readonly string[]).includes(v);

/** Localized password-strength feedback, keyed by the check's stable code. */
const PW_FEEDBACK_KEY: Record<PasswordFeedbackCode, CatalogKey> = {
  empty: 'auth.pw.empty',
  short: 'auth.pw.short',
  score0: 'auth.pw.score0',
  score1: 'auth.pw.score1',
  score2: 'auth.pw.score2',
  score3: 'auth.pw.score3',
  score4: 'auth.pw.score4',
};

/** Seconds the "Resend email" button stays disabled after a send. */
const RESEND_COOLDOWN_S = 60;

/** Supabase's unconfirmed-email sign-in failure, by message or error code. */
const isEmailNotConfirmed = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code ?? '';
  const message = e instanceof Error ? e.message : String(e ?? '');
  return code === 'email_not_confirmed' || /email\s*not\s*confirmed/i.test(message);
};

/**
 * A sign-up that produced a user but no session hasn't been confirmed yet.
 * Supabase also returns an EMPTY `identities` array when the address already
 * exists (enumeration protection) — both cases end in "check your inbox".
 */
const isVerifyPending = (data: {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown | null;
}): boolean => {
  if (!data.user) return false;
  if (!data.session) return true;
  const identities = data.user.identities;
  return Array.isArray(identities) && identities.length === 0;
};

export interface AccountUpgradeModalProps {
  open: boolean;
  initialMode?: 'signup' | 'signin';
  onClose: () => void;
  /** Called after a successful sign-up, with the display name used. */
  onSuccess?: (displayName: string) => void;
  /** Called after a successful sign-in. Caller decides where to navigate. */
  onSignedIn?: () => void;
}

export function AccountUpgradeModal({
  open,
  initialMode = 'signup',
  onClose,
  onSuccess,
  onSignedIn,
}: AccountUpgradeModalProps) {
  // The dialog body only exists while it is open, so its focus/Escape wiring is
  // bound on open and torn down on close — and reopening in the other mode
  // starts from that mode rather than whichever one was last shown.
  if (!open) return null;
  return (
    <AuthDialog
      initialMode={initialMode}
      onClose={onClose}
      onSuccess={onSuccess}
      onSignedIn={onSignedIn}
    />
  );
}

function AuthDialog({
  initialMode,
  onClose,
  onSuccess,
  onSignedIn,
}: Omit<AccountUpgradeModalProps, 'open' | 'initialMode'> & {
  initialMode: 'signup' | 'signin';
}) {
  const [mode, setMode] = useState<'signup' | 'signin'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profile, setProfile } = useProfile();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const t = useT();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // Scrolling the page under an open modal is the one part of the dialog
  // contract that lives outside the dialog element itself.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Email verification (FLAGS.EMAIL_VERIFICATION). Read through a widened
  // boolean so TypeScript doesn't narrow the flag's `false` literal away —
  // every branch below is dead code today and must stay compilable.
  const emailVerification: boolean = FLAGS.EMAIL_VERIFICATION;
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);

  // Password recovery. The request goes to our own function (not Supabase's
  // built-in mailer) so the message is the branded, admin-editable template —
  // and so the reply is identical whether or not the address has an account.
  const [recovery, setRecovery] = useState<'idle' | 'sending' | 'sent'>('idle');
  const requestRecovery = async () => {
    if (!email.trim()) {
      setError(t('auth.forgot.needEmail'));
      return;
    }
    setRecovery('sending');
    setError(null);
    try {
      await fetch('/.netlify/functions/auth-recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'request', email: email.trim(), scope: 'app' }),
      });
    } catch {
      // Silent on purpose — the confirmation copy is the same either way.
    }
    setRecovery('sent');
  };

  // checkPassword is async (zxcvbn's dictionaries load on demand); mirror the
  // latest result into state for the live hint, and re-check at submit time so
  // a fast type-then-click can't race a stale result.
  const [pwCheck, setPwCheck] = useState<PasswordCheck>({
    score: 0,
    feedback: 'Enter a password.',
    code: 'empty',
    ok: false,
  });
  useEffect(() => {
    preloadPasswordStrength();
  }, []);
  useEffect(() => {
    let stale = false;
    checkPassword(password)
      .then((r) => {
        if (!stale) setPwCheck(r);
      })
      // Offline / chunk-load failure: keep the previous hint; submit() will
      // surface a real error if the user proceeds.
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [password]);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = setInterval(() => setResendLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendLeft]);

  const resend = async () => {
    const sb = getSupabase();
    if (!sb || !verifyEmail || resendLeft > 0) return;
    setError(null);
    setResendNote(null);
    setResendLeft(RESEND_COOLDOWN_S);
    try {
      const { error } = await sb.auth.resend({ type: 'signup', email: verifyEmail });
      if (error) throw error;
      setResendNote(t('auth.verify.resent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.error.resend'));
    }
  };

  const leaveVerify = () => {
    setVerifyEmail(null);
    setResendNote(null);
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (mode === 'signup') {
      let check: PasswordCheck;
      try {
        check = await checkPassword(password);
      } catch {
        setError(t('auth.pw.checkFailed'));
        return;
      }
      if (!check.ok) {
        setError(t(PW_FEEDBACK_KEY[check.code]));
        return;
      }
    }
    const sb = getSupabase();
    if (!sb) {
      setError(t('auth.error.notConfigured'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || null },
            // Only meaningful when verification is on: where the confirmation
            // link lands. Omitted entirely in v1 (users sign in immediately).
            ...(emailVerification ? { emailRedirectTo: window.location.origin } : {}),
          },
        });
        if (error) throw error;

        // Verification on + no session yet → nothing is authenticated, so the
        // profile upsert and backfill below would be rejected by RLS. Park the
        // user on the "check your inbox" pane instead of closing the modal.
        if (emailVerification && isVerifyPending(data)) {
          setVerifyEmail(email);
          setResendLeft(RESEND_COOLDOWN_S);
          setBusy(false);
          return;
        }

        const userId = data.user?.id;
        if (userId) {
          if (profile) {
            await sb.from('profiles').upsert({
              user_id: userId,
              display_name: displayName || null,
              echo_primary: profile.primary,
              echo_secondary: profile.secondary,
              echo_tally: profile.tally,
            });
          }
          // Backfill anything they did anonymously: full sessions (with
          // both staff + AI turns + scorecard), pets, analyzer events,
          // and rag_documents. Mirrors the sign-in flow below.
          await backfillLocalDataToCloud(sb, userId);
          // Branded welcome mail. Fire-and-forget: the account already exists,
          // and a mail hiccup must never surface as a failed sign-up.
          void sendWelcomeEmail(sb);
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // ── Sign-in side-effects ─────────────────────────────
        // Returning users have already accepted terms when they originally
        // signed up; persist that locally so the routing layer doesn't
        // bounce a fresh-device sign-in into the onboarding flow.
        if (!readStorage(STORAGE_KEYS.termsAcceptedAt)) {
          writeStorage(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());
        }

        // Hydrate the profile synchronously from cloud so the caller can
        // navigate to home without a quiz-redirect flash. useCloudSync's
        // own hydration runs on the next render — this is just faster.
        const userId = data.user?.id;
        if (userId && !profile) {
          const { data: row } = await sb
            .from('profiles')
            .select('echo_primary, echo_secondary, echo_tally, created_at')
            .eq('user_id', userId)
            .maybeSingle();
          if (
            row &&
            isDriverKey(row.echo_primary) &&
            isDriverKey(row.echo_secondary)
          ) {
            const tally = (row.echo_tally ?? {}) as Record<string, unknown>;
            const safeTally: Record<DriverKey, number> = {
              Activator: typeof tally.Activator === 'number' ? tally.Activator : 0,
              Energizer: typeof tally.Energizer === 'number' ? tally.Energizer : 0,
              Analyzer: typeof tally.Analyzer === 'number' ? tally.Analyzer : 0,
              Harmonizer:
                typeof tally.Harmonizer === 'number' ? tally.Harmonizer : 0,
            };
            const hydrated: Profile = {
              primary: row.echo_primary,
              secondary: row.echo_secondary,
              tally: safeTally,
              answers: [],
              takenAt: row.created_at ?? new Date().toISOString(),
            };
            setProfile(hydrated);
          }

          // Backfill anything done anonymously on this device. Idempotent
          // — re-running for an already-synced returning user is a no-op.
          // Don't await: don't block the modal close on a slow upload.
          void backfillLocalDataToCloud(sb, userId).catch((err) =>
            console.warn('[auth] backfill on sign-in failed', err),
          );
        }
      }
      onClose();
      if (mode === 'signup') {
        const name = displayName.trim() || email.split('@')[0];
        onSuccess?.(name);
      } else {
        onSignedIn?.();
      }
    } catch (e) {
      // Sign-in against an unconfirmed address: route to the same inbox pane
      // so the user gets a resend affordance instead of a dead-end error.
      if (emailVerification && isEmailNotConfirmed(e)) {
        setVerifyEmail(email);
        setResendNote(null);
        setResendLeft(0);
        setError(t('auth.verify.unconfirmed'));
        return;
      }
      const message = e instanceof Error ? e.message : t('auth.error.generic');
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal
      aria-labelledby="pbt-auth-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* Scrim: very light so GradientBg colour survives through the blur.
           Heavy dark scrims desaturate and grey out glass surfaces above them. */
        background: 'rgba(10, 5, 8, 0.18)',
        backdropFilter: 'blur(10px) saturate(180%)',
        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
        padding: 16,
      }}
    >
      <Glass
        radius={28}
        padding={0}
        glow="oklch(0.62 0.22 22)"
        backdropSaturatePct={235}
        /* Override flat fill with the same diagonal gradient the Segmented tab uses —
           that's the look the user wants: bright top-left catchlight fading to 30% bottom. */
        style={{
          maxWidth: 380,
          width: '100%',
          background: dark
            ? 'linear-gradient(165deg, rgba(20,18,26,0.80) 0%, rgba(12,11,17,0.60) 100%)'
            : 'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 100%)',
        }}
      >
        <div style={{ padding: 22 }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div
                style={{
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--pbt-text-muted)',
                  marginBottom: 6,
                }}
              >
                {verifyEmail
                  ? t('auth.verify.eyebrow')
                  : mode === 'signup'
                    ? t('auth.signup.eyebrow')
                    : t('auth.signin.eyebrow')}
              </div>
              <h2
                id="pbt-auth-title"
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  color: 'var(--pbt-text)',
                }}
              >
                {verifyEmail
                  ? t('auth.verify.title')
                  : mode === 'signup'
                    ? t('auth.signup.title')
                    : t('auth.signin.title')}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label={t('auth.close')}
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
              }}
            >
              <Icon.close />
            </button>
          </div>

          {/* Verify-pending pane. Only reachable with FLAGS.EMAIL_VERIFICATION
              on — `verifyEmail` stays null otherwise, so the form below renders
              exactly as it did before this branch existed. */}
          {verifyEmail ? (
            <div className="flex flex-col gap-3">
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--pbt-text)',
                }}
              >
                {t('auth.verify.body', { email: verifyEmail })}
              </p>
              {resendNote && (
                <div style={{ fontSize: 13, color: 'var(--pbt-score-good)' }}>{resendNote}</div>
              )}
              {error && (
                <div
                  role="alert"
                  style={{
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
              <PillButton fullWidth onClick={resend} disabled={resendLeft > 0}>
                {resendLeft > 0
                  ? t('auth.verify.resendIn', { seconds: resendLeft })
                  : t('auth.verify.resend')}
              </PillButton>
              <PillButton variant="ghost" fullWidth onClick={leaveVerify}>
                {t('auth.verify.back')}
              </PillButton>
            </div>
          ) : (
          <>
          <div className="mb-3">
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              ariaLabel={t('auth.mode.aria')}
              options={[
                { value: 'signup', label: t('auth.mode.signup') },
                { value: 'signin', label: t('auth.mode.signin') },
              ]}
            />
          </div>

          <div className="flex flex-col gap-2">
            {mode === 'signup' && (
              <Field
                label={t('auth.field.displayName')}
                value={displayName}
                onChange={setDisplayName}
                placeholder={t('auth.field.displayNamePlaceholder')}
              />
            )}
            <Field
              label={t('auth.field.email')}
              value={email}
              onChange={setEmail}
              placeholder={t('auth.field.emailPlaceholder')}
              type="email"
            />
            <Field
              label={t('auth.field.password')}
              value={password}
              onChange={setPassword}
              placeholder={
                mode === 'signup'
                  ? t('auth.field.passwordPlaceholderSignup')
                  : t('auth.field.passwordPlaceholderSignin')
              }
              type="password"
            />
            {mode === 'signup' && password.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: pwCheck.ok ? 'var(--pbt-score-good)' : 'var(--pbt-text-muted)',
                  paddingLeft: 4,
                }}
              >
                {t(PW_FEEDBACK_KEY[pwCheck.code])}
              </div>
            )}
            {error && (
              <div
                role="alert"
                style={{
                  fontSize: 13,
                  color: 'var(--pbt-score-poor)',
                  padding: '6px 10px',
                  borderRadius: 12,
                  background: 'color-mix(in oklab, var(--pbt-score-poor) 14%, transparent)',
                  marginTop: 4,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div className="mt-4">
            <PillButton
              fullWidth
              icon={<Icon.arrow />}
              onClick={submit}
              disabled={busy || !email || !password}
            >
              {busy
                ? t('auth.submit.working')
                : mode === 'signup'
                  ? t('auth.submit.signup')
                  : t('auth.submit.signin')}
            </PillButton>
          </div>
          {mode === 'signin' && (
            <div style={{ marginTop: 10, textAlign: 'center' }}>
              {recovery === 'sent' ? (
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--pbt-text-muted)' }}>
                  {t('auth.forgot.sent', { email })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={requestRecovery}
                  disabled={recovery === 'sending'}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    fontSize: 12,
                    color: 'var(--pbt-text-muted)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  {recovery === 'sending' ? t('auth.forgot.sending') : t('auth.forgot.link')}
                </button>
              )}
            </div>
          )}
          {mode === 'signup' && !emailVerification && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--pbt-text-muted)',
                textAlign: 'center',
              }}
            >
              {t('auth.noVerificationNote')}
            </div>
          )}
          </>
          )}
        </div>
      </Glass>
    </div>
  );
}

/**
 * Ask the server to send the branded welcome email. The user's own JWT is the
 * authorisation — the endpoint only ever mails the caller's own address.
 */
async function sendWelcomeEmail(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<void> {
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/.netlify/functions/auth-recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ op: 'welcome' }),
    });
  } catch {
    // Non-fatal by design.
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pbt-glass-input"
      />
    </label>
  );
}
