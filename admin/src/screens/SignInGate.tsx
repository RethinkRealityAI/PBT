import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { Glass } from '../primitives/Glass';
import { COLOR } from '../lib/tokens';

/**
 * Minimal email-password sign-in. Admin gating is enforced server-side via
 * the `is_admin` RLS policy — non-admins land on the not-authorised screen.
 */
export function SignInGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (err) setError(err.message);
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
      <Glass padding={28} radius={20} style={{ width: 360 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLOR.ink }}>
          PBT Admin
        </div>
        <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 4 }}>
          Sign in to view platform telemetry.
        </div>
        <form onSubmit={submit} style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          <input
            type="email"
            placeholder="email@clinic.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: COLOR.brand,
              color: '#fff',
              fontWeight: 800,
              cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'var(--pbt-font)',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {error && (
            <div
              style={{ color: COLOR.danger, fontSize: 12, fontWeight: 600 }}
              role="alert"
            >
              {error}
            </div>
          )}
        </form>
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
