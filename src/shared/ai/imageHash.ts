/**
 * Perceptual image hashing — the deterministic half of the Fecal Scan
 * reference-photo guard.
 *
 * Shown the chart's own score-3.5 photograph, the model answered "4" at 0.99
 * confidence. No amount of prompting fixes "is this the same picture?"; a
 * deterministic comparison does. `ai-fecal-scan` fingerprints the submitted
 * photo and each chart reference of the SELECTED species, and only when one
 * passes every stage of `compareFingerprints` does it take that score rather
 * than the model's. It exists so a demo that uploads the chart's own photos
 * scores correctly — it must never fire on a real clinic photo.
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

/*
 * ── Why a hash alone is NOT enough ────────────────────────────────────────
 * A 64-bit dHash encodes the SILHOUETTE of a picture, not its texture. It was
 * measured against 108 synthetic plain-background silhouettes (a smooth dark /
 * mid / brown ellipse on white, 4:3 and square frames, JPEG q85): 62 of them
 * (54 in the original audit's variant of the corpus) land within 6 bits of
 * some chart photograph — almost every dark one (a near-black ellipse on
 * white sits 4 bits from `puppy/3.jpg`). A black, tarry stool on a white
 * paper towel would have been forced onto a chart score at 99 % with a false
 * "matches the chart photo" claim.
 *
 * So "is this the chart's own photo?" is now THREE independent checks, all of
 * which must pass (`compareFingerprints`):
 *   1. aspect ratio within ±10 % of the reference (chart photos are 640×640);
 *   2. dHash distance ≤ EXACT_REFERENCE_MAX_DISTANCE (cheap pre-filter);
 *   3. mean absolute difference of the 32×32 grayscale thumbnails
 *      ≤ EXACT_REFERENCE_MAX_PIXEL_MAD — this is the stage that actually
 *      compares CONTENT, pixel for pixel.
 * The numbers are pinned by `imageHash.test.ts`, which prints them.
 */

/**
 * dHash pre-filter: Hamming distance at or below which two images MAY be the
 * same picture (the pixel check decides).
 *
 * Measured: re-encoding a chart photo at its native 640 px with JPEG
 * q50/q70/q85/q90 moves its hash by at most 4 bits (q85 — the client's own
 * quality — is the worst case); the closest pair of DIFFERENT chart photos in
 * one species is 9 bits apart (puppy 2.5 vs 3). NOT a safety bound on its own
 * — see above.
 */
export const EXACT_REFERENCE_MAX_DISTANCE = 6;

/**
 * Pixel verification: maximum mean absolute difference (in 0–255 luma
 * levels) between the 32×32 grayscale thumbnails of the upload and a chart
 * photo.
 *
 * Measured (all 21 chart photos):
 *   • same photo re-encoded at q50/q70/q85/q90: worst 0.23 (0.47 even after a
 *     downscale to 480 or 320 px — though a 480 px copy can move the dHash
 *     past 6, so a resized chart photo may simply not match: that fails
 *     safe, the model then judges it like any other photo);
 *   • a horizontally MIRRORED chart photo vs any reference: best 6.24
 *     (dog/5, the most symmetric picture);
 *   • 108 synthetic silhouettes vs any reference: best 10.29 (the dHash
 *     matched over half of these);
 *   • two DIFFERENT chart photos of one species: best 13.25 (puppy 2.5 vs 3).
 * 2.0 sits ~4× above the worst re-encode drift and ~3× below the closest
 * non-match. (dog 4.5 and cat 5 are the SAME photo on the two charts —
 * 0.58 apart — which is why the lookup only ever runs inside the selected
 * species' chart.)
 */
export const EXACT_REFERENCE_MAX_PIXEL_MAD = 2;

/** Upload aspect ratio must be within ±10 % of the chart photo's. */
export const EXACT_REFERENCE_MAX_ASPECT_DELTA = 0.1;

/** Side of the grayscale thumbnail the pixel check compares. */
export const PIXEL_THUMB_SIZE = 32;

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

/**
 * `size × size` grayscale thumbnail (box-averaged luma, 0–255), row-major.
 * Pure — no DOM, no decoder; the caller hands in decoded RGBA.
 */
export function grayThumbnail(image: RgbaImage, size = PIXEL_THUMB_SIZE): Float64Array {
  if (!Number.isInteger(size) || size < 1) throw new Error('thumbnail size must be a positive integer');
  return boxAverageGray(image, size, size);
}

/** Mean absolute difference between two same-sized thumbnails, in luma levels. */
export function meanAbsoluteDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    throw new Error(`thumbnail length mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Relative difference of two aspect ratios: |(wa/ha) / (wb/hb) − 1|. */
export function aspectRatioDelta(
  a: { width: number; height: number },
  b: { width: number; height: number },
): number {
  if (a.width < 1 || a.height < 1 || b.width < 1 || b.height < 1) return Number.POSITIVE_INFINITY;
  return Math.abs((a.width / a.height) / (b.width / b.height) - 1);
}

/** Everything the exact-reference check needs to know about one image. */
export interface ImageFingerprint {
  width: number;
  height: number;
  /** 64-bit dHash, hex. */
  hash: string;
  /** `PIXEL_THUMB_SIZE²` grayscale thumbnail. */
  thumb: Float64Array;
}

export function fingerprint(image: RgbaImage): ImageFingerprint {
  return {
    width: image.width,
    height: image.height,
    hash: dHash(image),
    thumb: grayThumbnail(image),
  };
}

export interface SamePictureVerdict {
  match: boolean;
  aspectDelta: number;
  hashDistance: number;
  pixelMad: number;
}

/**
 * Is `upload` the same picture as `reference`? ALL three stages must agree —
 * aspect ratio, dHash pre-filter, and the pixel-level thumbnail comparison
 * (see the thresholds above). The distances are returned for logging.
 */
export function compareFingerprints(
  upload: ImageFingerprint,
  reference: ImageFingerprint,
): SamePictureVerdict {
  const aspectDelta = aspectRatioDelta(upload, reference);
  const hashDistance = hammingDistance(upload.hash, reference.hash);
  const pixelMad = meanAbsoluteDifference(upload.thumb, reference.thumb);
  return {
    match:
      aspectDelta <= EXACT_REFERENCE_MAX_ASPECT_DELTA &&
      hashDistance <= EXACT_REFERENCE_MAX_DISTANCE &&
      pixelMad <= EXACT_REFERENCE_MAX_PIXEL_MAD,
    aspectDelta,
    hashDistance,
    pixelMad,
  };
}
