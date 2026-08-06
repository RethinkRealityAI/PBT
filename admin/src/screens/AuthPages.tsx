/**
 * Public admin-entry pages that must render BEFORE the admin gate:
 *
 *   /admin/invite?token=…  — accept an invitation and pick a password
 *   /admin/reset           — land here from a recovery email and set a new one
 *
 * Neither requires an existing session, so `App` routes to them ahead of the
 * auth check. Both are deliberately plain: one job, one form, no navigation.
 */
import { useEffect, useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import { COLOR } from '../lib/tokens';
import { getSupabase } from '../lib/supabase';

const MIN_PASSWORD = 10;

interface InviteInfo {
  email: string;
  displayName: string | null;
  roleKey: string;
  roleName: string;
  roleDescription: string;
  expiresAt: string;
  needsPassword: boolean;
}

// ── Invitation acceptance ──────────────────────────────────────────────

export function InviteAcceptPage() {
  const token = useMemo(() => new URLSearchParams(location.search).get('token') ?? '', []);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its invitation token.');
      return;
    }
    let cancelled = false;
    fetch(`/.netlify/functions/invite-accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as InviteInfo & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(body.error ?? 'This invitation link is no longer valid.');
          return;
        }
        setInfo(body);
        setDisplayName(body.displayName ?? '');
      })
      .catch(() => !cancelled && setLoadError('Could not reach the server. Try again in a moment.'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const strong = password.length >= MIN_PASSWORD;
  const matches = password === confirm;
  const ready = info ? (info.needsPassword ? strong && matches : true) : false;

  async function accept() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/invite-accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          displayName: displayName.trim() || undefined,
          ...(info.needsPassword ? { password } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not accept the invitation');

      // Sign them straight in when they just set the password — no reason to
      // make someone type it twice in ten seconds.
      if (info.needsPassword) {
        const { error: signInErr } = await getSupabase().auth.signInWithPassword({
          email: info.email,
          password,
        });
        if (!signInErr) {
          location.replace('/admin');
          return;
        }
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthShell title="Invitation unavailable">
        <p style={bodyText}>{loadError}</p>
        <p style={{ ...bodyText, marginTop: 10 }}>
          Invitation links are single-use and expire. Ask whoever invited you to
          send a fresh one.
        </p>
        <a href="/admin" style={linkStyle}>
          Go to sign in
        </a>
      </AuthShell>
    );
  }

  if (!info) {
    return (
      <AuthShell title="Checking your invitation…">
        <p style={bodyText}>One moment.</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="You’re in">
        <p style={bodyText}>
          Your account now has <strong>{info.roleName}</strong> access. Sign in
          with your existing password to open the portal.
        </p>
        <a href="/admin" style={linkStyle}>
          Go to sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join as ${info.roleName}`}>
      <p style={bodyText}>
        You were invited to the PBT admin portal as <strong>{info.email}</strong>.
      </p>
      {info.roleDescription && (
        <div
          style={{
            fontSize: 12.5,
            color: COLOR.inkSoft,
            lineHeight: 1.55,
            background: 'rgba(60,20,15,0.04)',
            padding: '11px 13px',
            borderRadius: 11,
            margin: '12px 0 4px',
          }}
        >
          {info.roleDescription}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void accept();
        }}
        style={{ display: 'grid', gap: 10, marginTop: 14 }}
      >
        <LabeledInput
          label="Your name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="How your teammates will see you"
        />
        {info.needsPassword ? (
          <>
            <LabeledInput
              label="Choose a password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              hint={`At least ${MIN_PASSWORD} characters.`}
            />
            <LabeledInput
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              hint={confirm && !matches ? 'Passwords don’t match yet.' : undefined}
              hintTone={confirm && !matches ? 'warn' : undefined}
            />
          </>
        ) : (
          <p style={bodyText}>
            This address already has an account, so your existing password keeps
            working — accepting just grants the new access.
          </p>
        )}
        {error && (
          <div role="alert" style={{ color: COLOR.danger, fontSize: 12.5, fontWeight: 600 }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={!ready || busy} style={primaryButton(!ready || busy)}>
          {busy ? 'Setting up…' : 'Accept invitation'}
        </button>
      </form>
    </AuthShell>
  );
}

// ── Password reset ─────────────────────────────────────────────────────

export function ResetPasswordPage() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    // supabase-js consumes the recovery hash on load and emits the session.
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setReady(ok ? 'ok' : 'invalid');
    };
    sb.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) finish(true);
    });
    const timer = window.setTimeout(() => finish(false), 2500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const strong = password.length >= MIN_PASSWORD;
  const matches = password === confirm;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { error: err } = await sb.auth.updateUser({ password });
      if (err) throw new Error(err.message);
      // Fire-and-forget confirmation email; failure must not block the reset.
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
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password');
    } finally {
      setBusy(false);
    }
  }

  if (ready === 'checking') {
    return (
      <AuthShell title="Checking your link…">
        <p style={bodyText}>One moment.</p>
      </AuthShell>
    );
  }

  if (ready === 'invalid') {
    return (
      <AuthShell title="Reset link expired">
        <p style={bodyText}>
          Password reset links are single-use and expire after an hour. Request
          a new one from the sign-in screen.
        </p>
        <a href="/admin" style={linkStyle}>
          Back to sign in
        </a>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated">
        <p style={bodyText}>You’re signed in with your new password.</p>
        <a href="/admin" style={linkStyle}>
          Open the admin portal
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: 'grid', gap: 10 }}
      >
        <LabeledInput
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <LabeledInput
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          hint={confirm && !matches ? 'Passwords don’t match yet.' : undefined}
          hintTone={confirm && !matches ? 'warn' : undefined}
        />
        {error && (
          <div role="alert" style={{ color: COLOR.danger, fontSize: 12.5, fontWeight: 600 }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!strong || !matches || busy}
          style={primaryButton(!strong || !matches || busy)}
        >
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}

// ── Shared chrome ──────────────────────────────────────────────────────

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
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
      <Glass padding={30} radius={22} style={{ width: 420, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: 'linear-gradient(135deg, oklch(0.66 0.22 22), oklch(0.50 0.24 18))',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            P
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink }}>PBT Admin</div>
        </div>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <div style={{ marginTop: 10 }}>{children}</div>
      </Glass>
    </div>
  );
}

export function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  hintTone,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  hintTone?: 'warn';
  autoComplete?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          fontFamily: 'var(--pbt-mono)',
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 11,
          border: '1px solid rgba(60,20,15,0.14)',
          background: '#fff',
          fontFamily: 'var(--pbt-font)',
          fontSize: 13.5,
          color: COLOR.ink,
          outline: 'none',
        }}
      />
      {hint && (
        <span
          style={{
            display: 'block',
            fontSize: 11.5,
            marginTop: 4,
            color: hintTone === 'warn' ? COLOR.warn : COLOR.inkMute,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

export function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    marginTop: 4,
    padding: '11px 16px',
    borderRadius: 12,
    border: 'none',
    background: COLOR.brand,
    color: '#fff',
    fontWeight: 800,
    fontSize: 13.5,
    fontFamily: 'var(--pbt-font)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

const bodyText: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: COLOR.inkSoft,
};

const linkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 16,
  fontSize: 13,
  fontWeight: 700,
  color: COLOR.brand,
  textDecoration: 'none',
};
