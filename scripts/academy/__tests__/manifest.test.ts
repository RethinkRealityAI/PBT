// @vitest-environment node
/**
 * Guards on what ships in `knowledge/academy/`: the manifest is the switch
 * that decides what reaches the corpus, so its shape, vocabulary and
 * agreement with the snapshots and the catalogue are checked on every
 * `npm test` — a hand edit that breaks any of it fails here, not in
 * production.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAcademyPublished,
  parseSnapshot,
  validateManifest,
  type AcademyManifest,
} from '../../../netlify/functions/_shared/knowledgeAcademy';
import { sha256Hex } from '../../../netlify/functions/_shared/knowledgeSync';
import { FOCUS_AREA_KEYS } from '../../../src/shared/knowledge/focusAreas';
import { KNOWLEDGE_SPECIES_KEYS, KNOWLEDGE_TOOL_KEYS } from '../../../src/shared/knowledge/knowledgeScopes';
import { mapSpecies } from '../triage';
import type { Catalogue } from '../catalogue';

const ROOT = path.resolve(__dirname, '../../../knowledge/academy');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as AcademyManifest;
const catalogue = JSON.parse(readFileSync(path.join(ROOT, 'catalogue.json'), 'utf8')) as Catalogue;
const bySlug = new Map(catalogue.articles.map((a) => [a.slug, a]));
const approved = manifest.articles.filter((a) => a.approved);

describe('manifest.json', () => {
  it('passes the sync’s own validation', () => {
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('only opens the gate with Royal Canin’s permission recorded', () => {
    if (manifest.publish) {
      expect(manifest.permission.status).toBe('granted');
      expect(manifest.permission.reference.trim()).not.toBe('');
      expect(manifest.permission.grantedBy.trim()).not.toBe('');
      expect(manifest.permission.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(isAcademyPublished(manifest)).toBe(manifest.publish && manifest.permission.status === 'granted');
  });

  it('has no duplicate slugs', () => {
    const slugs = manifest.articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses only the shared vocabularies, and never the Fecal Scan', () => {
    for (const a of manifest.articles) {
      if (a.focus !== null) expect(FOCUS_AREA_KEYS).toContain(a.focus);
      expect(a.species.length).toBeGreaterThan(0);
      for (const s of a.species) expect(KNOWLEDGE_SPECIES_KEYS).toContain(s);
      expect(a.tools.length).toBeGreaterThan(0);
      for (const t of a.tools) expect(KNOWLEDGE_TOOL_KEYS).toContain(t);
      expect(a.tools).not.toContain('fecal-scan');
      expect(a.reason.trim().length).toBeGreaterThan(10);
      expect(a.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('only lists articles the catalogue holds as readable', () => {
    for (const a of manifest.articles) {
      expect(bySlug.get(a.slug)?.status, a.slug).toBe('ok');
    }
  });

  it("never widens an article's animals beyond the site's own Species", () => {
    for (const a of approved) {
      const site = mapSpecies(bySlug.get(a.slug)!.species);
      for (const s of a.species) expect(site, `${a.slug}: ${s}`).toContain(s);
    }
  });
});

describe('snapshots', () => {
  it('exist for exactly the approved articles', () => {
    const files = readdirSync(path.join(ROOT, 'articles')).filter((f) => f.endsWith('.md'));
    expect(files.map((f) => f.slice(0, -3)).sort()).toEqual(approved.map((a) => a.slug).sort());
  });

  for (const a of approved) {
    it(`${a.slug}: front-matter agrees with the manifest and the catalogue`, () => {
      const file = path.join(ROOT, 'articles', `${a.slug}.md`);
      expect(existsSync(file)).toBe(true);
      const { frontMatter: fm, body } = parseSnapshot(readFileSync(file, 'utf8'));
      expect(fm.slug).toBe(a.slug);
      expect(fm.url).toBe(`https://academy.royalcanin.com/en/veterinary/${a.slug}`);
      expect(fm.contentHash).toBe(sha256Hex(body));
      expect(fm.sourceHash).toBe(bySlug.get(a.slug)!.sourceHash);
      expect(fm.title.trim()).not.toBe('');
      expect(body.trim().length).toBeGreaterThan(0);
      // Raw markup or an undecoded entity means the converter missed something.
      expect(body).not.toMatch(/<\/?(p|div|span|strong|em|table|td|br)\b/i);
      expect(body).not.toMatch(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i);
    });
  }
});

describe('catalogue.json', () => {
  it('holds every sitemap article once', () => {
    expect(catalogue.count).toBe(catalogue.articles.length);
    expect(new Set(catalogue.articles.map((a) => a.slug)).size).toBe(catalogue.articles.length);
  });

  it('mirrors the manifest decision for every reviewed article', () => {
    for (const a of manifest.articles) {
      expect(bySlug.get(a.slug)?.decision, a.slug).toMatchObject({ approved: a.approved, reason: a.reason });
    }
  });

  it('records a reason for every proposal', () => {
    for (const a of catalogue.articles) expect(a.proposed.reason.trim(), a.slug).not.toBe('');
  });

  it('flags no approved article for a failed coverage check', () => {
    for (const a of approved) expect(bySlug.get(a.slug)!.check, a.slug).toBeUndefined();
  });
});
