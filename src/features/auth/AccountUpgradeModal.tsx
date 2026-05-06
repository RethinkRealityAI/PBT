import { useMemo, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { PillButton } from '../../design-system/PillButton';
import { Icon } from '../../design-system/Icon';
import { Segmented } from '../../design-system/Segmented';
import { getSupabase } from './supabaseClient';
import { checkPassword } from './passwordStrength';
import { FLAGS } from '../../app/flags';
import { useProfile } from '../../app/providers/ProfileProvider';
import { readStorage, type StorageKeyDef } from '../../lib/storage';
import type { SessionRecord } from '../../services/types';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};

export interface AccountUpgradeModalProps {
  open: boolean;
  initialMode?: 'signup' | 'signin';
  onClose: () => void;
  /** Called after a successful auth, with the display name used (signup only). */
  onSuccess?: (displayName: string) => void;
}

export function AccountUpgradeModal({
  open,
  initialMode = 'signup',
  onClose,
  onSuccess,
}: AccountUpgradeModalProps) {
  const [mode, setMode] = useState<'signup' | 'signin'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useProfile();

  const pwCheck = useMemo(() => checkPassword(password), [password]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (mode === 'signup' && !pwCheck.ok) {
      setError(pwCheck.feedback);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setError(
        'Supabase is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
      );
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
            // No email confirmation in v1; users sign in immediately.
            emailRedirectTo: FLAGS.EMAIL_VERIFICATION ? undefined : undefined,
          },
        });
        if (error) throw error;
        const userId = data.user?.id;
        if (userId && profile) {
          await sb.from('profiles').upsert({
            user_id: userId,
            display_name: displayName || null,
            echo_primary: profile.primary,
            echo_secondary: profile.secondary,
            echo_tally: profile.tally,
          });
          // Backfill local sessions
          const sessions = readStorage(SESSIONS_KEY);
          if (sessions.length > 0) {
            await sb.from('training_sessions').insert(
              sessions.map((s) => ({
                user_id: userId,
                scenario: { summary: s.scenarioSummary, pushbackId: s.pushbackId },
                transcript: s.transcript,
                score_report: s.scoreReport,
                duration_seconds: s.durationSeconds,
                mode: s.mode,
              })),
            );
          }
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onClose();
      if (mode === 'signup') {
        const name = displayName.trim() || email.split('@')[0];
        onSuccess?.(name);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Auth failed';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
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
          background: 'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 100%)',
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
                {mode === 'signup' ? 'Save your progress' : 'Welcome back'}
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
                {mode === 'signup' ? 'Create your account' : 'Sign in'}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(60,20,15,0.06)',
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

          <div className="mb-3">
            <Segmented
              value={mode}
              onChange={(v) => setMode(v)}
              ariaLabel="Mode"
              options={[
                { value: 'signup', label: 'Sign up' },
                { value: 'signin', label: 'Sign in' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-2">
            {mode === 'signup' && (
              <Field
                label="Display name (optional)"
                value={displayName}
                onChange={setDisplayName}
                placeholder="What should we call you?"
              />
            )}
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@clinic.com"
              type="email"
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder={mode === 'signup' ? 'At least 10 characters' : 'Your password'}
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
                {pwCheck.feedback}
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
                ? 'Working…'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
            </PillButton>
          </div>
          {mode === 'signup' && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--pbt-text-muted)',
                textAlign: 'center',
              }}
            >
              No email verification — you'll be signed in immediately.
            </div>
          )}
        </div>
      </Glass>
    </div>
  );
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
