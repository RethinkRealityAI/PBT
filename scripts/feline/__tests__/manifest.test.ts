// @vitest-environment node
/**
 * Guards on `knowledge/feline/`: the manifest decides what reaches the corpus
 * and who may read it, so the owner's decisions (2026-11-04) are pinned here
 * — cat only, tools by audience, the US edition scoped down, the canine-only
 * guide and the draft excluded, every document pinned, no approved document
 * with an open fidelity note — and the catalogue accounts for every file
 * delivered. The text itself is in knowledge_source_snapshots, never here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bundledFelineManifest,
  expectedFelineTools,
  isFelinePublished,
  validateFelineManifest,
  type FelineManifest,
} from '../../../netlify/functions/_shared/knowledgeFeline';

const ROOT = path.resolve(__dirname, '../../../knowledge/feline');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as FelineManifest;
const catalogue = JSON.parse(readFileSync(path.join(ROOT, 'catalogue.json'), 'utf8')) as {
  count: number;
  files: Array<{ sourceId: string; fileName: string; pages: number; decision: { documents?: string[]; excluded?: string } }>;
};

describe('feline manifest.json', () => {
  it('passes the sync’s validation and is the bundled manifest', () => {
    expect(() => validateFelineManifest(manifest)).not.toThrow();
    expect(bundledFelineManifest()).toEqual(manifest);
  });

  it('records the permission and ships with the gate closed until the owner releases it', () => {
    expect(manifest.permission.status).toBe('granted');
    expect(manifest.permission.reference).toMatch(/Royal Canin Canada Veterinary Division/);
    expect(manifest.permission.date).toBe('2026-11-02');
    expect(manifest.publish).toBe(false);
    expect(isFelinePublished(manifest)).toBe(false);
  });

  it('is feline only, with tools set by audience and region', () => {
    for (const d of manifest.documents) {
      expect(d.species, d.slug).toEqual(['cat']);
      expect([...d.tools].sort(), d.slug).toEqual([...expectedFelineTools(d.audience, d.region)].sort());
      expect(d.tools).not.toContain('fecal-scan');
    }
    const us = manifest.documents.filter((d) => d.region === 'US');
    expect(us.map((d) => d.slug)).toEqual(['urinary-behind-the-science-us']);
  });

  it('only owner-facing material (brochures, owner guides) can reach the AI cat owner', () => {
    for (const d of manifest.documents) {
      const ownerType = d.assetType === 'brochure' || d.assetType === 'owner-guide';
      expect(d.audience === 'owner', d.slug).toBe(ownerType);
      expect(d.tools.includes('roleplay'), d.slug).toBe(ownerType);
    }
  });

  it('pins every document and approves none with an open review note', () => {
    for (const d of manifest.documents) {
      expect(d.contentHash, d.slug).toMatch(/^[0-9a-f]{64}$/);
      expect(d.sourceHash, d.slug).toMatch(/^[0-9a-f]{64}$/);
      if (d.approved) expect(d.reviewNotes.filter((n) => n.status !== 'signed-off'), d.slug).toEqual([]);
    }
  });

  it('keeps and excludes pages without overlap, and splits the Product Guide by product family', () => {
    const byFile = new Map<string, number[]>();
    for (const d of manifest.documents) {
      const excluded = d.pagesExcluded.flatMap((e) => e.pages);
      for (const p of d.pages) expect(excluded, `${d.slug} p${p}`).not.toContain(p);
      expect(new Set(d.pages).size).toBe(d.pages.length);
      byFile.set(d.sourceId, [...(byFile.get(d.sourceId) ?? []), ...d.pages]);
    }
    const guide = manifest.documents.filter((d) => d.assetType === 'product-guide');
    expect(guide.length).toBeGreaterThan(20);
    const pages = byFile.get(guide[0].sourceId)!;
    expect(new Set(pages).size, 'a Product Guide page belongs to one family document').toBe(pages.length);
  });

  it('excludes the canine-only owner guide and the image-only draft', () => {
    expect(manifest.excluded.map((e) => e.reason).join(' ')).toMatch(/Canine only/);
    expect(manifest.excluded.map((e) => e.reason).join(' ')).toMatch(/Draft/);
  });
});

describe('feline catalogue.json', () => {
  it('accounts for every delivered file: imported as documents, or excluded with a reason', () => {
    expect(catalogue.count).toBe(catalogue.files.length);
    const slugs = new Set(manifest.documents.map((d) => d.slug));
    for (const f of catalogue.files) {
      if (f.decision.documents) for (const s of f.decision.documents) expect(slugs.has(s), s).toBe(true);
      else expect(f.decision.excluded, f.fileName).toMatch(/\w/);
    }
    const ids = new Set(catalogue.files.map((f) => f.sourceId));
    for (const d of manifest.documents) expect(ids.has(d.sourceId), d.slug).toBe(true);
    for (const e of manifest.excluded) expect(ids.has(e.sourceId), e.title).toBe(true);
  });
});
