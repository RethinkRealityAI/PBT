import type { DriverKey } from './tokens';

/**
 * Expected assets (place under `public/frequency-waves/`):
 *
 *   {slug}-{light|dark}-{white|black}.webm  (preferred)
 *   {slug}-{light|dark}-{white|black}.mp4   (fallback)
 *
 * Where `slug` is lowercase: activator | energizer | analyzer | harmonizer | all
 *
 * Examples:
 *   /frequency-waves/activator-light-white.webm
 *   /frequency-waves/harmonizer-dark-black.mp4
 *
 * Theme (`light` | `dark`) matches app resolved theme; backdrop (`white` | `black`) picks
 * which export sits on light vs dark surfaces.
 */
export type DriverWaveVideoBackdrop = 'white' | 'black';

export function driverWaveVideoSlug(driver: DriverKey | 'all'): string {
  if (driver === 'all') return 'all';
  return driver.toLowerCase();
}

/** Base URL without extension — `<video>` uses `<source>` for .webm + .mp4 */
export function driverWaveVideoBasePath(
  driver: DriverKey | 'all',
  theme: 'light' | 'dark',
  backdrop: DriverWaveVideoBackdrop,
): string {
  const slug = driverWaveVideoSlug(driver);
  return `/frequency-waves/${slug}-${theme}-${backdrop}`;
}

/**
 * Ordered fallbacks (same extensions appended in `<video>`): tries common export naming
 * after the canonical path so locally dropped files still resolve.
 */
export function driverWaveVideoBasePathCandidates(
  driver: DriverKey | 'all',
  theme: 'light' | 'dark',
  backdrop: DriverWaveVideoBackdrop,
): string[] {
  const slug = driverWaveVideoSlug(driver);
  const titled = driver === 'all' ? 'all' : driver;
  const t = theme;
  const b = backdrop;
  const bases = [
    `/frequency-waves/${slug}-${t}-${b}`,
    `/frequency-waves/${slug}_${t}_${b}`,
    `/frequency-waves/${titled}-${t}-${b}`,
    `/frequency-waves/${titled}_${t}_${b}`,
    `/frequency-waves/Frequency-waves-videos/${slug}-${t}-${b}`,
    `/frequency-waves/frequency-waves-videos/${slug}-${t}-${b}`,
  ];
  return [...new Set(bases)];
}
