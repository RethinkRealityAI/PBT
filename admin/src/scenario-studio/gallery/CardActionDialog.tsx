/**
 * The confirmation every state-changing card action goes through:
 * Publish, Unpublish, Archive. (Restore needs none — it brings a scenario
 * back HIDDEN, which is cheap and reversible; Duplicate opens a copy.)
 *
 *   • Publish runs the editor's own readiness checklist (`cardPublishCheck`
 *     → `readiness`). Blocked → the blockers and "Open in builder", no
 *     publish. Warnings are shown, never block.
 *   • Unsaved work in this browser → "This publishes the last SAVED
 *     version", with "Open in builder" next to Publish.
 *   • Hiding the last live scenario (Unpublish or Archive) → the editor's
 *     last-visible warning, and the button says "anyway".
 *
 * Rendered by the gallery in place — never inside a card (a card lifts
 * with a transform on hover, which would trap the fixed-position dialog).
 */
import { AlertTriangle, Archive, Eye, EyeOff } from 'lucide-react';
import { Modal, ModalCloseButton } from '../../primitives';
import { Button } from '../../primitives/form';
import { COLOR } from '../../lib/tokens';
import { IconBadge, Kicker } from '../ui';
import type { ReadinessItem } from '../studioModel';

export type CardActionKind = 'publish' | 'unpublish' | 'archive';

export interface CardActionDialogProps {
  kind: CardActionKind;
  title: string;
  /** Publish only: the shared readiness result. */
  check?: { blockers: ReadinessItem[]; warnings: ReadinessItem[] } | null;
  /** This is the only scenario trainees can see (and it is live). */
  lastVisible: boolean;
  /** The admin has unsaved changes to it kept in this browser. */
  unsaved: boolean;
  /** Archive only: the scenario is live right now. */
  live?: boolean;
  /** Someone else saved it while this dialog was being opened (a 409 re-read). */
  refreshed?: boolean;
  busy: boolean;
  /** A write failed: said inside the dialog, which stays open. */
  error?: string | null;
  canOpenBuilder: boolean;
  onConfirm: () => void;
  onOpenInBuilder: () => void;
  onClose: () => void;
}

const ICONS = { publish: Eye, unpublish: EyeOff, archive: Archive } as const;

function Bullets({ items, tone }: { items: Array<{ key: string; label: string; detail?: string }>; tone: 'danger' | 'warn' }) {
  const color = tone === 'danger' ? COLOR.danger : COLOR.warn;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {items.map((i) => (
        <li key={i.key} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: color, marginTop: 7, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink }}>
            <strong style={{ fontWeight: 750 }}>{i.label}</strong>
            {i.detail && <span style={{ display: 'block', color: COLOR.inkSoft }}>{i.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Note({ tone, children }: { tone: 'warn' | 'danger' | 'info'; children: React.ReactNode }) {
  const bg = tone === 'danger' ? COLOR.dangerSoft : tone === 'warn' ? COLOR.warnSoft : COLOR.infoSoft;
  const fg = tone === 'danger' ? 'oklch(0.42 0.17 25)' : tone === 'warn' ? 'oklch(0.42 0.12 60)' : 'oklch(0.40 0.13 250)';
  return (
    <div
      role={tone === 'info' ? undefined : 'note'}
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 12,
        background: bg,
        color: fg,
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 600,
      }}
    >
      <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

export function CardActionDialog(props: CardActionDialogProps) {
  const { kind, title, check, lastVisible, unsaved, busy, error } = props;
  const blocked = kind === 'publish' && (check?.blockers.length ?? 0) > 0;
  const hidesLast = (kind === 'unpublish' || (kind === 'archive' && props.live)) && lastVisible;
  const name = `“${title}”`;

  const heading = blocked
    ? `${name} isn’t ready to publish`
    : kind === 'publish'
      ? `Publish ${name}?`
      : kind === 'unpublish'
        ? `Unpublish ${name}?`
        : `Archive ${name}?`;
  const confirmLabel =
    kind === 'publish' ? 'Publish' : kind === 'unpublish' ? (hidesLast ? 'Unpublish anyway' : 'Unpublish') : hidesLast ? 'Archive anyway' : 'Archive';

  const body = (() => {
    if (blocked) return 'Sort these out in the builder first — the same checks its Publish step runs.';
    if (kind === 'publish') return 'Trainees can practise it from their next visit to the app.';
    if (kind === 'unpublish')
      return `Trainees will no longer see ${name}. Sessions already played keep their history.`;
    return 'It’s unpublished and moved to Archived. You can restore it any time.';
  })();

  const dialog = (
    <Modal open onClose={props.onClose} width={520} ariaLabel={heading}>
      <div style={{ padding: 24, display: 'grid', gap: 16, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <IconBadge
            icon={blocked ? AlertTriangle : ICONS[kind]}
            size={34}
            background={blocked || hidesLast ? COLOR.danger : kind === 'publish' ? COLOR.success : COLOR.inkSoft}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Kicker>{kind === 'archive' ? 'Archive' : kind === 'publish' ? 'Publish' : 'Unpublish'}</Kicker>
            <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: COLOR.ink, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
              {heading}
            </h2>
          </div>
          <ModalCloseButton onClose={props.onClose} />
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: COLOR.inkSoft }}>{body}</p>

        {props.refreshed && (
          <Note tone="info">Someone else changed this scenario just now — this is its latest version. Check, then confirm again.</Note>
        )}

        {blocked && check && <Bullets items={check.blockers} tone="danger" />}

        {kind === 'publish' && !blocked && unsaved && (
          <Note tone="warn">
            This publishes the last SAVED version. You have unsaved changes in the builder.
          </Note>
        )}

        {kind === 'publish' && check && check.warnings.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <Kicker>Worth a look — doesn’t block publishing</Kicker>
            <Bullets items={check.warnings} tone="warn" />
          </div>
        )}

        {hidesLast && (
          <Note tone="danger">
            It is the only scenario trainees can see. The app will show “no scenarios available” to every trainee until
            something is published again.
          </Note>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 13, color: COLOR.danger, fontWeight: 650 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }}>
          <Button tone="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          {props.canOpenBuilder && (blocked || (kind === 'publish' && unsaved)) && (
            <Button tone={blocked ? 'primary' : 'secondary'} onClick={props.onOpenInBuilder}>
              Open in builder
            </Button>
          )}
          {!blocked && (
            <Button
              tone={hidesLast ? 'danger' : 'primary'}
              busy={busy}
              onClick={props.onConfirm}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
  // Rendered in place by the gallery (never inside a card — see the header),
  // so the shared confirm dialog, which mounts after the app, stays on top.
  return dialog;
}
