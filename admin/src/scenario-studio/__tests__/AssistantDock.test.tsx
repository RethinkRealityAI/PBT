/**
 * Where the assistant sits: the docked column that folds to a rail (and
 * remembers it), and the drawer used below the docking width.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// The panel itself is tested on its own; here it only needs a composer and
// whatever close button the shell asked for.
vi.mock('../copilot/CopilotPanel', () => ({
  CopilotPanel: (props: { variant: string; onClose?: () => void; controlsId?: string }) => (
    <section data-testid="copilot" data-variant={props.variant}>
      <textarea aria-label="Message the scenario assistant" />
      {props.onClose && (
        <button type="button" onClick={props.onClose} aria-expanded aria-controls={props.controlsId}>
          {props.variant === 'drawer' ? 'Close assistant' : 'Hide assistant'}
        </button>
      )}
    </section>
  ),
}));

// eslint-disable-next-line import/first
import {
  ASSISTANT_COLLAPSED_KEY,
  AssistantColumn,
  AssistantDrawer,
  AssistantLauncher,
  readAssistantCollapsed,
  writeAssistantCollapsed,
  type AssistantPanelProps,
} from '../AssistantDock';
// eslint-disable-next-line import/first
import { EMPTY_TRANSCRIPT } from '../copilot/types';

const PANEL: AssistantPanelProps = {
  scenarioId: 'admin:x',
  draft: {},
  step: 'pet',
  canWrite: true,
  knowledge: { docs: [], loading: false, error: null, refetch: () => {} },
  onPatch: () => {},
  onGoToStep: () => {},
  transcript: EMPTY_TRANSCRIPT,
  onTranscriptChange: () => {},
  pendingPrompt: null,
  onPendingConsumed: () => {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the remembered fold', () => {
  it('reads and writes the per-browser choice', () => {
    expect(readAssistantCollapsed()).toBe(false);
    writeAssistantCollapsed(true);
    expect(localStorage.getItem(ASSISTANT_COLLAPSED_KEY)).toBe('1');
    expect(readAssistantCollapsed()).toBe(true);
    writeAssistantCollapsed(false);
    expect(localStorage.getItem(ASSISTANT_COLLAPSED_KEY)).toBeNull();
  });

  it('survives blocked storage (private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readAssistantCollapsed()).toBe(false);
    expect(() => writeAssistantCollapsed(true)).not.toThrow();
  });
});

function Column(props: Partial<Parameters<typeof AssistantColumn>[0]>) {
  return (
    <AssistantColumn
      panel={PANEL}
      top={80}
      collapsed={false}
      hasNews={false}
      onCollapse={() => {}}
      onExpand={() => {}}
      {...props}
    />
  );
}

describe('AssistantColumn', () => {
  it('open: the panel, with a "Hide assistant" button that folds it', () => {
    const onCollapse = vi.fn();
    render(<Column onCollapse={onCollapse} />);
    expect(screen.getByTestId('copilot')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Show assistant/ })).not.toBeInTheDocument();
    const hide = screen.getByRole('button', { name: 'Hide assistant' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(hide);
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('folded: a rail that unfolds it — the panel stays mounted, hidden', () => {
    const onExpand = vi.fn();
    render(<Column collapsed onExpand={onExpand} />);
    const show = screen.getByRole('button', { name: 'Show assistant' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    // It controls the (hidden) panel, which keeps any reply in flight.
    const panel = document.getElementById(show.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByTestId('copilot'));
    expect(screen.getByTestId('copilot')).not.toBeVisible();
    fireEvent.click(show);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('a reply while folded shows a dot on the rail — it doesn’t spring open', () => {
    render(<Column collapsed hasNews />);
    expect(screen.getByRole('button', { name: 'Show assistant — new reply' })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-news-dot')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('The assistant has replied.');
    expect(screen.getByTestId('copilot')).not.toBeVisible();
  });

  it('focus follows the fold: to the rail, then back into the conversation', () => {
    const { rerender } = render(<Column />);
    // Folding from the panel's own button…
    fireEvent.click(screen.getByRole('button', { name: 'Hide assistant' }));
    rerender(<Column collapsed />);
    expect(screen.getByRole('button', { name: 'Show assistant' })).toHaveFocus();
    // …and unfolding from the rail lands in the composer.
    fireEvent.click(screen.getByRole('button', { name: 'Show assistant' }));
    rerender(<Column collapsed={false} />);
    expect(screen.getByLabelText('Message the scenario assistant')).toHaveFocus();
  });

  it('a fold from elsewhere (an "Ask the assistant" button) doesn’t move focus', () => {
    const { rerender } = render(
      <>
        <button type="button">Suggest a breed</button>
        <Column collapsed />
      </>,
    );
    screen.getByRole('button', { name: 'Suggest a breed' }).focus();
    rerender(
      <>
        <button type="button">Suggest a breed</button>
        <Column collapsed={false} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Suggest a breed' })).toHaveFocus();
  });
});

describe('AssistantDrawer + launcher', () => {
  it('the launcher names the drawer it opens and flags a new reply', () => {
    const onOpen = vi.fn();
    render(<AssistantLauncher onOpen={onOpen} hasNews controls="drawer-1" />);
    const btn = screen.getByRole('button', { name: 'Open the assistant — new reply' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'drawer-1');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('the shell exists before the first open, but the panel is only mounted then', () => {
    const { rerender } = render(<AssistantDrawer id="drawer-1" open={false} panel={PANEL} onClose={() => {}} />);
    expect(document.getElementById('drawer-1')).not.toBeNull();
    expect(screen.queryByTestId('copilot')).not.toBeInTheDocument();
    rerender(<AssistantDrawer id="drawer-1" open panel={PANEL} onClose={() => {}} />);
    expect(screen.getByTestId('copilot')).toHaveAttribute('data-variant', 'drawer');
  });

  it('moves focus into the composer on open, and Escape closes it', async () => {
    const onClose = vi.fn();
    render(<AssistantDrawer id="drawer-1" open panel={PANEL} onClose={onClose} />);
    await waitFor(() => expect(screen.getByLabelText('Message the scenario assistant')).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hands focus back to the launcher when it closes', async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <AssistantDrawer id="drawer-1" open={open} panel={PANEL} onClose={() => {}} />
          {!open && <AssistantLauncher onOpen={() => {}} controls="drawer-1" />}
        </>
      );
    }
    const { rerender } = render(<Harness open />);
    await waitFor(() => expect(screen.getByLabelText('Message the scenario assistant')).toHaveFocus());
    rerender(<Harness open={false} />);
    expect(screen.getByRole('button', { name: 'Open the assistant' })).toHaveFocus();
  });
});
