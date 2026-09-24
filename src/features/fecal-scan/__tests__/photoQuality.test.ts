import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import {
  assessLuma,
  rgbaToLuma,
  BLUR_THRESHOLD,
  DARK_THRESHOLD,
  QUALITY_EDGE_PX,
} from '../photoQuality';

/**
 * Pins the review-step quality thresholds against the 21 real chart
 * photographs: a sharp photo must never be told to retake, and a clearly
 * blurred one must always be.
 */

const ROOT = join(process.cwd(), 'public', 'fecal-scan');

/** Area-average downscale — what the browser's drawImage does at this ratio. */
function resize(src: Uint8ClampedArray, w: number, h: number, W: number, H: number) {
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor((x * w) / W);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / W));
      const y0 = Math.floor((y * h) / H);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / H));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += src[yy * w + xx];
          n++;
        }
      }
      out[y * W + x] = sum / n;
    }
  }
  return out;
}

/** Separable box blur, two passes — a stand-in for camera shake / missed focus. */
function blur(src: Uint8ClampedArray, w: number, h: number, r: number) {
  let a = src;
  for (const vertical of [false, true]) {
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let d = -r; d <= r; d++) {
          const xx = vertical ? x : Math.min(w - 1, Math.max(0, x + d));
          const yy = vertical ? Math.min(h - 1, Math.max(0, y + d)) : y;
          sum += a[yy * w + xx];
        }
        out[y * w + x] = sum / (2 * r + 1);
      }
    }
    a = out;
  }
  return a;
}

interface Photo {
  name: string;
  luma: Uint8ClampedArray;
  width: number;
  height: number;
}

const PHOTOS: Photo[] = readdirSync(ROOT).flatMap((species) =>
  readdirSync(join(ROOT, species))
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => {
      const img = jpeg.decode(readFileSync(join(ROOT, species, f)), { useTArray: true });
      return {
        name: `${species}/${f}`,
        luma: rgbaToLuma(img.data, img.width * img.height),
        width: img.width,
        height: img.height,
      };
    }),
);

function measure(p: Photo, luma = p.luma) {
  const s = QUALITY_EDGE_PX / Math.max(p.width, p.height);
  const W = Math.round(p.width * s);
  const H = Math.round(p.height * s);
  return assessLuma(resize(luma, p.width, p.height, W, H), W, H);
}

describe('assessLuma — calibrated on the chart photographs', () => {
  it('loads every reference photo', () => {
    expect(PHOTOS.length).toBe(21);
  });

  it('never tells a sharp chart photo to retake', () => {
    for (const p of PHOTOS) {
      const q = measure(p);
      expect(q.issue, p.name).toBeNull();
      // Comfortable margin, not a near miss.
      expect(q.sharpness, p.name).toBeGreaterThan(BLUR_THRESHOLD * 10);
    }
  });

  it('always flags a clearly blurred photo', () => {
    for (const p of PHOTOS) {
      const q = measure(p, blur(p.luma, p.width, p.height, 10));
      expect(q.issue, p.name).toBe('blurry');
    }
  });

  it('flags an under-exposed photo as dark rather than blurry', () => {
    const p = PHOTOS[0];
    const dim = p.luma.map((v) => v * 0.15);
    const q = measure(p, dim);
    expect(q.brightness).toBeLessThan(DARK_THRESHOLD);
    expect(q.issue).toBe('dark');
  });

  it('judges a flat frame (lens cap, blank wall) as blurry', () => {
    const q = assessLuma(new Uint8ClampedArray(256 * 192).fill(128), 256, 192);
    expect(q.sharpness).toBe(0);
    expect(q.issue).toBe('blurry');
  });

  it('survives a frame too small to tile', () => {
    const q = assessLuma(new Uint8ClampedArray(9).fill(200), 3, 3);
    expect(q.sharpness).toBe(0);
    expect(q.brightness).toBe(200);
  });
});
