/**
 * The signed-in admin's own password.
 *
 *   • `ChangePasswordDialog` — "Change password" in the account area of the
 *     sidebar: new password + confirm, show/hide, at least 12 characters.
 *   • `ChooseOwnPasswordScreen` — shown right after sign-in, BEFORE the
 *     portal, when an admin is still on a temporary password someone set for
 *     them (`user_metadata.must_change_password === true`, set by
 *     `admin-user-actions` op `set_password`). Sign out is the only other way
 *     out.
 *
 * Both call Supabase Auth's `updateUser` with the new password AND clear the
 * flag in the same call, so a changed password never keeps nagging.
 */
import { useId, useState, type CSSProperties } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Modal, ModalCloseButton } from '../primitives';
import { Button, InlineAlert } from '../primitives/form';
import { useToast } from '../primitives/Toast';
import { COLOR } from '../lib/tokens';
import { getSupabase } from '../lib/supabase';
import {
  MAX_ADMIN_PASSWORD,
  MIN_ADMIN_PASSWORD,
  MUST_CHANGE_PASSWORD_KEY,
  passwordChangeError,
  passwordProblem,
} from '../lib/passwords';
import { AuthShell } from './AuthPages';

/** Set the signed-in user's password and clear the temporary-password flag. */
export async function updateOwnPassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({
    password,
    data: { [MUST_CHANGE_PASSWORD_KEY]: false },
  });
  if (error) throw error;
}

// ── The two fields ───────────────────────────────────────────

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 44px 11px 13px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.16)',
  background: 'rgba(255,255,255,0.85)',
  fontSize: 15,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: COLOR.ink };

export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  showProblem,
  disabled,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  /** Show what's wrong (after a submit attempt), not while typing the first character. */
  showProblem: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const pwId = useId();
  const confirmId = useId();
  const hintId = useId();
  const problem = passwordProblem(password, confirm);
  const tooShortSoFar = password.length > 0 && password.length < MIN_ADMIN_PASSWORD;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <label htmlFor={pwId} style={labelStyle}>
          New password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id={pwId}
            type={visible ? 'text' : 'password'}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={MAX_ADMIN_PASSWORD + 8}
            disabled={disabled}
            aria-describedby={hintId}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? 'Hide passwords' : 'Show passwords'}
            title={visible ? 'Hide passwords' : 'Show passwords'}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 34,
              height: 34,
              borderRadius: 9,
              border: 'none',
              background: 'transparent',
              color: COLOR.inkSoft,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {visible ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
          </button>
        </div>
        <div
          id={hintId}
          style={{ fontSize: 12, lineHeight: 1.5, color: tooShortSoFar ? 'oklch(0.45 0.14 70)' : COLOR.inkMute }}
        >
          At least {MIN_ADMIN_PASSWORD} characters{tooShortSoFar ? ` — ${MIN_ADMIN_PASSWORD - password.length} to go` : ''}. A
          short sentence you’ll remember works well.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <label htmlFor={confirmId} style={labelStyle}>
          Type it again
        </label>
        <input
          id={confirmId}
          type={visible ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          autoComplete="new-password"
          maxLength={MAX_ADMIN_PASSWORD + 8}
          disabled={disabled}
          style={{ ...inputStyle, paddingRight: 13 }}
        />
      </div>
      {showProblem && problem && (
        <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.danger }}>
          {problem}
        </div>
      )}
    </div>
  );
}

// ── "Change password" (account area) ─────────────────────────

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width={460} ariaLabel="Change your password">
      {open && <ChangePasswordBody onClose={onClose} />}
    </Modal>
  );
}

function ChangePasswordBody({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (passwordProblem(password, confirm)) return;
    setBusy(true);
    setError(null);
    try {
      await updateOwnPassword(password);
      toast({ tone: 'success', message: 'Password changed. Use the new one next time you sign in.' });
      onClose();
    } catch (err) {
      setError(passwordChangeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} style={{ padding: 'clamp(18px, 4vw, 24px)', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: COLOR.brand,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <KeyRound size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.02em' }}>
            Change your password
          </h2>
          <div style={{ marginTop: 4, fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.5 }}>
            You stay signed in here. Next time, sign in with the new one.
          </div>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPassword={setPassword}
        onConfirm={setConfirm}
        showProblem={tried}
        disabled={busy}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" tone="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" tone="primary" busy={busy}>
          Change password
        </Button>
      </div>
    </form>
  );
}

// ── "Choose your own password" (after sign-in, temporary password) ──

export function ChooseOwnPasswordScreen({
  email,
  onDone,
  onSignOut,
}: {
  email: string | null;
  /** The password is changed and the flag cleared — continue into the portal. */
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    if (passwordProblem(password, confirm)) return;
    setBusy(true);
    setError(null);
    try {
      await updateOwnPassword(password);
      onDone();
    } catch (err) {
      setError(passwordChangeError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose your own password">
      <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: COLOR.inkSoft }}>
          {email ? (
            <>
              You signed in as <strong style={{ color: COLOR.ink }}>{email}</strong> with a temporary password.
            </>
          ) : (
            'You signed in with a temporary password.'
          )}{' '}
          Choose one only you know before you continue.
        </p>
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          showProblem={tried}
          disabled={busy}
        />
        <Button type="submit" tone="primary" busy={busy} style={{ width: '100%', padding: '12px 16px' }}>
          Save and continue
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          disabled={busy}
          style={{
            border: 'none',
            background: 'none',
            padding: 0,
            fontSize: 13,
            fontWeight: 700,
            color: COLOR.inkSoft,
            cursor: busy ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            justifySelf: 'center',
            fontFamily: 'var(--pbt-font)',
          }}
        >
          Sign out instead
        </button>
      </form>
    </AuthShell>
  );
}
