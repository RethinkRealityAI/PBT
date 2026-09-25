/**
 * "Open in the trainee app" — the postMessage protocol ported from the old
 * Scenario Builder's TestIframe, plus the phone-fit maths.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { StudioDraft } from '../../studioModel';
import { PHONE, PREVIEW_FAILURE_COPY, TrainerAppFrame, phoneScale } from '../TrainerAppFrame';

const DRAFT: StudioDraft = {
  breed: 'Maine Coon',
  species: 'cat',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Harmonizer',
  prompt_prefix: 'Unsaved note',
};

function post(data: unknown, origin = window.location.origin) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });
}

function renderFrame() {
  const onClose = vi.fn();
  render(<TrainerAppFrame open onClose={onClose} draft={DRAFT} scenarioId="admin:cat-1" />);
  const iframe = screen.getByTitle('Trainee app preview') as HTMLIFrameElement;
  const postMessage = vi.fn();
  // jsdom gives the frame a real window; watch what the admin sends it.
  Object.defineProperty(iframe.contentWindow!, 'postMessage', { value: postMessage, configurable: true });
  return { iframe, postMessage, onClose };
}

afterEach(() => vi.restoreAllMocks());

describe('TrainerAppFrame', () => {
  it('loads the trainee app in preview mode and explains voice', () => {
    const { iframe } = renderFrame();
    expect(iframe.getAttribute('src')).toBe('/?pbt_preview=1');
    expect(screen.getByText(/This is exactly what a trainee sees — including voice/)).toBeInTheDocument();
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start text chat' })).toBeDisabled();
  });

  it('waits for the runner, then sends the unsaved draft and the run request', () => {
    const { postMessage } = renderFrame();

    // Another origin can't mark it ready.
    post({ type: 'pbt:preview-runner-ready' }, 'https://evil.example');
    expect(screen.getByRole('button', { name: /Start voice/ })).toBeDisabled();

    post({ type: 'pbt:preview-runner-ready' });
    expect(screen.getByText('ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start voice/ }));
    expect(screen.getByText('starting…')).toBeInTheDocument();

    const row = { ...DRAFT, scenario_id: 'admin:cat-1' };
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { type: 'pbt:preview-flags', scenarioOverrides: [row] },
      window.location.origin,
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      { type: 'pbt:preview-run-scenario', scenarioId: 'admin:cat-1', draft: row, mode: 'voice' },
      window.location.origin,
    );

    post({ type: 'pbt:preview-status', ok: true });
    expect(screen.getByText('running · voice')).toBeInTheDocument();
  });

  it('accepts the legacy ready message and shows the failure copy', () => {
    renderFrame();
    post({ type: 'pbt:preview-ready' });
    fireEvent.click(screen.getByRole('button', { name: 'Start text chat' }));

    post({ type: 'pbt:preview-status', ok: false, reason: 'invalid' });
    expect(screen.getByText('can’t run')).toBeInTheDocument();
    expect(screen.getByText(PREVIEW_FAILURE_COPY.invalid)).toBeInTheDocument();

    post({ type: 'pbt:preview-status', ok: false, reason: 'something-new' });
    expect(screen.getByText(PREVIEW_FAILURE_COPY.unknown)).toBeInTheDocument();
  });

  it('Restart remounts the app and waits for it again', () => {
    const { iframe } = renderFrame();
    post({ type: 'pbt:preview-runner-ready' });
    fireEvent.click(screen.getByRole('button', { name: /Restart/ }));
    expect(screen.getByTitle('Trainee app preview')).not.toBe(iframe);
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start text chat' })).toBeDisabled();
  });

  it('closes from the X', () => {
    const { onClose } = renderFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('phoneScale', () => {
  const W = PHONE.width + PHONE.bezel * 2;
  const H = PHONE.height + PHONE.bezel * 2;

  it('never scales up', () => {
    expect(phoneScale(2000, 2000)).toBe(1);
  });

  it('fits the tighter dimension', () => {
    expect(phoneScale(W, H / 2)).toBeCloseTo(0.5);
    expect(phoneScale(W * 0.6, H)).toBeCloseTo(0.6);
  });

  it('keeps a readable floor on tiny screens', () => {
    expect(phoneScale(50, 50)).toBe(0.45);
    expect(phoneScale(Number.NaN, 800)).toBe(1);
  });
});
