import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { CaptureModal } from '../CaptureModal';
import { ThemeProvider } from '../../../app/providers/ThemeProvider';
import { LanguageProvider } from '../../../app/providers/LanguageProvider';
import type { PhotoQuality } from '../photoQuality';

const assess = vi.hoisted(() => vi.fn());
vi.mock('../photoQuality', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../photoQuality')>()),
  assessPhotoQuality: assess,
}));

const stop = vi.fn();
const getUserMedia = vi.fn();
const onScan = vi.fn();
const onFinished = vi.fn();
const onClose = vi.fn();
const onCameraUnavailable = vi.fn();

const SHARP: PhotoQuality = { sharpness: 900, brightness: 180, issue: null };
const BLURRY: PhotoQuality = { sharpness: 12, brightness: 170, issue: 'blurry' };

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider initialTheme="light">
      <LanguageProvider initialLocale="en">{children}</LanguageProvider>
    </ThemeProvider>
  );
}

type Props = ComponentProps<typeof CaptureModal>;

function props(over: Partial<Props> = {}): Props {
  return {
    start: { mode: 'camera' },
    chartLabel: 'Adult dog',
    status: 'idle',
    error: null,
    cameraSupported: true,
    onCameraUnavailable,
    onScan,
    onFinished,
    onClose,
    ...over,
  };
}

const photo = () => new File(['jpeg'], 'stool.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  for (const f of [stop, onScan, onFinished, onClose, onCameraUnavailable]) f.mockReset();
  assess.mockReset().mockResolvedValue(SHARP);
  getUserMedia.mockReset().mockResolvedValue({
    getTracks: () => [{ stop, kind: 'video' }],
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value: { getUserMedia },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
  } as HTMLCanvasElement['toBlob'];
  for (const [k, v] of [
    ['videoWidth', 1280],
    ['videoHeight', 720],
  ] as const) {
    Object.defineProperty(HTMLVideoElement.prototype, k, { configurable: true, get: () => v });
  }
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  // @ts-expect-error — remove the shim so other suites see a camera-less env
  delete navigator.mediaDevices;
  document.body.style.overflow = '';
});

async function shootPhoto(user: ReturnType<typeof userEvent.setup>) {
  const shutter = await screen.findByRole('button', { name: 'Take the photo' });
  await waitFor(() => expect(shutter).toBeEnabled());
  await user.click(shutter);
  await screen.findByRole('heading', { name: 'Check the photo' });
}

describe('CaptureModal', () => {
  it('is a labelled modal dialog that names the chart and locks the page', async () => {
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    const dialog = screen.getByRole('dialog', { name: 'Take the photo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Adult dog chart')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  });

  it('shutter → review: the photo is shown and nothing is scanned until Start scan', async () => {
    const user = userEvent.setup();
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    await shootPhoto(user);

    expect(screen.getByAltText('The stool photo you selected')).toBeInTheDocument();
    expect(onScan).not.toHaveBeenCalled();
    // The camera is released as soon as the photo is taken.
    expect(stop).toHaveBeenCalled();
    expect(await screen.findByText(/Photo looks sharp/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(onScan).toHaveBeenCalledTimes(1);
    const [file, meta] = onScan.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(meta).toEqual({ photoIssue: null, retakes: 0 });
  });

  it('Retake goes back to the live camera and is counted', async () => {
    const user = userEvent.setup();
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    await shootPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Retake' }));

    expect(await screen.findByRole('heading', { name: 'Take the photo' })).toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));

    await shootPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Start scan' }));
    expect(onScan.mock.calls[0][1]).toEqual({ photoIssue: null, retakes: 1 });
  });

  it('a blurry photo makes Retake the primary action, with Scan anyway still one tap away', async () => {
    const user = userEvent.setup();
    assess.mockResolvedValue(BLURRY);
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    await shootPhoto(user);

    expect(await screen.findByText(/looks blurry/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start scan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scan anyway' }));
    expect(onScan.mock.calls[0][1]).toEqual({ photoIssue: 'blurry', retakes: 0 });
  });

  it('opens a library pick straight on review, where Retake reads "Choose another"', async () => {
    render(<CaptureModal {...props({ start: { mode: 'review', file: photo() } })} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole('heading', { name: 'Check the photo' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Choose another' })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('runs the stepper, then closes onto the result', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CaptureModal {...props({ start: { mode: 'review', file: photo() } })} />,
      { wrapper: Wrapper },
    );
    await user.click(await screen.findByRole('button', { name: 'Start scan' }));

    rerender(
      <CaptureModal {...props({ start: { mode: 'review', file: photo() }, status: 'analyzing' })} />,
    );
    expect(screen.getByRole('heading', { name: 'Scanning' })).toBeInTheDocument();
    expect(screen.getByText('Observing the sample')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel scan' })).toBeInTheDocument();

    rerender(<CaptureModal {...props({ start: { mode: 'review', file: photo() }, status: 'done' })} />);
    // Every step settles before the modal closes.
    expect(screen.getByText('Done. Opening the result.')).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('never closes on a result left over from before it opened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // The page behind already shows a result (status 'done'); the next
      // scan has been requested but has not reported 'analyzing' yet.
      render(
        <CaptureModal
          {...props({ start: { mode: 'review', file: photo() }, status: 'done' })}
        />,
        { wrapper: Wrapper },
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Start scan' }));
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(onFinished).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the photo on an error: Try again re-sends the same one', async () => {
    const user = userEvent.setup();
    const file = photo();
    const { rerender } = render(<CaptureModal {...props({ start: { mode: 'review', file } })} />, {
      wrapper: Wrapper,
    });
    await user.click(await screen.findByRole('button', { name: 'Start scan' }));
    rerender(
      <CaptureModal
        {...props({ start: { mode: 'review', file }, status: 'error', error: 'Could not score the photo.' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not score the photo.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan.mock.calls[1][0]).toBe(file);
  });

  it('closes on the close button and on Escape', async () => {
    const user = userEvent.setup();
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('offers the library when the camera is blocked', async () => {
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    getUserMedia.mockRejectedValue(err);
    render(<CaptureModal {...props()} />, { wrapper: Wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Camera access is blocked/);
    expect(screen.getByRole('button', { name: 'Choose from library' })).toBeInTheDocument();
  });
});
