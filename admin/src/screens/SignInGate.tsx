import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { Glass } from '../primitives/Glass';
import { COLOR } from '../lib/tokens';

/**
 * Email-password sign-in plus branded password recovery.
 *
 * Admin gating is enforced server-side (`admin-whoami` → `requireAdmin`);
 * signing in successfully is not the same as getting in. Recovery posts to our
 * own endpoint rather than `resetPasswordForEmail` so the mail goes out through
 * the configured provider using the editable template — and so the response
 * says the same thing whether or not the address exists.
 */
export function SignInGate() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false);
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fetch('/.netlify/functions/auth-recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'request', email, scope: 'admin' }),
      });
    } catch {
      // Deliberately silent: the confirmation copy is identical either way.
    }
    setSent(true);
    setBusy(false);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Glass padding={28} radius={20} style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLOR.ink }}>PBT Admin</div>
        <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 4, lineHeight: 1.5 }}>
          {mode === 'signin'
            ? 'Sign in to manage the platform.'
            : 'Enter your address and we’ll send a reset link.'}
        </div>

        {mode === 'signin' ? (
          <form onSubmit={signIn} style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            <input
              type="email"
              placeholder="email@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete="current-password"
              required
            />
            <button type="submit" disabled={busy} style={buttonStyle(busy)}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {error && (
              <div style={{ color: COLOR.danger, fontSize: 12, fontWeight: 600 }} role="alert">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
              }}
              style={linkButton}
            >
              Forgot your password?
            </button>
          </form>
        ) : sent ? (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: COLOR.inkSoft,
                background: 'rgba(60,20,15,0.04)',
                padding: '12px 14px',
                borderRadius: 12,
              }}
            >
              If <strong>{email}</strong> has an account, a reset link is on its
              way. It expires in an hour and can only be used once.
            </div>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setSent(false);
              }}
              style={linkButton}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={requestReset} style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            <input
              type="email"
              placeholder="email@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoComplete="username"
              required
            />
            <button type="submit" disabled={busy} style={buttonStyle(busy)}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              style={linkButton}
            >
              Back to sign in
            </button>
          </form>
        )}
      </Glass>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '0.5px solid rgba(60,20,15,0.15)',
  background: '#fff',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
  color: COLOR.ink,
  outline: 'none',
};

function buttonStyle(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 12,
    border: 'none',
    background: COLOR.brand,
    color: '#fff',
    fontWeight: 800,
    cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'var(--pbt-font)',
  };
}

const linkButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  marginTop: 4,
  color: COLOR.inkMute,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  justifySelf: 'start',
};
