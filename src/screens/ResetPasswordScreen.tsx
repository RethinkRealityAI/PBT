/**
 * Password reset landing page (`/reset-password`).
 *
 * Reached from the branded recovery email. Supabase's action link redirects
 * here with the recovery grant in the URL fragment; supabase-js consumes it on
 * load and hands us a session, which is what lets `updateUser` set a new
 * password. Nothing else on this screen needs an account.
 *
 * Rendered outside the normal screen state machine (see App.tsx) because the
 * person landing here can't sign in yet — routing them through onboarding or
 * the quiz first would be absurd.
 */
import { useEffect, useState } from 'react';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { GradientBg } from '../design-system/GradientBg';
import { getSupabase } from '../features/auth/supabaseClient';
import { useT } from '../i18n/useT';

const MIN_PASSWORD = 10;

/** How long we wait for supabase-js to turn the URL fragment into a session. */
const GRANT_TIMEOUT_MS = 2500;

type Phase = 'checking' | 'ready' | 'expired' | 'done';

export function ResetPasswordScreen() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let settled = false;
    let sb: ReturnType<typeof getSupabase>;
    try {
      sb = getSupabase();
    } catch {
      setPhase('expired');
      return;
    }
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setPhase(ok ? 'ready' : 'expired');
    };
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) finish(true);
    });
    const timer = window.setTimeout(() => finish(false), GRANT_TIMEOUT_MS);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = password === confirm;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { error: err } = await sb.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      // Confirmation email is a courtesy — never block the reset on it.
      const { data } = await sb.auth.getSession();
      if (data.session) {
        void fetch('/.netlify/functions/auth-recover', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ op: 'confirm' }),
        }).catch(() => {});
      }
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.reset.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <GradientBg />
      <div
        style={{
          position: 'relative',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Glass padding={26} radius={24} style={{ width: 'min(420px, 100%)' }}>
          <div
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
            }}
          >
            {t('auth.reset.eyebrow')}
          </div>

          {phase === 'checking' && (
            <>
              <Title>{t('auth.reset.checking')}</Title>
            </>
          )}

          {phase === 'expired' && (
            <>
              <Title>{t('auth.reset.expired.title')}</Title>
              <Body>{t('auth.reset.expired.body')}</Body>
              <div style={{ marginTop: 16 }}>
                <PillButton fullWidth onClick={() => location.replace('/')}>
                  {t('auth.reset.expired.cta')}
                </PillButton>
              </div>
            </>
          )}

          {phase === 'done' && (
            <>
              <Title>{t('auth.reset.done.title')}</Title>
              <Body>{t('auth.reset.done.body')}</Body>
              <div style={{ marginTop: 16 }}>
                <PillButton fullWidth onClick={() => location.replace('/')}>
                  {t('auth.reset.done.cta')}
                </PillButton>
              </div>
            </>
          )}

          {phase === 'ready' && (
            <>
              <Title>{t('auth.reset.title')}</Title>
              <Body>{t('auth.reset.subtitle')}</Body>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}
              >
                <PasswordField
                  label={t('auth.reset.newPassword')}
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                />
                <PasswordField
                  label={t('auth.reset.confirm')}
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
                {password.length > 0 && !longEnough && (
                  <Hint>{t('auth.pw.short')}</Hint>
                )}
                {confirm.length > 0 && !matches && <Hint>{t('auth.reset.mismatch')}</Hint>}
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
                <div style={{ marginTop: 4 }}>
                  <PillButton
                    fullWidth
                    onClick={submit}
                    disabled={busy || !longEnough || !matches}
                  >
                    {busy ? t('auth.reset.working') : t('auth.reset.submit')}
                  </PillButton>
                </div>
              </form>
            </>
          )}
        </Glass>
      </div>
    </>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1
      style={{
        margin: '8px 0 0',
        fontSize: 26,
        fontWeight: 400,
        letterSpacing: '-0.025em',
        color: 'var(--pbt-text)',
        lineHeight: 1.15,
      }}
    >
      {children}
    </h1>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: '8px 0 0',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--pbt-text-muted)',
      }}
    >
      {children}
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', paddingLeft: 4 }}>{children}</div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 12,
          color: 'var(--pbt-text-muted)',
          marginBottom: 4,
          paddingLeft: 4,
        }}
      >
        {label}
      </span>
      <input
        className="pbt-glass-input"
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
