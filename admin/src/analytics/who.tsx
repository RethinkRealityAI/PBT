/**
 * The marks for anonymous practice, shared by the Sessions table, the session
 * window and the Feedback screen: a neutral avatar (no initials — there is no
 * name), the short device tag with its explanation, and the "Rebuilt" tag for
 * anonymous sessions rebuilt from app activity. Words live in `lib/who.ts`.
 */
import { COLOR } from '../lib/tokens';
import { Tag } from './trainee/parts';
import { DEVICE_HELP, REBUILT_TAG, REBUILT_TAG_HELP, RECOVERED_TAG, RECOVERED_TAG_HELP, deviceLabel } from './lib/who';

/** A plain person silhouette on a neutral disc — anonymous, so no initials and no driver colour. */
export function AnonAvatar({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'oklch(0.93 0.008 40)',
        border: '0.5px solid rgba(60,20,15,0.10)',
        color: COLOR.inkMute,
      }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="5.2" r="3" />
        <path d="M2.4 14.2c.5-3 2.8-4.9 5.6-4.9s5.1 1.9 5.6 4.9z" />
      </svg>
    </span>
  );
}

/** "Device 4F2A", explained on hover — a device, never a person. */
export function DeviceTag({ anonId, lower = false }: { anonId: string | null | undefined; lower?: boolean }) {
  const label = deviceLabel(anonId);
  return (
    <span title={DEVICE_HELP} style={{ cursor: 'help', fontVariantNumeric: 'tabular-nums' }}>
      {lower ? label.charAt(0).toLowerCase() + label.slice(1) : label}
    </span>
  );
}

/** Marks an anonymous session rebuilt from app activity (no transcript, no score). */
export function RecoveredTag() {
  return (
    <Tag tone="muted" title={RECOVERED_TAG_HELP}>
      {RECOVERED_TAG}
    </Tag>
  );
}

export function RebuiltTag() {
  return (
    <Tag tone="muted" title={REBUILT_TAG_HELP}>
      {REBUILT_TAG}
    </Tag>
  );
}
