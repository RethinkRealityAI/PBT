/**
 * The last line between a bad card and a white screen.
 *
 * Cards are rebuilt from the persisted transcript (`localStorage` — stale,
 * truncated, or hand-edited). The renderer guards what it can (missing data
 * paths read as '', cyclic children render as nothing), but a shape nobody
 * anticipated must cost ONE card, not the whole Studio: the admin's draft
 * lives in the same tree. No error boundary existed anywhere under
 * admin/src before this one.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { COLOR } from '../../lib/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class SurfaceBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn('[Scenario Studio] a card could not be shown', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="note"
        style={{
          alignSelf: 'center',
          maxWidth: '92%',
          padding: '6px 12px',
          borderRadius: 999,
          fontSize: 12,
          color: COLOR.inkMute,
          background: 'rgba(60,20,15,0.05)',
          border: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        This card couldn’t be shown. Ask the assistant again.
      </div>
    );
  }
}
