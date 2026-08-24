/**
 * Confirmation ladder.
 *
 * `window.confirm` was doing the work of three different dialogs. It is a
 * terrible fit for destructive admin actions: the browser chrome can't say
 * WHAT is about to be lost, it blocks the main thread, it can't be styled to
 * signal danger, and — worst — it looks identical whether you're deleting a
 * draft or the last owner's access, so people learn to click through it.
 *
 * The ladder has three rungs, and the caller picks by consequence:
 *
 *   1. Cheap + reversible → no dialog at all. Do it, then offer Undo on a
 *      toast (see ./Toast.tsx).
 *   2. Destructive but scoped → `confirm({ tone: 'danger', consequences })`.
 *      Name the concrete losses; a bulleted list of real effects beats a
 *      paragraph of hedging.
 *   3. Irreversible or wide-blast → add `typeToConfirm`. Typing the name is a
 *      speed bump the muscle-memory click can't clear.
 *
 * `confirm()` returns a promise so callers read top-to-bottom:
 *   if (!(await confirm({...}))) return;
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { COLOR, RADIUS } from '../lib/tokens';
import { Eyebrow, Modal } from './index';
import { Button, inputStyle } from './form';

export interface ConfirmOptions {
  title: string;
  /** Optional prose under the title. Keep it to one or two sentences. */
  body?: ReactNode;
  /**
   * Concrete effects, one per bullet. "Three published scenarios stop being
   * offered" — not "this may affect other data".
   */
  consequences?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /**
   * When set, the confirm button stays disabled until the reader types this
   * string exactly. Reserve it for actions with no undo.
   */
  typeToConfirm?: string;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Returns `confirm(opts): Promise<boolean>`. Outside a `ConfirmProvider` it
 * falls back to `window.confirm` — degraded, but never silently destructive.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  const fallback = useCallback<ConfirmFn>(
    (opts) =>
      Promise.resolve(
        typeof window !== 'undefined' ? window.confirm(opts.title) : false,
      ),
    [],
  );
  return ctx ?? fallback;
}

interface PendingConfirm {
  /** Remounts the dialog per request so a stale `typeToConfirm` entry can't carry over. */
  id: number;
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

let confirmSeq = 0;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Guards the unmount path: if the provider goes away with a dialog open, the
  // awaiting caller must not hang forever on an unresolved promise.
  const pendingRef = useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  useEffect(
    () => () => {
      pendingRef.current?.resolve(false);
    },
    [],
  );

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        confirmSeq += 1;
        const id = confirmSeq;
        setPending((prev) => {
          // Only one dialog at a time. A second request supersedes the first,
          // which resolves false — nobody agreed to it.
          prev?.resolve(false);
          return { id, opts, resolve };
        });
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          key={pending.id}
          opts={pending.opts}
          onSettle={settle}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({
  opts,
  onSettle,
}: {
  opts: ConfirmOptions;
  onSettle: (ok: boolean) => void;
}) {
  const [typed, setTyped] = useState('');
  const danger = opts.tone === 'danger';
  const needsTyping = Boolean(opts.typeToConfirm);
  const ready = !needsTyping || typed.trim() === opts.typeToConfirm;

  return (
    <Modal open onClose={() => onSettle(false)} width={460} ariaLabel={opts.title}>
      <div style={{ padding: 24 }}>
        <Eyebrow style={{ color: danger ? COLOR.danger : COLOR.inkMute }}>
          {danger ? 'Destructive action' : 'Confirm'}
        </Eyebrow>
        <h2
          style={{
            margin: '8px 0 0',
            fontSize: 18,
            fontWeight: 800,
            color: COLOR.ink,
            letterSpacing: '-0.02em',
          }}
        >
          {opts.title}
        </h2>
        {opts.body && (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.55,
              color: COLOR.inkSoft,
            }}
          >
            {opts.body}
          </div>
        )}
        {opts.consequences && opts.consequences.length > 0 && (
          <ul
            style={{
              margin: '12px 0 0',
              padding: '10px 12px 10px 28px',
              borderRadius: RADIUS.md,
              background: danger ? COLOR.dangerSoft : 'rgba(60,20,15,0.045)',
              color: danger ? 'oklch(0.42 0.18 25)' : COLOR.inkSoft,
              fontSize: 12.5,
              lineHeight: 1.55,
              display: 'grid',
              gap: 4,
            }}
          >
            {opts.consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {needsTyping && (
          <label style={{ display: 'block', marginTop: 14 }}>
            <span style={{ fontSize: 12, color: COLOR.inkSoft }}>
              Type <strong>{opts.typeToConfirm}</strong> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ready) onSettle(true);
              }}
              aria-label={`Type ${opts.typeToConfirm} to confirm`}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 18,
          }}
        >
          <Button tone="secondary" onClick={() => onSettle(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            tone={danger ? 'danger' : 'primary'}
            disabled={!ready}
            onClick={() => onSettle(true)}
          >
            {opts.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Danger zone ───────────────────────────────────────────────

/**
 * Visually quarantines destructive controls so they can't be hit on the way to
 * something benign. Put it last on a screen or in a modal tab — never inline
 * with the save row.
 */
export function DangerZone({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: RADIUS.lg,
        border: `1px solid color-mix(in oklab, ${COLOR.danger} 28%, transparent)`,
        background: 'color-mix(in oklab, oklch(0.93 0.07 25) 45%, transparent)',
      }}
    >
      <Eyebrow style={{ color: COLOR.danger }}>Danger zone</Eyebrow>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          fontWeight: 800,
          color: COLOR.ink,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ marginTop: 4, fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}
