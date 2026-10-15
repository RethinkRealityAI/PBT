/**
 * `#/analytics/sessions/<id>` — the session modal over the explorer.
 *
 * Summaries carry no transcript, so the full session is fetched when one is
 * opened (`useSessionDetail`, cached). The modal opens straight away on a
 * skeleton; a session that no longer exists (404, a malformed id, or an
 * empty answer) closes with a toast instead of stranding the reader on an
 * error; any other failure shows inside the modal with Try again.
 */
import { useEffect, useRef } from 'react';
import type { SessionSummary, TraineeDirectoryEntry } from '../../../../src/shared/analytics/contract';
import { SessionModal } from '../../screens/SessionModal';
import { useToast } from '../../primitives/Toast';
import { useSessionDetail } from '../data';

/**
 * A load failure that means "there is no such session", not "try again":
 * the server's 404 (no row) or 400 (not a session id). Decided on the HTTP
 * status the cache keeps, never on the wording of the message.
 */
export function isMissingSession(status: number | null): boolean {
  return status === 404 || status === 400;
}

export function SessionDetail({
  id,
  summary,
  personOf,
  onClose,
  onViewTrainee,
}: {
  id: string;
  /** The session's row from the list, when it is in the window (the only source of hint counts). */
  summary: SessionSummary | null;
  /** Directory lookup — the session may be outside the window, so the summary can't name its trainee. */
  personOf: (userId: string) => TraineeDirectoryEntry | null;
  onClose: () => void;
  onViewTrainee: (userId: string) => void;
}) {
  const detail = useSessionDetail(id);
  const toast = useToast();
  const missing =
    isMissingSession(detail.errorStatus) || (!detail.loading && detail.error == null && detail.updatedAt != null && detail.data == null);

  // Close once per missing id — the toast must not repeat on every render.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!missing || handled.current === id) return;
    handled.current = id;
    toast({ message: 'That session couldn’t be found — it may have been deleted.', tone: 'error' });
    onClose();
  }, [missing, id, toast, onClose]);

  if (missing) return null;

  const session = detail.data && detail.data.id === id ? detail.data : null;
  const userId = session?.user_id ?? summary?.user_id ?? null;
  const person = userId ? personOf(userId) : null;
  return (
    <SessionModal
      session={session}
      user={person}
      summary={summary}
      loading={!session && detail.error == null}
      error={!session ? detail.error : null}
      onRetry={detail.refetch}
      onClose={onClose}
      onViewTrainee={person ? onViewTrainee : undefined}
    />
  );
}
