/**
 * People → user → Manage → "Set a temporary password".
 *
 * For someone who can't sign in (a new admin, a forgotten password the
 * recovery email isn't reaching). The admin either generates a strong one in
 * the browser (`crypto.getRandomValues`, unambiguous letters — shown ONCE,
 * after it's set, with Copy) or types one (12+ characters). The server
 * (`admin-user-actions` op `set_password`, `team.manage`) sets it and flags
 * the account, so the person is asked to choose their own password the next
 * time they sign in.
 *
 * Visibility is the caller's call (`canSetTemporaryPassword`): never for
 * yourself (use Change password), and an owner's only by an owner — the
 * server refuses both anyway.
 */
import { useId, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button, InlineAlert } from '../primitives/form';
import { COLOR } from '../lib/tokens';
import { runUserAction } from '../data/queries';
import {
  MAX_ADMIN_PASSWORD,
  MIN_ADMIN_PASSWORD,
  generateTemporaryPassword,
  passwordProblem,
} from '../lib/passwords';

/** Who may set someone's temporary password — mirrors the server's rules. */
export function canSetTemporaryPassword(args: {
  canTeamManage: boolean;
  isSelf: boolean;
  targetIsOwner: boolean;
  actorIsOwner: boolean;
}): boolean {
  if (!args.canTeamManage || args.isSelf) return false;
  return !args.targetIsOwner || args.actorIsOwner;
}

type Mode = 'generate' | 'type';

export function TemporaryPassword({
  userId,
  name,
  disabled,
}: {
  userId: string;
  /** How to refer to the person in the copy ("Chester", or their email). */
  name: string;
  /** Another account action is running. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('generate');
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The password that was just set — shown once, then forgotten on Done. */
  const [setPw, setSetPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  function reset() {
    setOpen(false);
    setMode('generate');
    setTyped('');
    setTried(false);
    setBusy(false);
    setError(null);
    setSetPw(null);
    setCopied(false);
  }

  const typedProblem = mode === 'type' ? passwordProblem(typed) : null;

  async function submit() {
    if (busy) return;
    setTried(true);
    if (typedProblem) return;
    const password = mode === 'generate' ? generateTemporaryPassword(16) : typed;
    setBusy(true);
    setError(null);
    try {
      await runUserAction({ op: 'set_password', userId, password });
      setSetPw(password);
      setTyped('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The password wasn’t set.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!setPw) return;
    try {
      await navigator.clipboard.writeText(setPw);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Copying didn’t work in this browser — select the password and copy it by hand.');
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        padding: 16,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>Set a temporary password</div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2, lineHeight: 1.5 }}>
            For someone who can’t sign in. They’re asked to choose their own password the next time
            they sign in.
          </div>
        </div>
        {!open && (
          <Button tone="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
            <KeyRound aria-hidden size={14} />
            Set one…
          </Button>
        )}
      </div>

      {open && setPw === null && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div role="group" aria-label="How to choose it" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['generate', 'Generate a strong one'],
                ['type', 'Type one myself'],
              ] as Array<[Mode, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  setTried(false);
                }}
                style={{
                  padding: '7px 13px',
                  borderRadius: 999,
                  border: `1px solid ${mode === key ? COLOR.brand : 'transparent'}`,
                  background: mode === key ? COLOR.brand : 'rgba(60,20,15,0.055)',
                  color: mode === key ? '#fff' : COLOR.ink,
                  fontSize: 12.5,
                  fontWeight: 650,
                  fontFamily: 'var(--pbt-font)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'generate' ? (
            <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
              A random 16-character password, made in this browser. You’ll see it once, right after
              it’s set, to copy.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                Temporary password
              </label>
              <input
                id={inputId}
                type="text"
                value={typed}
                autoComplete="off"
                spellCheck={false}
                maxLength={MAX_ADMIN_PASSWORD + 8}
                onChange={(e) => setTyped(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(60,20,15,0.16)',
                  background: 'rgba(255,255,255,0.85)',
                  fontSize: 14,
                  fontFamily: 'var(--pbt-mono)',
                  color: COLOR.ink,
                }}
              />
              <span style={{ fontSize: 12, color: COLOR.inkMute }}>At least {MIN_ADMIN_PASSWORD} characters.</span>
            </div>
          )}
          {tried && typedProblem && (
            <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.danger }}>
              {typedProblem}
            </div>
          )}

          <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
            Share it with {name} privately — in person, by phone, or on a different channel from their
            sign-in email. Never send it in the same email as their username.
          </div>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button tone="primary" size="sm" busy={busy} onClick={() => void submit()}>
              Set password
            </Button>
            <Button tone="ghost" size="sm" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {setPw !== null && (
        <div role="status" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
            Temporary password set for {name}. Copy it now — it isn’t shown again.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <code
              aria-label="The temporary password"
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(60,20,15,0.06)',
                fontFamily: 'var(--pbt-mono)',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: COLOR.ink,
                userSelect: 'all',
                overflowWrap: 'anywhere',
              }}
            >
              {setPw}
            </code>
            <Button size="sm" tone="secondary" onClick={() => void copy()}>
              <Copy aria-hidden size={14} />
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
            Share it privately (not in the same email as their username). They’ll be asked to choose
            their own password when they sign in.
          </div>
          {error && <InlineAlert tone="warn">{error}</InlineAlert>}
          <div>
            <Button size="sm" tone="ghost" onClick={reset}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
