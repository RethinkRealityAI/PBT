/**
 * Photo quality check for the Fecal Scan review step.
 *
 * A blurry or badly lit photo still costs a scan and comes back with a
 * low-confidence (or wrong) score, and the tech usually only notices after
 * the answer lands. So the review step looks at the photo first and, when it
 * is clearly soft or clearly too dark, suggests a retake.
 *
 * ADVISORY, never blocking: the verdict changes which button is primary
 * ("Retake" instead of "Start scan"); "Scan anyway" is always one tap away.
 * A false alarm costs one tap; a missed blur costs a wasted scan — the
 * thresholds are set so a sharp chart photograph never warns (see
 * `photoQuality.test.ts`, which pins them against the real reference photos).
 *
 * Sharpness = variance of the 4-neighbour Laplacian, measured per tile on a
 * ~256 px grayscale copy, and taken at the 90th-percentile tile. Per-tile,
 * because a sharp stool on a plain background is mostly flat: a whole-image
 * variance would call it blurry. The sharpest tiles (the stool's outline and
 * surface) decide — a focused photo has some; a shaken one has none.
 *
 * The pure half (`assessLuma`) takes a grayscale buffer so it can be tested
 * in node with decoded JPEGs; `assessPhotoQuality` is the browser wrapper.
 */

export type PhotoIssue = 'blurry' | 'dark';

export interface PhotoQuality {
  /** 90th-percentile tile Laplacian variance (higher = sharper). */
  sharpness: number;
  /** Mean luma, 0–255. */
  brightness: number;
  /** The single most useful thing to fix, or null when the photo is fine. */
  issue: PhotoIssue | null;
}

/** Longest edge the check measures at — what the thresholds are tuned for. */
export const QUALITY_EDGE_PX = 256;

/**
 * Below this the photo is soft enough that a retake is worth suggesting.
 * Measured on the 21 chart photographs (`photoQuality.test.ts` pins it):
 * sharp originals 783–2258; a mild blur (radius-4 box ×2 at 640 px)
 * 33–148; a strong one (radius 10) 5–19. 35 sits between "a little soft"
 * and "clearly blurry" — a mild blur mostly passes, a strong one never does.
 */
export const BLUR_THRESHOLD = 35;
/**
 * Mean luma below this: too dark to read texture and residue.
 *
 * There is deliberately no "too bright" check: the chart photos themselves
 * average 170–233 on white backgrounds, and a stool on a white paper towel
 * is the recommended setup — a brightness ceiling would warn on good photos.
 */
export const DARK_THRESHOLD = 40;

const GRID = 6;

/**
 * Pure: grayscale buffer (one byte per pixel, row-major) → quality verdict.
 * Measure at `QUALITY_EDGE_PX` or the thresholds do not apply.
 */
export function assessLuma(luma: ArrayLike<number>, width: number, height: number): PhotoQuality {
  let sum = 0;
  for (let i = 0; i < width * height; i++) sum += luma[i];
  const brightness = width * height > 0 ? sum / (width * height) : 0;

  const tileW = Math.floor((width - 2) / GRID);
  const tileH = Math.floor((height - 2) / GRID);
  const variances: number[] = [];
  if (tileW >= 4 && tileH >= 4) {
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        let n = 0;
        let mean = 0;
        let m2 = 0;
        const x0 = 1 + tx * tileW;
        const y0 = 1 + ty * tileH;
        for (let y = y0; y < y0 + tileH; y++) {
          for (let x = x0; x < x0 + tileW; x++) {
            const i = y * width + x;
            const lap = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i];
            // Welford — one pass, numerically stable.
            n += 1;
            const d = lap - mean;
            mean += d / n;
            m2 += d * (lap - mean);
          }
        }
        variances.push(n > 1 ? m2 / (n - 1) : 0);
      }
    }
  }
  variances.sort((a, b) => a - b);
  const sharpness = variances.length
    ? variances[Math.min(variances.length - 1, Math.floor(variances.length * 0.9))]
    : 0;

  // Lighting first: a dark photo also measures soft, and "too dark" is the
  // actionable fix in that case.
  let issue: PhotoIssue | null = null;
  if (brightness < DARK_THRESHOLD) issue = 'dark';
  else if (sharpness < BLUR_THRESHOLD) issue = 'blurry';

  return { sharpness, brightness, issue };
}

/** ITU-R BT.601 luma from interleaved RGBA. */
export function rgbaToLuma(rgba: ArrayLike<number>, pixels: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    out[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

/**
 * Browser: decode `blob`, draw it at `QUALITY_EDGE_PX` and assess it.
 * Resolves `null` wherever the browser cannot decode or read pixels back
 * (old WebViews, jsdom) — no verdict means no warning, never a false one.
 */
export async function assessPhotoQuality(blob: Blob): Promise<PhotoQuality | null> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, QUALITY_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, width, height);
    return assessLuma(rgbaToLuma(data, width * height), width, height);
  } catch {
    return null;
  }
}
