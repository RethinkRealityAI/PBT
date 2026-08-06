/**
 * Change your own admin password, from inside the portal.
 *
 * Without this, an account created *for* someone — the "here's a temporary
 * password" route that lets you add admins with no mail provider configured —
 * has no way to ever move off that password except email recovery, which is
 * exactly the thing that isn't working yet. That makes the temporary password
 * permanent, which is worse than not offering the route at all.
 *
 * The current password is re-checked before the change. Supabase would accept
 * `updateUser` on session alone, but a borrowed unlocked laptop shouldn't be
 * enough to lock the real owner out of their own account.
 */
import { useEffect, useState } from 'react';
import { Modal, ModalCloseButton } from '../primitives';
import { COLOR } from '../lib/tokens';
import { getSupabase } from '../lib/supabase';
import { LabeledInput, primaryButton } from './AuthPages';
import { btnSecondary } from './FlagsScreen';

const MIN_PASSWORD = 10;

export function ChangePasswordModal({
  open,
  email,
  onClose,
}: {
  open: boolean;
  email?: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Never leave a typed password sitting in state behind a closed modal.
  useEffect(() => {
    if (!open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
      setDone(false);
    }
  }, [open]);

  const longEnough = next.length >= MIN_PASSWORD;
  const matches = next === confirm;
  const distinct = next !== current;
  const valid = Boolean(current) && longEnough && matches && distinct && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      const address = email ?? sessionData.session?.user.email;
      if (!address) throw new Error('No email address on this session — sign in again.');

      // Re-authenticate. On failure this leaves the existing session intact,
      // because a wrong current password is a typo, not a sign-out event.
      const { error: authErr } = await sb.auth.signInWithPassword({
        email: address,
        password: current,
      });
      if (authErr) throw new Error('That current password is not right.');

      const { error: updateErr } = await sb.auth.updateUser({ password: next });
      if (updateErr) throw new Error(updateErr.message);

      // Best-effort "your password changed" notice. It must not gate success:
      // the password has already changed by this point, and on a deployment
      // with no mail provider it will never send at all.
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
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={440} ariaLabel="Change password">
      <div style={{ padding: 26 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink }}>
            Change password
          </h2>
          <ModalCloseButton onClose={onClose} />
        </div>

        {done ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 13.5, color: COLOR.ink, lineHeight: 1.55 }}>
              Done — your password has been changed. It applies the next time you
              sign in.
            </div>
            <button style={primaryButton(false)} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <LabeledInput
              label="Current password"
              type="password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <LabeledInput
              label="New password"
              type="password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              hint={`At least ${MIN_PASSWORD} characters.`}
            />
            <LabeledInput
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />

            {next && !longEnough && <Hint>Use at least {MIN_PASSWORD} characters.</Hint>}
            {confirm && !matches && <Hint>Those two don’t match.</Hint>}
            {next && distinct === false && <Hint>Pick something different from the current one.</Hint>}
            {error && (
              <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 600 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button style={primaryButton(!valid)} disabled={!valid} onClick={() => void submit()}>
                {busy ? 'Changing…' : 'Change password'}
              </button>
              <button style={btnSecondary} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: COLOR.warn, fontWeight: 600 }}>{children}</div>;
}
