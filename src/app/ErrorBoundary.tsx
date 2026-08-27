import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Glass } from '../design-system/Glass';
import { PillButton } from '../design-system/PillButton';
import { useLanguage } from './providers/LanguageProvider';
import { en } from '../i18n/en';
import type { CatalogKey } from '../i18n/catalog';

/**
 * Crash barrier for the lazily-loaded screen switch.
 *
 * Suspense handles a chunk that is still PENDING but rethrows one that
 * REJECTED, so a returning user whose cached chunk was replaced by a deploy
 * would otherwise be left staring at a blank document with no route back.
 */

/**
 * Bundlers and browsers each phrase a failed dynamic import differently, so
 * match the whole family rather than one engine's wording.
 */
function isStaleChunkError(error: unknown): boolean {
  const err = error as { name?: unknown; message?: unknown } | null;
  if (err?.name === 'ChunkLoadError') return true;
  const message = typeof err?.message === 'string' ? err.message : String(error);
  return /loading (css )?chunk|dynamically imported module|imported module script failed|error loading dynamically/i.test(
    message,
  );
}

/**
 * Only ever reload from an explicit tap: reloading inside componentDidCatch
 * would spin forever on any error the fresh document reproduces.
 */
function reloadApp() {
  window.location.reload();
}

/**
 * This boundary can catch a throw raised anywhere under LanguageProvider, so
 * the copy lookup must not become the next thing that throws — any failure
 * falls back to the English catalog.
 */
function useSafeT(): (key: CatalogKey) => string {
  const { t } = useLanguage();
  return (key) => {
    try {
      return t(key);
    } catch {
      return en[key];
    }
  };
}

function RecoveryCard({ stale }: { stale: boolean }) {
  const t = useSafeT();
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center px-5 py-10"
      role="alert"
    >
      <Glass
        padding={24}
        className="w-full"
        style={{ maxWidth: 'var(--pbt-layout-max)' }}
      >
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 6,
          }}
        >
          {t(stale ? 'chrome.error.stale.eyebrow' : 'chrome.error.eyebrow')}
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: '-0.025em',
            color: 'var(--pbt-text)',
            marginBottom: 10,
          }}
        >
          {t(stale ? 'chrome.error.stale.title' : 'chrome.error.title')}
        </h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--pbt-text-muted)',
            marginBottom: 20,
          }}
        >
          {t(stale ? 'chrome.error.stale.body' : 'chrome.error.body')}
        </p>
        <PillButton variant="solid" fullWidth onClick={reloadApp}>
          {t('chrome.error.reload')}
        </PillButton>
      </Glass>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** A stale bundle is worth naming: reloading genuinely resolves it. */
  stale: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, stale: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, stale: isStaleChunkError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The card shows the user nothing technical and there is no client-side
    // error reporter, so the console is the only place the trace survives.
    console.error('[pbt] screen crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <RecoveryCard stale={this.state.stale} />;
  }
}
