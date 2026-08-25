/**
 * Time-on-screen tracking for the Analytics dwell heatmap.
 *
 * A single tracker follows the navigation state: when the user leaves a
 * screen (navigation, tab hidden, page hide) the elapsed time is emitted as
 * one `dwell` nav_event for the screen they were on. Timing pauses while the
 * document is hidden so a tab left open overnight doesn't count as dwell.
 *
 * Values are clamped: blips under MIN_DWELL_MS are noise and dropped; a
 * single stretch is capped at MAX_DWELL_MS so one forgotten tab can't drown
 * the heatmap.
 */

/** Ignore dwell shorter than this — screen flashes while navigating. */
export const MIN_DWELL_MS = 1_000;
/** Cap a single dwell emission — beyond this the user isn't really "on" the screen. */
export const MAX_DWELL_MS = 30 * 60_000;

export interface DwellTracker {
  /** Call whenever the current screen changes. Emits dwell for the previous screen. */
  onScreenChange(next: string): void;
  /** Document hidden (tab switch, minimise) — emits dwell so far and pauses. */
  onHide(): void;
  /** Document visible again — resumes timing on the current screen. */
  onShow(): void;
}

export interface DwellTrackerOptions {
  emit: (screen: string, dwellMs: number) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createDwellTracker(
  initialScreen: string,
  { emit, now = Date.now }: DwellTrackerOptions,
): DwellTracker {
  let screen = initialScreen;
  /** null while the document is hidden (timing paused). */
  let startedAt: number | null = now();

  const flush = () => {
    if (startedAt === null) return;
    const elapsed = Math.min(now() - startedAt, MAX_DWELL_MS);
    startedAt = null;
    if (elapsed >= MIN_DWELL_MS) emit(screen, Math.round(elapsed));
  };

  return {
    onScreenChange(next: string) {
      if (next === screen) return;
      const wasRunning = startedAt !== null;
      flush();
      screen = next;
      // Stay paused across a screen change while hidden (e.g. preview automation).
      if (wasRunning) startedAt = now();
    },
    onHide() {
      flush();
    },
    onShow() {
      if (startedAt === null) startedAt = now();
    },
  };
}
