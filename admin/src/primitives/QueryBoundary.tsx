/**
 * Honest load states for admin screens.
 *
 * `useQuery` returns `{ data, loading, error }` and falls back to an empty
 * array when a fetch fails. Screens that render only `data` therefore show a
 * cheerful "No sessions yet" when the truth is "the server returned 500" —
 * the reader concludes the platform is idle rather than broken. Every screen
 * that reads a query should route it through here instead.
 *
 *   <QueryBoundary query={sessions} title="Couldn't load the sessions">
 *     …the normal content…
 *   </QueryBoundary>
 *
 * Errors are shown in plain English with the server's own message kept as
 * secondary detail (useful when the admin forwards a screenshot to support),
 * plus a Try again button wired to the query's refetch.
 */
import type { ReactNode } from 'react';
import { COLOR } from '../lib/tokens';
import { LoadingShimmer } from './index';

export interface BoundaryQuery {
  loading: boolean;
  error: string | null;
  refetch?: () => void;
}

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: '28px 24px',
        borderRadius: 16,
        border: `0.5px solid ${COLOR.dangerSoft}`,
        background: 'linear-gradient(180deg, rgba(255,246,246,0.9), rgba(255,240,241,0.75))',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 8 }} aria-hidden="true">
        ⚠
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLOR.ink }}>{title}</div>
      <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 5, maxWidth: 460, marginInline: 'auto' }}>
        This is a problem loading the data, not an empty result. Try again in a
        moment — if it keeps happening, send this message to your support contact.
      </div>
      {detail && (
        <div
          style={{
            fontSize: 11.5,
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            color: COLOR.inkMute,
            marginTop: 10,
            wordBreak: 'break-word',
            maxWidth: 520,
            marginInline: 'auto',
          }}
        >
          {detail}
        </div>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 16,
            padding: '9px 18px',
            borderRadius: 11,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))',
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Renders children only when the query neither failed nor is still loading.
 * Pass every query a screen depends on via `queries` when there is more than
 * one — the first error wins, so a broken dependency can't hide behind a
 * healthy one.
 */
export function QueryBoundary({
  query,
  queries,
  title,
  showLoading = true,
  children,
}: {
  query?: BoundaryQuery;
  queries?: BoundaryQuery[];
  /** Plain-English description of what failed, e.g. "Couldn't load sessions". */
  title: string;
  /** Set false when the screen renders its own skeletons. */
  showLoading?: boolean;
  children: ReactNode;
}) {
  const all = queries ?? (query ? [query] : []);
  const failed = all.find((q) => q.error != null);
  if (failed) {
    // Always offer a way out. A hook that predates `refetch` would otherwise
    // strand the reader on a dead-end error with no action to take.
    return (
      <ErrorState
        title={title}
        detail={failed.error}
        onRetry={failed.refetch ?? (() => window.location.reload())}
      />
    );
  }
  if (showLoading && all.some((q) => q.loading)) {
    return <LoadingShimmer height={200} />;
  }
  return <>{children}</>;
}
