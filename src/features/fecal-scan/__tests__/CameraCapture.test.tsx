import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { CameraCapture } from '../CameraCapture';
import { CaptureCard } from '../CaptureCard';
import { ThemeProvider } from '../../../app/providers/ThemeProvider';
import { LanguageProvider } from '../../../app/providers/LanguageProvider';

const stop = vi.fn();
const getUserMedia = vi.fn();

function fakeStream(): MediaStream {
  const track = { stop, kind: 'video' } as unknown as MediaStreamTrack;
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider initialTheme="light">
      <LanguageProvider initialLocale="en">{children}</LanguageProvider>
    </ThemeProvider>
  );
}

const onCapture = vi.fn();
const onCancel = vi.fn();
const onUnavailable = vi.fn();

function renderCamera() {
  return render(
    <CameraCapture
      onCapture={onCapture}
      onCancel={onCancel}
      onUnavailable={onUnavailable}
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue(fakeStream());
  onCapture.mockReset();
  onCancel.mockReset();
  onUnavailable.mockReset();

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value: { getUserMedia },
  });
  // jsdom implements neither media playback nor canvas encoding.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
  } as HTMLCanvasElement['toBlob'];
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage,
  })) as unknown as HTMLCanvasElement['getContext'];
  drawImage.mockReset();
  // A decoded frame by default; the "no frame yet" tests override this.
  setVideoSize(1280, 720);
});

const drawImage = vi.fn();

function setVideoSize(width: number, height: number) {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => height,
  });
}

afterEach(() => {
  // @ts-expect-error — remove the shim so other suites see a camera-less env
  delete navigator.mediaDevices;
});

describe('CameraCapture', () => {
  it('opens the rear camera', async () => {
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          facingMode: { ideal: 'environment' },
        }),
      }),
    );
  });

  it('shutter hands back a JPEG File and releases the camera', async () => {
    const user = userEvent.setup();
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    const shutter = screen.getByRole('button', { name: 'Take the photo' });
    await waitFor(() => expect(shutter).toBeEnabled());

    await user.click(shutter);
    expect(drawImage).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    const file = onCapture.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/^stool-\d+\.jpg$/);
    expect(stop).toHaveBeenCalled();
  });

  it('keeps the shutter disabled until the video has a frame', async () => {
    setVideoSize(0, 0);
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    const shutter = screen.getByRole('button', { name: 'Take the photo' });
    expect(shutter).toBeDisabled();
    expect(screen.getByText('Starting camera…')).toBeInTheDocument();

    // First frame decodes → the video fires loadeddata → shutter unlocks.
    setVideoSize(1280, 720);
    fireEvent.loadedData(document.querySelector('video') as HTMLVideoElement);
    await waitFor(() => expect(shutter).toBeEnabled());
    expect(screen.queryByText('Starting camera…')).toBeNull();
  });

  it('never sends a frame-less image', async () => {
    setVideoSize(0, 0);
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    // Even a forced click on the disabled shutter must not produce a file.
    fireEvent.click(screen.getByRole('button', { name: 'Take the photo' }));
    expect(onCapture).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('reports a failure instead of sending a blank JPEG when there is no 2D context', async () => {
    const user = userEvent.setup();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
    renderCamera();
    const shutter = screen.getByRole('button', { name: 'Take the photo' });
    await waitFor(() => expect(shutter).toBeEnabled());
    await user.click(shutter);
    expect(onCapture).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the camera');
  });

  it('flipping restarts the stream on the front camera', async () => {
    const user = userEvent.setup();
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Flip camera' }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1][0]).toMatchObject({
      video: { facingMode: { ideal: 'user' } },
    });
    // The previous stream must not be left running.
    expect(stop).toHaveBeenCalled();
  });

  it('cancel releases the camera', async () => {
    const user = userEvent.setup();
    renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('unmounting releases the camera', async () => {
    const { unmount } = renderCamera();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('explains a denied permission and keeps the upload path open', async () => {
    const err = new Error('denied');
    err.name = 'NotAllowedError';
    getUserMedia.mockRejectedValue(err);
    renderCamera();

    expect(
      await screen.findByText(
        'Camera permission was denied — you can still upload a photo.',
      ),
    ).toBeInTheDocument();
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('reports missing hardware so the entry point can be hidden', async () => {
    const err = new Error('none');
    err.name = 'NotFoundError';
    getUserMedia.mockRejectedValue(err);
    renderCamera();

    await waitFor(() => expect(onUnavailable).toHaveBeenCalled());
  });

  it('falls back to a generic message on any other failure', async () => {
    getUserMedia.mockRejectedValue(new Error('boom'));
    renderCamera();
    expect(
      await screen.findByText(
        'Could not open the camera. Upload a photo instead.',
      ),
    ).toBeInTheDocument();
  });
});

describe('CaptureCard camera entry point', () => {
  const onPick = vi.fn();

  it('offers Take photo alongside Upload photo when a camera exists', () => {
    render(<CaptureCard previewUrl={null} busy={false} onPick={onPick} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
  });

  it('hides Take photo when the device exposes no camera API', () => {
    // @ts-expect-error — simulate a browser without getUserMedia
    delete navigator.mediaDevices;
    render(<CaptureCard previewUrl={null} busy={false} onPick={onPick} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
  });

  it('offers Retake and Replace once a photo is in hand', () => {
    render(<CaptureCard previewUrl="blob:photo" busy={false} onPick={onPick} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('keeps the upload input free of the capture attribute', () => {
    const { container } = render(
      <CaptureCard previewUrl={null} busy={false} onPick={onPick} />,
      { wrapper: Wrapper },
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('image/*');
    // `capture` would make iOS force the camera for the UPLOAD path too.
    expect(input.hasAttribute('capture')).toBe(false);
  });
});
