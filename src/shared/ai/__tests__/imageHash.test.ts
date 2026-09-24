/**
 * Perceptual hashing + pixel verification for the Fecal Scan exact-reference
 * guard.
 *
 * The guard exists because the model, shown the chart's OWN score-3.5
 * photograph, confidently answered 4. A deterministic comparison settles that
 * case without asking the model anything — but it must NEVER fire on a real
 * clinic photo (it then forces a chart score at 0.99). A dHash alone DID fire
 * on plain dark ellipses on white; the tests at the bottom rebuild that
 * corpus and pin that the full three-stage check (`compareFingerprints`)
 * rejects every one of them, while still accepting every chart photo
 * re-encoded the way the client re-encodes it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, encode } from 'jpeg-js';
import {
  EXACT_REFERENCE_MAX_ASPECT_DELTA,
  EXACT_REFERENCE_MAX_DISTANCE,
  EXACT_REFERENCE_MAX_PIXEL_MAD,
  PIXEL_THUMB_SIZE,
  aspectRatioDelta,
  compareFingerprints,
  dHash,
  fingerprint,
  grayThumbnail,
  hammingDistance,
  meanAbsoluteDifference,
  type ImageFingerprint,
  type RgbaImage,
} from '../imageHash';
import { FECAL_CHARTS, FECAL_SPECIES } from '../../../data/knowledge/fecalCharts';

/** Deterministic noise image — different seeds look nothing alike. */
function noise(seed: number, width = 32, height = 32): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < width * height; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = s >>> 24;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Left-to-right ramp — the simplest image with a knowable dHash. */
function ramp(width = 64, height = 64, reverse = false): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round(((reverse ? width - 1 - x : x) / (width - 1)) * 255);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('dHash', () => {
  it('is deterministic and 64 bits wide at the default size', () => {
    const img = noise(7);
    const a = dHash(img);
    expect(a).toBe(dHash(img));
    expect(a).toBe(dHash(noise(7)));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(dHash(noise(7), 4)).toMatch(/^[0-9a-f]{4}$/);
  });

  it('reads brightness, not colour channels or alpha', () => {
    const img = ramp();
    const tinted: RgbaImage = { ...img, data: Uint8Array.from(img.data) };
    for (let i = 3; i < tinted.data.length; i += 4) tinted.data[i] = 7; // alpha
    expect(dHash(tinted)).toBe(dHash(img));
  });

  it('gives a monotonic ramp an all-ones hash, and its mirror an all-zeros one', () => {
    // Every pixel is brighter than the one to its left → every bit set.
    expect(dHash(ramp())).toBe('f'.repeat(16));
    expect(dHash(ramp(64, 64, true))).toBe('0'.repeat(16));
  });

  it('survives a resize of the same picture', () => {
    // Same content, different resolution — a dHash is a content hash.
    expect(dHash(ramp(64, 64))).toBe(dHash(ramp(160, 96)));
  });

  it('tolerates images smaller than the hash grid', () => {
    expect(() => dHash(noise(1, 4, 3))).not.toThrow();
    expect(dHash(noise(1, 4, 3))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('hammingDistance', () => {
  it('is zero for an identical decode and symmetric otherwise', () => {
    const a = dHash(noise(1));
    const b = dHash(noise(2));
    expect(hammingDistance(a, a)).toBe(0);
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
    expect(hammingDistance(a, b)).toBeGreaterThan(12);
  });

  it('separates an inverted or mirrored picture by a mile', () => {
    const forward = dHash(ramp());
    const mirrored = dHash(ramp(64, 64, true));
    expect(hammingDistance(forward, mirrored)).toBe(64);
  });

  it('rejects a length mismatch rather than silently comparing prefixes', () => {
    expect(() => hammingDistance('ffff', 'ffffffffffffffff')).toThrow(/length/i);
  });
});

const chartImage = (imagePath: string) =>
  decode(readFileSync(join(process.cwd(), 'public', imagePath.replace(/^\//, ''))), {
    useTArray: true,
  }) as RgbaImage;

describe('the real chart photographs', () => {
  /**
   * Every pair of chart photos must sit well outside the guard's threshold,
   * or scanning one chart photo could match the WRONG score — the exact
   * failure the guard is meant to fix. The margin is asserted against the
   * constant, so tightening or loosening the guard re-checks the evidence.
   */
  it.each(FECAL_SPECIES)('%s — every pair is far apart (distance matrix)', (species) => {
    const entries = FECAL_CHARTS[species].entries;
    const hashes = entries.map((e) => dHash(chartImage(e.imagePath)));

    const matrix: string[] = [
      `      ${entries.map((e) => String(e.score).padStart(4)).join('')}`,
    ];
    let min = 64;
    for (let i = 0; i < hashes.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < hashes.length; j++) {
        const d = hammingDistance(hashes[i], hashes[j]);
        row.push(d);
        if (i !== j) min = Math.min(min, d);
      }
      matrix.push(
        `${String(entries[i].score).padStart(5)} ${row.map((d) => String(d).padStart(4)).join('')}`,
      );
    }
    console.log(
      `${species} reference dHash distances (min off-diagonal ${min}, guard fires at ≤ ${EXACT_REFERENCE_MAX_DISTANCE}):\n${matrix.join('\n')}`,
    );

    // Two DIFFERENT chart photos must never look like the same picture, or
    // the guard would confidently assign the wrong score.
    expect(min).toBeGreaterThan(EXACT_REFERENCE_MAX_DISTANCE);
  }, 30_000);

  /**
   * The other side of the threshold. A trainee scanning a chart photo sends a
   * re-encoded JPEG (the client downscales and re-compresses), so the guard
   * must survive that — otherwise it never fires in the field.
   *
   * These two tests are what justify the constant: the guard must sit ABOVE
   * the worst re-encode drift and BELOW the closest confusable pair. At the
   * time of writing that window is 4 (q85) < 6 < 9. The hash is only the
   * pre-filter now — the pixel stage below is what makes the guard safe.
   */
  it.each(FECAL_SPECIES)('%s — a re-encode never moves a hash past the guard', (species) => {
    let worst = 0;
    for (const entry of FECAL_CHARTS[species].entries) {
      const image = chartImage(entry.imagePath);
      const original = dHash(image);
      for (const quality of [90, 85, 70, 50]) {
        const round = decode(encode(image as never, quality).data, { useTArray: true });
        worst = Math.max(worst, hammingDistance(original, dHash(round as RgbaImage)));
      }
    }
    console.log(`${species} worst re-encode drift: ${worst}`);
    expect(worst).toBeLessThanOrEqual(EXACT_REFERENCE_MAX_DISTANCE);
  }, 30_000);

  it('hashes an identical decode to distance 0', () => {
    const entry = FECAL_CHARTS.dog.entries.find((e) => e.score === 3.5)!;
    const a = dHash(chartImage(entry.imagePath));
    const b = dHash(chartImage(entry.imagePath));
    expect(hammingDistance(a, b)).toBe(0);
  });
});

describe('pixel verification primitives', () => {
  it('thumbnails to size² box-averaged luma cells', () => {
    const t = grayThumbnail(ramp(64, 64));
    expect(t).toHaveLength(PIXEL_THUMB_SIZE * PIXEL_THUMB_SIZE);
    // Left edge dark, right edge bright, every row identical.
    expect(t[0]).toBeLessThan(10);
    expect(t[PIXEL_THUMB_SIZE - 1]).toBeGreaterThan(245);
    expect(t[PIXEL_THUMB_SIZE]).toBeCloseTo(t[0]);
    expect(grayThumbnail(ramp(), 4)).toHaveLength(16);
  });

  it('measures mean absolute difference, and refuses mismatched lengths', () => {
    expect(meanAbsoluteDifference([0, 10, 20], [0, 10, 20])).toBe(0);
    expect(meanAbsoluteDifference([0, 10, 20], [3, 7, 26])).toBe(4);
    expect(() => meanAbsoluteDifference([1, 2], [1, 2, 3])).toThrow(/length/i);
    expect(meanAbsoluteDifference([], [])).toBe(Number.POSITIVE_INFINITY);
  });

  it('compares aspect ratios relatively', () => {
    expect(aspectRatioDelta({ width: 640, height: 640 }, { width: 1200, height: 1200 })).toBe(0);
    expect(aspectRatioDelta({ width: 1600, height: 1200 }, { width: 640, height: 640 })).toBeCloseTo(
      1 / 3,
    );
    expect(aspectRatioDelta({ width: 0, height: 10 }, { width: 10, height: 10 })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('a brightness-preserving dHash twin is still rejected by the pixel stage', () => {
    // Halving the contrast keeps every left/right brightness ORDER (so the
    // dHash is identical) while every pixel moves — the silhouette-vs-texture
    // failure in miniature.
    const img = noise(3, 64, 64);
    const flat: RgbaImage = { ...img, data: Uint8Array.from(img.data) };
    for (let i = 0; i < flat.data.length; i += 4) {
      for (let c = 0; c < 3; c++) flat.data[i + c] = 128 + (img.data[i + c] - 128) / 2;
    }
    const v = compareFingerprints(fingerprint(flat), fingerprint(img));
    expect(v.hashDistance).toBeLessThanOrEqual(EXACT_REFERENCE_MAX_DISTANCE);
    expect(v.pixelMad).toBeGreaterThan(EXACT_REFERENCE_MAX_PIXEL_MAD);
    expect(v.match).toBe(false);
  });

  it('rejects the same content in a different frame shape', () => {
    const square = fingerprint(ramp(64, 64));
    const wide = fingerprint(ramp(96, 64)); // same ramp, 3:2
    const v = compareFingerprints(wide, square);
    expect(v.hashDistance).toBe(0);
    expect(v.aspectDelta).toBeGreaterThan(EXACT_REFERENCE_MAX_ASPECT_DELTA);
    expect(v.match).toBe(false);
    expect(compareFingerprints(square, square).match).toBe(true);
  });
});

// ─── The exact-reference guard against the real chart photographs ─────────

const roundTrip = (image: RgbaImage, quality: number): RgbaImage =>
  decode(encode(image as never, quality).data, { useTArray: true }) as RgbaImage;

function mirror(image: RgbaImage): RgbaImage {
  const { width, height } = image;
  const data = new Uint8Array(image.data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = (y * width + (width - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) data[d + c] = image.data[s + c];
    }
  }
  return { width, height, data };
}

/**
 * A smooth, anti-aliased ellipse of stool-like colour on a white frame — a
 * plain-background photo of a formed stool (or a black tarry one on a paper
 * towel) as far as a 64-bit dHash can tell.
 */
function silhouette(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
  fraction: number,
  squash: number,
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  const rx = (fraction * width) / 2;
  const ry = (fraction * height * squash) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const edge = Math.min(rx, ry);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      const a = Math.max(0, Math.min(1, (1 - d) * edge + 0.5));
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 * (1 - a) + rgb[c] * a);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const SILHOUETTE_COLOURS = {
  dark: [30, 24, 20],
  mid: [60, 45, 35],
  brown: [92, 64, 40],
} as const;
const SILHOUETTE_FRACTIONS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const SILHOUETTE_SQUASH = [0.5, 0.75, 1];
const SILHOUETTE_FRAMES: Array<[number, number]> = [
  [1600, 1200],
  [1200, 1200],
];

describe('the exact-reference guard (aspect + dHash + pixels) on the real chart', () => {
  const references = FECAL_SPECIES.flatMap((species) =>
    FECAL_CHARTS[species].entries.map((entry) => {
      const image = chartImage(entry.imagePath);
      return { species, score: entry.score, path: entry.imagePath, image, fp: fingerprint(image) };
    }),
  );

  it('(a) accepts every chart photo re-encoded as the client would send it', () => {
    // The client (src/lib/imagePrep.ts) re-encodes at q0.85 with the longest
    // edge ≤ 1600 px, so a 640×640 chart photo keeps its size; q50–q90
    // brackets whatever else a trainee's device does.
    let worstMad = 0;
    let worstHash = 0;
    for (const ref of references) {
      for (const quality of [50, 70, 85, 90]) {
        const v = compareFingerprints(fingerprint(roundTrip(ref.image, quality)), ref.fp);
        worstMad = Math.max(worstMad, v.pixelMad);
        worstHash = Math.max(worstHash, v.hashDistance);
        if (!v.match) throw new Error(`${ref.path} q${quality} failed: ${JSON.stringify(v)}`);
      }
    }
    console.log(
      `chart re-encode (q50–q90): worst pixel MAD ${worstMad.toFixed(2)}, worst dHash ${worstHash} ` +
        `(guard: MAD ≤ ${EXACT_REFERENCE_MAX_PIXEL_MAD}, dHash ≤ ${EXACT_REFERENCE_MAX_DISTANCE})`,
    );
    // Headroom, not just a pass: the threshold is ≥ 4× the measured drift.
    expect(worstMad * 4).toBeLessThanOrEqual(EXACT_REFERENCE_MAX_PIXEL_MAD);
  }, 60_000);

  it('(b) rejects every plain-background silhouette, though the dHash alone matched many', () => {
    let hashOnlyMatches = 0;
    let closestMad = Infinity;
    let closest = '';
    let count = 0;
    for (const [name, rgb] of Object.entries(SILHOUETTE_COLOURS)) {
      for (const fraction of SILHOUETTE_FRACTIONS) {
        for (const squash of SILHOUETTE_SQUASH) {
          for (const [w, h] of SILHOUETTE_FRAMES) {
            count++;
            const fp = fingerprint(roundTrip(silhouette(w, h, rgb, fraction, squash), 85));
            let hashHit = false;
            for (const ref of references) {
              const v = compareFingerprints(fp, ref.fp);
              if (v.hashDistance <= EXACT_REFERENCE_MAX_DISTANCE) hashHit = true;
              if (v.pixelMad < closestMad) {
                closestMad = v.pixelMad;
                closest = `${name} ${fraction}×${squash} ${w}×${h} vs ${ref.path} (dHash ${v.hashDistance})`;
              }
              // The pixel stage ALONE must reject it — not just the aspect
              // check, which would hide a 4:3 frame's pixel verdict.
              expect(v.pixelMad).toBeGreaterThan(EXACT_REFERENCE_MAX_PIXEL_MAD);
              expect(v.match).toBe(false);
            }
            if (hashHit) hashOnlyMatches++;
          }
        }
      }
    }
    console.log(
      `silhouettes: ${hashOnlyMatches}/${count} within dHash ${EXACT_REFERENCE_MAX_DISTANCE} of a chart photo ` +
        `(the old guard would have fired); 0 pass the full check. Closest pixel MAD ` +
        `${closestMad.toFixed(2)} — ${closest}`,
    );
    expect(count).toBe(108);
    // Documents the bug the pixel stage exists for.
    expect(hashOnlyMatches).toBeGreaterThan(count / 4);
    // Margin: the closest silhouette is ≥ 4× the threshold away.
    expect(closestMad).toBeGreaterThan(EXACT_REFERENCE_MAX_PIXEL_MAD * 4);
  }, 180_000);

  it('(b) rejects every horizontally mirrored chart photo against every reference', () => {
    let closestMad = Infinity;
    let closest = '';
    for (const src of references) {
      const fp = fingerprint(roundTrip(mirror(src.image), 85));
      for (const ref of references) {
        const v = compareFingerprints(fp, ref.fp);
        if (v.pixelMad < closestMad) {
          closestMad = v.pixelMad;
          closest = `mirrored ${src.path} vs ${ref.path} (dHash ${v.hashDistance})`;
        }
        expect(v.pixelMad).toBeGreaterThan(EXACT_REFERENCE_MAX_PIXEL_MAD);
        expect(v.match).toBe(false);
      }
    }
    console.log(`mirrored chart photos: closest pixel MAD ${closestMad.toFixed(2)} — ${closest}`);
  }, 60_000);

  it('(c) never matches two different chart photos of the same species', () => {
    let closestMad = Infinity;
    let closest = '';
    for (const a of references) {
      for (const b of references) {
        if (a === b || a.species !== b.species) continue;
        const v = compareFingerprints(a.fp, b.fp);
        if (v.pixelMad < closestMad) {
          closestMad = v.pixelMad;
          closest = `${a.path} vs ${b.path} (dHash ${v.hashDistance})`;
        }
        expect(v.match).toBe(false);
      }
    }
    console.log(`different same-species chart photos: closest pixel MAD ${closestMad.toFixed(2)} — ${closest}`);
    expect(closestMad).toBeGreaterThan(EXACT_REFERENCE_MAX_PIXEL_MAD * 4);
  });

  it('(c) the ONE cross-species match is dog 4.5 = cat 5 — why lookup is per species', () => {
    const crossMatches: string[] = [];
    for (const a of references) {
      for (const b of references) {
        if (a.species >= b.species) continue; // each unordered cross pair once
        if (compareFingerprints(a.fp, b.fp).match) crossMatches.push(`${a.path}=${b.path}`);
      }
    }
    // The chart itself reuses one photograph for these two scores. The
    // function only ever compares within the selected species' chart, so a
    // dog scan of it reads 4.5 and a cat scan reads 5 — both correct.
    expect(crossMatches.sort()).toEqual(['/fecal-scan/cat/5.jpg=/fecal-scan/dog/4.5.jpg']);
  });

  it('the fingerprint carries the image dimensions the aspect check needs', () => {
    const fp: ImageFingerprint = references[0].fp;
    expect(fp.width).toBe(640);
    expect(fp.height).toBe(640);
    expect(fp.thumb).toHaveLength(PIXEL_THUMB_SIZE ** 2);
  });
});
