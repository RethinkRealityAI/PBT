/**
 * Perceptual hashing for the Fecal Scan near-duplicate guard.
 *
 * The guard exists because the model, shown the chart's OWN score-3.5
 * photograph, confidently answered 4. A dHash comparison is deterministic and
 * settles that case without asking the model anything — but it must NEVER
 * fire on a real clinic photo, so the last test here measures the real chart
 * photographs against each other and pins how far apart they are.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decode, encode } from 'jpeg-js';
import {
  EXACT_REFERENCE_MAX_DISTANCE,
  dHash,
  hammingDistance,
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
  });

  /**
   * The other side of the threshold. A trainee scanning a chart photo sends a
   * re-encoded JPEG (the client downscales and re-compresses), so the guard
   * must survive that — otherwise it never fires in the field.
   *
   * These two tests are what justify the constant: the guard must sit ABOVE
   * the worst re-encode drift and BELOW the closest confusable pair. At the
   * time of writing that window is 3 < 6 < 9.
   */
  it.each(FECAL_SPECIES)('%s — a re-encode never moves a hash past the guard', (species) => {
    let worst = 0;
    for (const entry of FECAL_CHARTS[species].entries) {
      const image = chartImage(entry.imagePath);
      const original = dHash(image);
      for (const quality of [90, 70, 50]) {
        const round = decode(encode(image as never, quality).data, { useTArray: true });
        worst = Math.max(worst, hammingDistance(original, dHash(round as RgbaImage)));
      }
    }
    console.log(`${species} worst re-encode drift: ${worst}`);
    expect(worst).toBeLessThanOrEqual(EXACT_REFERENCE_MAX_DISTANCE);
  });

  it('hashes an identical decode to distance 0', () => {
    const entry = FECAL_CHARTS.dog.entries.find((e) => e.score === 3.5)!;
    const a = dHash(chartImage(entry.imagePath));
    const b = dHash(chartImage(entry.imagePath));
    expect(hammingDistance(a, b)).toBe(0);
  });
});
