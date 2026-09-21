/**
 * Perceptual image hashing — the deterministic half of the Fecal Scan
 * reference-photo guard.
 *
 * Shown the chart's own score-3.5 photograph, the model answered "4" at 0.99
 * confidence. No amount of prompting fixes "is this the same picture?"; a
 * hash does, exactly and for free. `ai-fecal-scan` hashes the submitted photo
 * and each chart reference it loaded, and when one is a near-duplicate it
 * takes that score rather than the model's.
 *
 * dHash (difference hash) is the right tool here: it downsamples to a tiny
 * grayscale grid and records only whether each cell is brighter than its
 * right-hand neighbour, so it is invariant to scale, re-encoding and overall
 * brightness/contrast — exactly the things that change when a chart JPEG is
 * re-photographed or re-compressed — while staying sensitive to content.
 *
 * Dependency-free on purpose: imported by `src/**` AND `netlify/functions/**`
 * (the JPEG decoding lives at the call site, so this module never needs
 * `jpeg-js` or any DOM API).
 */

/**
 * Hamming distance at or below which two images are treated as the same
 * picture.
 *
 * Measured, not guessed. Two facts bracket it, both pinned by
 * `imageHash.test.ts` (which prints the numbers):
 *   • re-encoding a chart photo at JPEG q50–q90 moves its hash by at most 3
 *     bits — the guard must sit ABOVE that or it never fires in the field,
 *     because the client re-compresses every upload;
 *   • the closest pair of DIFFERENT chart photos is 9 bits apart (puppy 2.5
 *     vs 3) — the guard must sit BELOW that or it could assign the wrong
 *     score.
 * 6 is the middle of that 3 < x < 9 window. A real clinic photo is tens of
 * bits away from any of them, so the guard cannot fire on one.
 */
export const EXACT_REFERENCE_MAX_DISTANCE = 6;

/** A decoded image: RGBA, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[];
}

/** Rec. 601 luma — the standard grayscale weighting. */
const luma = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Box-average an image down to `cols × rows` grayscale cells.
 *
 * Averaging (rather than nearest-neighbour sampling) is what makes the hash
 * stable across JPEG re-compression: noise in any single pixel is diluted by
 * its whole cell.
 */
function boxAverageGray(image: RgbaImage, cols: number, rows: number): Float64Array {
  const { width, height, data } = image;
  const out = new Float64Array(cols * rows);
  if (width < 1 || height < 1) return out;

  for (let ty = 0; ty < rows; ty++) {
    const y0 = Math.min(height - 1, Math.floor((ty * height) / rows));
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor(((ty + 1) * height) / rows)));
    for (let tx = 0; tx < cols; tx++) {
      const x0 = Math.min(width - 1, Math.floor((tx * width) / cols));
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor(((tx + 1) * width) / cols)));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sum += luma(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      out[ty * cols + tx] = n > 0 ? sum / n : 0;
    }
  }
  return out;
}

/**
 * Difference hash of an image: `size × size` bits, lowercase hex.
 *
 * The image is reduced to a `(size + 1) × size` grayscale grid and each cell
 * contributes one bit — set when the cell to its right is brighter. Alpha is
 * ignored (a chart photo is opaque, and a transparent re-save must not change
 * the hash).
 */
export function dHash(image: RgbaImage, size = 8): string {
  if (!Number.isInteger(size) || size < 2 || size % 2 !== 0) {
    throw new Error('dHash size must be an even integer ≥ 2');
  }
  const cols = size + 1;
  const gray = boxAverageGray(image, cols, size);

  let hex = '';
  let nibble = 0;
  let bitsInNibble = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bit = gray[y * cols + x] < gray[y * cols + x + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      if (++bitsInNibble === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bitsInNibble = 0;
      }
    }
  }
  return hex;
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) => {
  let c = 0;
  for (let i = 0; i < 4; i++) if (n & (1 << i)) c++;
  return c;
});

/**
 * Number of differing bits between two hashes from `dHash`.
 *
 * Throws on a length mismatch rather than comparing a prefix: silently
 * returning a small distance for two different-sized hashes would make the
 * guard fire on unrelated images.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hash length mismatch: ${a.length} vs ${b.length}`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 15];
  }
  return d;
}
