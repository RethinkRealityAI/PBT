/**
 * Shared plumbing for the academy scripts: where the files live, and
 * "fetch (through the cache) + parse" for one article or the magazine page.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { MAGAZINE_URL, MIN_DELAY_MS, USER_AGENT, articleUrl, fetchPage, type FetchOptions } from './fetch';
import type { AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';
import {
  extractNextData,
  parseArticle,
  parseIssueMap,
  routeOf,
  sourceHashOf,
  type ArticleModel,
  type IssueRef,
  type SitecoreRoute,
} from './sitecore';

export const ACADEMY_ROOT = path.resolve(process.cwd(), 'knowledge/academy');
export const CATALOGUE_PATH = path.join(ACADEMY_ROOT, 'catalogue.json');
export const MANIFEST_PATH = path.join(ACADEMY_ROOT, 'manifest.json');
export const ARTICLES_DIR = path.join(ACADEMY_ROOT, 'articles');

export const snapshotPath = (slug: string) => path.join(ARTICLES_DIR, `${slug}.md`);

export type LoadedArticle =
  | { status: 'ok'; slug: string; url: string; route: SitecoreRoute; model: ArticleModel; sourceHash: string; fetchedAt: string }
  | { status: 'gone'; slug: string; url: string; httpStatus: number; fetchedAt: string }
  | { status: 'unparseable'; slug: string; url: string; fetchedAt: string };

export async function loadArticle(slug: string, opts: FetchOptions = {}): Promise<LoadedArticle> {
  const url = articleUrl(slug);
  const res = await fetchPage(url, opts);
  if (res.status !== 200) return { status: 'gone', slug, url, httpStatus: res.status, fetchedAt: res.fetchedAt };
  const route = routeOf(extractNextData(res.body));
  // A 200 whose route has no Article placeholder is the site's soft 404.
  if (!route || !(route.placeholders?.['jss-main'] ?? []).some((c) => c.componentName === 'Article')) {
    return { status: 'unparseable', slug, url, fetchedAt: res.fetchedAt };
  }
  return {
    status: 'ok',
    slug,
    url,
    route,
    model: parseArticle(route, slug, url),
    sourceHash: sourceHashOf(route),
    fetchedAt: res.fetchedAt,
  };
}

export async function loadIssueMap(opts: FetchOptions = {}): Promise<Map<string, IssueRef>> {
  const res = await fetchPage(MAGAZINE_URL, opts);
  const route = res.status === 200 ? routeOf(extractNextData(res.body)) : null;
  if (!route) throw new Error(`Could not read the Vet Focus magazine page (${res.status})`);
  return parseIssueMap(route);
}

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Stable, reviewable JSON: two-space indent, trailing newline. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export const today = () => new Date().toISOString().slice(0, 10);

/** The manifest a first catalogue run starts from: gate closed. */
export const EMPTY_MANIFEST: AcademyManifest = {
  permission: { status: 'pending', reference: '', grantedBy: '', date: '' },
  publish: false,
  fetcher: { userAgent: USER_AGENT, minDelayMs: MIN_DELAY_MS },
  articles: [],
};
