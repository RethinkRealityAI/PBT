/**
 * The ONE way this repo talks to academy.royalcanin.com.
 *
 * The site answers a default client with 403 and a truthfully identified
 * one with 200. We identify ourselves honestly — never a browser
 * User-Agent — and behave like a polite reader: one request at a time, at
 * least `MIN_DELAY_MS` apart, backing off on 429 / 5xx, and caching every
 * response under `.cache/academy/` (gitignored) so a re-run costs the site
 * nothing. robots.txt disallows `/api/` at any depth; `assertAllowed` refuses
 * those paths and anything off the site, so the faceted-search API the
 * listing page uses can never be called from here.
 *
 * Cached bodies are untrusted data: they are parsed as JSON / text, never
 * executed.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ACADEMY_ORIGIN = 'https://academy.royalcanin.com';
export const USER_AGENT =
  'PBT-KnowledgeFetcher/1.0 (Pushback Training knowledge import; contact dapo@rethinkreality.ai)';
export const MIN_DELAY_MS = 1500;
const MAX_ATTEMPTS = 5;

export const CACHE_DIR = path.resolve(process.cwd(), '.cache/academy');

/** Throws for anything robots.txt disallows or that is not the Academy. */
export function assertAllowed(url: string): URL {
  const u = new URL(url);
  if (u.origin !== ACADEMY_ORIGIN) throw new Error(`Refusing off-site URL: ${url}`);
  const segs = u.pathname.split('/').filter(Boolean);
  // Disallow: /api/, /*/api/, /*/*/api/ — and /global, /temp/, /upload/.
  if (segs.slice(0, 3).includes('api')) throw new Error(`robots.txt disallows ${u.pathname}`);
  if (['global', 'temp', 'upload'].includes(segs[0] ?? '')) {
    throw new Error(`robots.txt disallows ${u.pathname}`);
  }
  return u;
}

function cachePath(url: string): string {
  const u = new URL(url);
  const name = u.pathname.replace(/^\/+/, '').replace(/[^a-z0-9._-]+/gi, '_') || 'root';
  const digest = createHash('sha256').update(url).digest('hex').slice(0, 8);
  return path.join(CACHE_DIR, `${name}.${digest}`);
}

let lastRequestAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchResult {
  url: string;
  status: number;
  body: string;
  fromCache: boolean;
  /** When the body was fetched from the site (ISO, whole seconds). */
  fetchedAt: string;
}

export interface FetchOptions {
  /** Skip the cache read (still writes it) — `academy:verify`. */
  refresh?: boolean;
  log?: (line: string) => void;
}

/**
 * GET a page as text through the cache. A 404 / 410 is returned (and
 * cached) rather than thrown — "gone" is an answer `verify` needs.
 */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  assertAllowed(url);
  const file = cachePath(url);
  if (!opts.refresh) {
    try {
      const cached = JSON.parse(await readFile(file, 'utf8')) as { status: number; body: string; fetchedAt: string };
      return {
        url,
        status: cached.status,
        body: cached.body,
        fromCache: true,
        fetchedAt: String(cached.fetchedAt ?? '').replace(/\.\d{3}Z$/, 'Z'),
      };
    } catch {
      /* not cached */
    }
  }

  let attempt = 0;
  for (;;) {
    attempt += 1;
    const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    let status = 0;
    let body = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9' },
        redirect: 'follow',
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      opts.log?.(`  network error on ${url}: ${err instanceof Error ? err.message : err}`);
    }
    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable) {
      if (status === 403) {
        // The site refused our honest identity. We never change it; stop.
        throw new Error(`403 from ${url} — the site refused the fetcher's identity`);
      }
      const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (status === 200 || status === 404 || status === 410) {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify({ url, status, fetchedAt, body }));
      }
      return { url, status, body, fromCache: false, fetchedAt };
    }
    if (attempt >= MAX_ATTEMPTS) throw new Error(`Giving up on ${url} after ${attempt} attempts (last ${status})`);
    const backoff = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
    opts.log?.(`  ${status || 'error'} on ${url}; retrying in ${backoff / 1000}s`);
    await sleep(backoff);
  }
}

/** The `<loc>` URLs of a flat sitemap. */
export function parseSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** Article slugs (`/en/veterinary/<slug>`) in sitemap order, deduplicated. */
export function articleSlugsFromSitemap(xml: string): string[] {
  const out: string[] = [];
  for (const loc of parseSitemap(xml)) {
    const m = /^https:\/\/academy\.royalcanin\.com\/en\/veterinary\/([a-z0-9-]+)\/?$/i.exec(loc);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export const articleUrl = (slug: string) => `${ACADEMY_ORIGIN}/en/veterinary/${slug}`;
export const SITEMAP_URL = `${ACADEMY_ORIGIN}/en/sitemap.xml`;
export const MAGAZINE_URL = `${ACADEMY_ORIGIN}/en/veterinary-focus-magazine`;
