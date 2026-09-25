/**
 * Test drive — "Open in the trainee app".
 *
 * The consumer app itself, in a phone frame, running the UNSAVED draft
 * (`/?pbt_preview=1`). This is the only way to try voice from the admin: the
 * Live socket, the microphone and the real chat screen are all the trainee
 * app's own.
 *
 * The postMessage protocol is ported verbatim from the old Scenario Builder's
 * `TestIframe`:
 *   iframe → admin  `pbt:preview-runner-ready` | `pbt:preview-ready`  (ready)
 *   admin → iframe  `pbt:preview-flags`        { scenarioOverrides: [row] }
 *   admin → iframe  `pbt:preview-run-scenario` { scenarioId, draft: row, mode }
 *   iframe → admin  `pbt:preview-status`       { ok, reason? }   (once per run)
 * Every message is origin-checked both ways (`window.location.origin`).
 */
import { useEffect, useRef, useState } from 'react';
import type { ScenarioOverrideRow } from '../../data/types';
import { Modal, ModalCloseButton, StatusPill } from '../../primitives';
import { Button, InlineAlert } from '../../primitives/form';
import { COLOR } from '../../lib/tokens';
import { Kicker } from '../ui';
import type { StudioDraft } from '../studioModel';

/** What the trainee app said about the last run request. */
export type PreviewStatus =
  | { kind: 'idle' }
  | { kind: 'running'; mode: 'text' | 'voice' }
  | { kind: 'ok'; mode: 'text' | 'voice' }
  | { kind: 'failed'; reason: 'invalid' | 'unsupported' | 'unknown' };

export const PREVIEW_FAILURE_COPY: Record<'invalid' | 'unsupported' | 'unknown', string> = {
  invalid:
    'This scenario can’t run yet — check the required fields (breed, life stage, pushback and driver).',
  unsupported:
    'The preview can’t run this scenario. It has nothing to build a customer from — save it once, or open it from the list rather than by id.',
  unknown: 'The preview didn’t answer. Try “Restart”.',
};

/** The phone's CSS size — a modern ~6.1" handset. */
export const PHONE = { width: 390, height: 780, bezel: 12 } as const;

/** Scale that fits the phone (plus bezel) into the space available. */
export function phoneScale(availableWidth: number, availableHeight: number): number {
  const w = PHONE.width + PHONE.bezel * 2;
  const h = PHONE.height + PHONE.bezel * 2;
  const s = Math.min(1, availableWidth / w, availableHeight / h);
  return Math.max(0.45, Number.isFinite(s) ? s : 1);
}

function useViewport(): { width: number; height: number } {
  const read = () => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const onResize = () => setVp(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}

export function TrainerAppFrame({
  open,
  onClose,
  draft,
  scenarioId,
}: {
  open: boolean;
  onClose: () => void;
  draft: StudioDraft;
  scenarioId: string;
}) {
  return (
    <Modal open={open} onClose={onClose} width={920} ariaLabel="Open in the trainee app">
      {open && <FrameBody onClose={onClose} draft={draft} scenarioId={scenarioId} />}
    </Modal>
  );
}

function FrameBody({
  onClose,
  draft,
  scenarioId,
}: {
  onClose: () => void;
  draft: StudioDraft;
  scenarioId: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<PreviewStatus>({ kind: 'idle' });
  /** Bumped to remount the iframe — a hard restart of the preview session. */
  const [reloadKey, setReloadKey] = useState(0);
  // The mode of the in-flight request, read by the status listener without
  // re-subscribing it on every state change.
  const pendingModeRef = useRef<'text' | 'voice'>('text');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; reason?: string } | null;
      if (data?.type === 'pbt:preview-runner-ready' || data?.type === 'pbt:preview-ready') {
        setReady(true);
        return;
      }
      if (data?.type !== 'pbt:preview-status') return;
      // Every run is answered exactly once — silence used to leave the panel
      // looking like it was still starting up, forever.
      if (data.ok) {
        setStatus({ kind: 'ok', mode: pendingModeRef.current });
      } else {
        const reason =
          data.reason === 'invalid' || data.reason === 'unsupported' ? data.reason : 'unknown';
        setStatus({ kind: 'failed', reason });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  function start(mode: 'text' | 'voice') {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    pendingModeRef.current = mode;
    setStatus({ kind: 'running', mode });
    const row = { ...draft, scenario_id: scenarioId } as ScenarioOverrideRow;
    // Push the UNSAVED draft into the preview's own override layer first, so
    // anything the runner resolves by id (and the AI prompt notes on it) match
    // what is on screen rather than what was last saved.
    frame.postMessage({ type: 'pbt:preview-flags', scenarioOverrides: [row] }, window.location.origin);
    frame.postMessage(
      { type: 'pbt:preview-run-scenario', scenarioId, draft: row, mode },
      window.location.origin,
    );
  }

  function restart() {
    setReady(false);
    setStatus({ kind: 'idle' });
    setReloadKey((k) => k + 1);
  }

  // Fit the phone into what the dialog leaves: 88vh tall minus its padding,
  // and — once the columns stack — the full dialog width.
  const vp = useViewport();
  const stacked = vp.width < 760;
  const availW = Math.min(920, vp.width - 48) - 48 - (stacked ? 0 : 320);
  const availH = vp.height * 0.88 - (stacked ? 300 : 56);
  const scale = phoneScale(availW, availH);
  const outerW = (PHONE.width + PHONE.bezel * 2) * scale;
  const outerH = (PHONE.height + PHONE.bezel * 2) * scale;

  const pill =
    status.kind === 'failed'
      ? { tone: 'danger' as const, text: 'can’t run' }
      : status.kind === 'ok'
        ? { tone: 'success' as const, text: `running · ${status.mode === 'voice' ? 'voice' : 'text'}` }
        : status.kind === 'running'
          ? { tone: 'info' as const, text: 'starting…' }
          : ready
            ? { tone: 'info' as const, text: 'ready' }
            : { tone: 'neutral' as const, text: 'loading…' };

  return (
    <>
      <div
        className="pbt-studio-scroll"
        style={{
          overflowY: 'auto',
          minHeight: 0,
          padding: '22px 24px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 0, maxWidth: stacked ? 'none' : 320, display: 'grid', gap: 14, paddingRight: stacked ? 44 : 0 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <Kicker>Trainee app preview</Kicker>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: COLOR.ink }}>
              Open in the trainee app
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft }}>
              This is exactly what a trainee sees — including voice. Voice needs your microphone.
            </p>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: COLOR.inkMute }}>
              It runs the version on your screen, unsaved changes included. Like the test drive,
              nothing is recorded and trainees can’t see it.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft }}>Status</span>
            <span role="status" aria-live="polite">
              <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button tone="primary" onClick={() => start('text')} disabled={!ready}>
              Start text chat
            </Button>
            <Button onClick={() => start('voice')} disabled={!ready}>
              🎙 Start voice
            </Button>
            <Button tone="ghost" onClick={restart}>
              ↺ Restart
            </Button>
          </div>

          {status.kind === 'failed' && (
            <InlineAlert tone="error">{PREVIEW_FAILURE_COPY[status.reason]}</InlineAlert>
          )}
        </div>

        <div style={{ width: outerW, height: outerH, flexShrink: 0 }}>
          <div
            style={{
              width: PHONE.width + PHONE.bezel * 2,
              height: PHONE.height + PHONE.bezel * 2,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              boxSizing: 'border-box',
              padding: PHONE.bezel,
              borderRadius: 54,
              background: 'linear-gradient(160deg, oklch(0.26 0.02 20), oklch(0.16 0.02 20))',
              boxShadow: [
                '0 0 0 1.5px rgba(255,255,255,0.14) inset',
                '0 30px 60px -24px rgba(20,5,8,0.55)',
                '0 12px 24px -12px rgba(20,5,8,0.35)',
              ].join(', '),
            }}
          >
            <div
              style={{
                position: 'relative',
                width: PHONE.width,
                height: PHONE.height,
                borderRadius: 42,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <iframe
                key={reloadKey}
                ref={iframeRef}
                src="/?pbt_preview=1"
                title="Trainee app preview"
                allow="microphone; autoplay"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Last in the DOM so focus lands on the first control, not the way out. */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ModalCloseButton onClose={onClose} />
      </div>
    </>
  );
}
