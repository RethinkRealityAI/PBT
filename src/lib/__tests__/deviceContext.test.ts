import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyDevice,
  detectDevice,
  detectInstalled,
  detectOs,
  detectTimeZone,
  getDeviceContext,
  parseOs,
} from '../deviceContext';

/** A matchMedia stub that answers `true` only for the listed queries. */
function stubMatchMedia(matching: string[]) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: matching.includes(query), media: query })),
  );
}

function stubScreen(width: number, height: number) {
  vi.stubGlobal('screen', { width, height });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyDevice', () => {
  it('fine pointer is a computer whatever its size', () => {
    expect(classifyDevice(false, 390)).toBe('desktop');
    expect(classifyDevice(false, 1080)).toBe('desktop');
    expect(classifyDevice(false, null)).toBe('desktop');
  });

  it('coarse pointer on a short side under 600 is a phone, otherwise a tablet', () => {
    expect(classifyDevice(true, 390)).toBe('mobile');
    expect(classifyDevice(true, 599)).toBe('mobile');
    expect(classifyDevice(true, 600)).toBe('tablet');
    expect(classifyDevice(true, 820)).toBe('tablet');
    expect(classifyDevice(true, null)).toBe('tablet');
  });
});

describe('parseOs', () => {
  const cases: Array<[string, number, string]> = [
    // userAgentData.platform hints
    ['iOS', 0, 'ios'],
    ['Android', 5, 'android'],
    ['macOS', 0, 'macos'],
    ['Windows', 0, 'windows'],
    ['Linux', 0, 'linux'],
    ['Chrome OS', 0, 'chromeos'],
    ['ChromeOS', 0, 'chromeos'],
    ['Chromium OS', 0, 'chromeos'],
    // Full user agents
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      5,
      'ios',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1',
      5,
      'ios',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36',
      5,
      'android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      0,
      'chromeos',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      0,
      'macos',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
      0,
      'windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 0, 'linux'],
    ['', 0, 'other'],
    ['SomeConsole/1.0', 0, 'other'],
  ];

  it.each(cases)('%s → %s', (source, touch, expected) => {
    expect(parseOs(source, touch)).toBe(expected);
  });

  it('iPadOS Safari, which reports itself as a Mac, is iOS when it has a touch screen', () => {
    const ipadUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    expect(parseOs(ipadUa, 5)).toBe('ios');
    expect(parseOs(ipadUa, 0)).toBe('macos');
  });
});

describe('detectors read the browser safely', () => {
  it('a phone: coarse pointer on a 390×844 screen', () => {
    stubMatchMedia(['(pointer: coarse)']);
    stubScreen(390, 844);
    expect(detectDevice()).toBe('mobile');
  });

  it('a tablet held either way: coarse pointer, short side ≥ 600', () => {
    stubMatchMedia(['(pointer: coarse)']);
    stubScreen(1180, 820);
    expect(detectDevice()).toBe('tablet');
  });

  it('falls back to "desktop" / not installed when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(detectDevice()).toBe('desktop');
    expect(detectInstalled()).toBe(false);
  });

  it('falls back to "desktop" when matchMedia throws', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => {
        throw new Error('no');
      }),
    );
    expect(detectDevice()).toBe('desktop');
    expect(detectInstalled()).toBe(false);
  });

  it('prefers userAgentData.platform over the user agent', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userAgentData: { platform: 'Chrome OS' },
      maxTouchPoints: 0,
    });
    expect(detectOs()).toBe('chromeos');
  });

  it('falls back to the user agent when the platform hint is empty or "Unknown"', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      userAgentData: { platform: '' },
    });
    expect(detectOs()).toBe('android');
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userAgentData: { platform: 'Unknown' },
    });
    expect(detectOs()).toBe('windows');
  });

  it('spots iPadOS from navigator.maxTouchPoints', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      maxTouchPoints: 5,
    });
    expect(detectOs()).toBe('ios');
  });

  it('installed: standalone display mode, or iOS navigator.standalone', () => {
    stubMatchMedia(['(display-mode: standalone)']);
    expect(detectInstalled()).toBe(true);

    stubMatchMedia([]);
    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: true });
    expect(detectInstalled()).toBe(true);

    vi.stubGlobal('navigator', { userAgent: 'iPhone', standalone: false });
    expect(detectInstalled()).toBe(false);
  });

  it('time zone comes from Intl, and is omitted when Intl will not say', () => {
    expect(detectTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);

    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: undefined }),
        }) as unknown as Intl.DateTimeFormat,
    );
    expect(detectTimeZone()).toBeUndefined();
    expect(getDeviceContext()).not.toHaveProperty('tz');
    spy.mockRestore();
  });

  it('getDeviceContext holds only the coarse fields', () => {
    stubMatchMedia(['(pointer: coarse)']);
    stubScreen(390, 844);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
      maxTouchPoints: 5,
    });
    const ctx = getDeviceContext();
    expect(ctx).toMatchObject({ device: 'mobile', os: 'ios', installed: false });
    expect(Object.keys(ctx).sort()).toEqual(
      ctx.tz ? ['device', 'installed', 'os', 'tz'] : ['device', 'installed', 'os'],
    );
  });
});
