/**
 * Royal Canin Academy page → `ArticleModel`. Pure: no I/O, no clock.
 *
 * The site is Sitecore JSS rendered by Next.js, so every article page embeds
 * its whole content model in `<script id="__NEXT_DATA__">` →
 * `props.pageProps.layoutData.sitecore.route`. We read THAT — the CMS's own
 * fields — never the rendered DOM and never anything a model wrote. The
 * rich-text bodies stay HTML here; `toMarkdown.ts` converts them.
 *
 * Input is untrusted (a cached HTTP body): it is parsed as JSON and read as
 * data, nothing more.
 */
import { createHash } from 'node:crypto';

type Bag = Record<string, unknown>;

export interface SitecoreComponent {
  componentName?: string;
  fields?: Bag | null;
  params?: Bag | null;
  placeholders?: Record<string, SitecoreComponent[]>;
}

export interface SitecoreRoute {
  name?: string;
  fields?: Bag;
  placeholders?: Record<string, SitecoreComponent[]>;
}

/** One body element, in page order. Rich text stays HTML. */
export type ArticleBlock =
  | { kind: 'rich'; title: string; headingLevel: number; html: string }
  | { kind: 'keypoints'; title: string; html: string }
  | { kind: 'box'; title: string; html: string }
  | { kind: 'quote'; text: string; author: string }
  | { kind: 'caption'; text: string }
  /** The `Sources` component (older articles keep references there). */
  | { kind: 'references'; title: string; items: string[] };

export interface AuthorBlock {
  name: string;
  /** Credentials + affiliation line, as the site prints it. */
  subtitle: string;
  bioHtml: string;
}

export interface ArticleModel {
  slug: string;
  url: string;
  title: string;
  /** YYYY-MM-DD, or '' when the CMS has none. */
  publicationDate: string;
  species: string[];
  lifestage: string[];
  themes: string[];
  topics: string[];
  tags: string[];
  keywords: string[];
  descriptionHtml: string;
  readingTime: string;
  editorialTag: string;
  /** PageHeader.LeadParagraph, HTML (includes the "Written by" line). */
  leadHtml: string;
  /** The lead without its "Written by" line — the stand-first. */
  standfirstHtml: string;
  /** Names from the "Written by" line, in order. */
  writtenBy: string[];
  authorBlocks: AuthorBlock[];
  blocks: ArticleBlock[];
  /** Components we met but have no rule for (reported, rendered generically). */
  unknownComponents: string[];
}

/** The JSON inside `<script id="__NEXT_DATA__">`, or null. */
export function extractNextData(html: string): unknown {
  const m = /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** `props.pageProps.layoutData.sitecore.route`, or null. */
export function routeOf(nextData: unknown): SitecoreRoute | null {
  const route = (nextData as { props?: { pageProps?: { layoutData?: { sitecore?: { route?: unknown } } } } })
    ?.props?.pageProps?.layoutData?.sitecore?.route;
  return route && typeof route === 'object' ? (route as SitecoreRoute) : null;
}

/** `{ value }` → string. */
export function fieldText(v: unknown): string {
  if (v && typeof v === 'object' && 'value' in (v as Bag)) {
    const value = (v as Bag).value;
    return typeof value === 'string' ? value : '';
  }
  return typeof v === 'string' ? v : '';
}

/** A taxonomy multilist (`[{ fields: { Value: { value } } }]`) → labels. */
export function taxonomyValues(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const fields = (item as { fields?: Bag })?.fields ?? {};
    const label =
      fieldText(fields.Value) || fieldText(fields.Text) || String((item as Bag)?.displayName ?? '');
    const clean = label.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function taxonomyOne(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const fields = (v as { fields?: Bag }).fields ?? {};
  return (fieldText(fields.Value) || fieldText(fields.Text) || String((v as Bag).displayName ?? '')).trim();
}

/** "a, b ,c" → ['a','b','c'] (order kept, duplicates dropped). */
export function splitKeywords(s: string): string[] {
  const out: string[] = [];
  for (const part of s.split(/[,;]/)) {
    const k = part.trim().replace(/\s+/g, ' ');
    if (k && !out.some((o) => o.toLowerCase() === k.toLowerCase())) out.push(k);
  }
  return out;
}

function placeholder(c: { placeholders?: Record<string, SitecoreComponent[]> } | undefined, name: string) {
  return c?.placeholders?.[name] ?? [];
}

function headingLevelOf(fields: Bag): number {
  const tag = taxonomyOne(fields.HeadingLevel) || taxonomyOne(fields.TitleTag);
  const m = /^h([1-6])$/i.exec(tag);
  return m ? Number(m[1]) : 2;
}

/**
 * Not article prose: the "other articles" carousel, share buttons, a CTA
 * button to a PDF, an embedded video, and the duplicate page header some
 * articles carry inside their body (read separately as the header).
 */
const IGNORED = new Set([
  'ArticleCarousel',
  'SocialShare',
  'Spacer',
  'Divider',
  'CTA',
  'YouTubeVideoPlayer',
  'PageHeader',
]);

/** Accent- and case-insensitive name key ("Prélaud" = "prelaud"). */
function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Older author boxes have no `id="author"`: they are an untitled content
 * block opening with `<h4>Name</h4>` (one per author, sometimes several in a
 * block). Split such a block into authors when every heading names someone
 * from the "Written by" line; otherwise it is not an author block.
 */
function authorsFromHeadingBlock(html: string, writtenBy: readonly string[]): AuthorBlock[] | null {
  if (!/^\s*(?:<p>\s*)?<h[2-5][^>]*>/i.test(html) || writtenBy.length === 0) return null;
  const known = writtenBy.map(nameKey);
  const parts = html.split(/(?=<h[2-5][^>]*>)/i).filter((p) => p.trim());
  const out: AuthorBlock[] = [];
  for (const part of parts) {
    const m = /^\s*<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>([\s\S]*)$/i.exec(part);
    if (!m) return null;
    const name = roughText(m[1]);
    const key = nameKey(name);
    if (!known.some((k) => k && (k === key || key.includes(k) || k.includes(key)))) return null;
    let rest = m[2];
    let subtitle = '';
    const cred = /^\s*<(strong|b)>([\s\S]*?)<\/\1>/i.exec(rest);
    if (cred) {
      subtitle = roughText(cred[2]);
      rest = rest.slice(cred[0].length);
    }
    out.push({ name: decodeBasic(name), subtitle: decodeBasic(subtitle), bioHtml: rest });
  }
  return out.length ? out : null;
}

/** Decode the few entities a name or credential line carries. */
function decodeBasic(s: string): string {
  return s
    .replace(/&([a-z]+);/gi, (w, e: string) => {
      const map: Record<string, string> = {
        eacute: 'é', egrave: 'è', euml: 'ë', ouml: 'ö', uuml: 'ü', auml: 'ä', iacute: 'í', aacute: 'á',
        oacute: 'ó', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ', amp: '&', rsquo: '’', ndash: '–', atilde: 'ã',
        otilde: 'õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', icirc: 'î', iuml: 'ï', oslash: 'ø', aring: 'å',
      };
      return map[e] ?? w;
    })
    .trim();
}

/** Plain text of an HTML fragment — for detection only, never for output. */
function roughText(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walkContent(
  comps: SitecoreComponent[],
  blocks: ArticleBlock[],
  authors: AuthorBlock[],
  unknown: string[],
  writtenBy: readonly string[],
): void {
  for (const c of comps) {
    const name = c.componentName ?? '';
    const f = (c.fields ?? {}) as Bag;
    if (IGNORED.has(name)) continue;

    if (name === 'TitleAndParagraph') {
      const html = fieldText(f.Text);
      const title = fieldText(f.Title).trim();
      if (html.trim() || title) blocks.push({ kind: 'rich', title, headingLevel: headingLevelOf(f), html });
    } else if (name === 'ContentBlocksVariant') {
      const html = fieldText(f.Content);
      const title = fieldText(f.Title).trim();
      const headed = title ? null : authorsFromHeadingBlock(html, writtenBy);
      if (/\bid\s*=\s*["'](?:author\d*|first|second|third)["']/i.test(html)) {
        if (title) {
          authors.push({ name: decodeBasic(title), subtitle: decodeBasic(fieldText(f.Subtitle).replace(/\s+/g, ' ')), bioHtml: html });
        } else {
          authors.push(...(headed ?? [{ name: '', subtitle: '', bioHtml: html }]));
        }
      } else if (headed) {
        authors.push(...headed);
      } else if (/^key points?$/i.test(title)) {
        blocks.push({ kind: 'keypoints', title, html });
      } else if (html.trim() || title) {
        blocks.push({ kind: 'box', title, html });
      }
    } else if (name === 'QuotePanel') {
      const text = fieldText(f.QuoteText).trim();
      if (text) blocks.push({ kind: 'quote', text, author: fieldText(f.Author).trim() });
    } else if (name === 'Sources') {
      const items = Array.isArray(f.items)
        ? (f.items as Array<{ fields?: Bag }>).map((it) => fieldText(it.fields?.Text)).filter((t) => roughText(t))
        : [];
      if (items.length) blocks.push({ kind: 'references', title: fieldText(f.Title).trim() || 'References', items });
    } else if (name === 'ImageAndCaption') {
      const text = fieldText(f.Caption).trim();
      if (roughText(text)) blocks.push({ kind: 'caption', text });
    } else if (name !== 'LayoutContainerVariation' && f) {
      // A component we have no rule for: keep any rich text it carries
      // (losing words silently is worse than an odd layout) and report it.
      const html = fieldText(f.Text) || fieldText(f.Content) || fieldText(f.Body);
      if (roughText(html)) {
        if (!unknown.includes(name)) unknown.push(name);
        blocks.push({ kind: 'rich', title: fieldText(f.Title).trim(), headingLevel: 3, html });
      }
    }
    for (const nested of Object.values(c.placeholders ?? {})) {
      walkContent(nested, blocks, authors, unknown, writtenBy);
    }
  }
}

/**
 * Split the lead into its "Written by …" line and the stand-first. The line
 * is either the first `<p>` or bare inline markup before the first `<p>`
 * (`<em>Written by <a>…</a></em>`).
 */
export function splitLead(leadHtml: string): { byline: string; standfirst: string } {
  const p = /^\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(leadHtml);
  if (p && /^written by\b/i.test(roughText(p[1]))) {
    return { byline: roughText(p[1]), standfirst: leadHtml.slice(p[0].length) };
  }
  const bare = /^\s*((?:(?!<p\b)[\s\S])*?)(?=<p\b|$)/i.exec(leadHtml);
  if (bare && /^written by\b/i.test(roughText(bare[1]))) {
    return { byline: roughText(bare[1]), standfirst: leadHtml.slice(bare[0].length) };
  }
  return { byline: '', standfirst: leadHtml };
}

/** Names from "Written by A, B and C". */
export function parseWrittenBy(leadHtml: string): string[] {
  const m = /^written by\s+(.+)$/i.exec(splitLead(leadHtml).byline);
  if (!m) return [];
  return m[1]
    .split(/\s*,\s*|\s+and\s+|\s*&amp;\s*|\s*&\s*/i)
    .map((s) => decodeBasic(s.trim()))
    .filter(Boolean);
}

export function parseArticle(route: SitecoreRoute, slug: string, url: string): ArticleModel {
  const f = (route.fields ?? {}) as Bag;
  const main = placeholder(route, 'jss-main');
  const article = main.find((c) => c.componentName === 'Article');
  const header = main.find((c) => c.componentName === 'PageHeader') ?? findComponent(article, 'PageHeader');
  const leadHtml = fieldText((header?.fields as Bag | undefined)?.LeadParagraph);
  const writtenBy = parseWrittenBy(leadHtml);

  const blocks: ArticleBlock[] = [];
  const authorBlocks: AuthorBlock[] = [];
  const unknownComponents: string[] = [];
  if (article) {
    for (const comps of Object.values(article.placeholders ?? {})) {
      walkContent(comps, blocks, authorBlocks, unknownComponents, writtenBy);
    }
  }

  const date = fieldText(f.PublicationDate);
  return {
    slug,
    url,
    title: (fieldText(f.ArticleName) || fieldText(f.Title) || fieldText((header?.fields as Bag | undefined)?.Headline)).trim(),
    publicationDate: /^\d{4}-\d{2}-\d{2}/.test(date) && !date.startsWith('0001') ? date.slice(0, 10) : '',
    species: taxonomyValues(f.Species),
    lifestage: taxonomyValues(f.Lifestage),
    themes: taxonomyValues(f.Themes),
    topics: taxonomyValues(f.ArticleTopics),
    tags: taxonomyValues(f.Tags),
    keywords: splitKeywords(fieldText(f.MetaKeywords)),
    descriptionHtml: fieldText(f.ArticleDescription),
    readingTime: fieldText(f.ReadingTime).trim(),
    editorialTag: taxonomyOne(f.EditorialTag),
    leadHtml,
    standfirstHtml: splitLead(leadHtml).standfirst,
    writtenBy,
    authorBlocks,
    blocks,
    unknownComponents,
  };
}

function findComponent(root: SitecoreComponent | undefined, name: string): SitecoreComponent | undefined {
  for (const comps of Object.values(root?.placeholders ?? {})) {
    for (const c of comps) {
      if (c.componentName === name) return c;
      const nested = findComponent(c, name);
      if (nested) return nested;
    }
  }
  return undefined;
}

// ── Source fingerprint ─────────────────────────────────────────────────────

/** Site-wide or presentation-only keys: they change without the article changing. */
const VOLATILE_KEYS = new Set([
  'siteSettings',
  'globalSettings',
  'tenantSettings',
  'Page Design',
  'SitemapUpdated',
  'SitemapsFile',
  'CacheClearingBehavior',
  'renderingId',
]);

/** JSON with sorted keys and volatile keys dropped. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as Bag)
      .filter((k) => !VOLATILE_KEYS.has(k))
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Bag)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * sha256 of the parts of the route the snapshot is made from: the article's
 * fields, its page header and its content placeholder (minus the "other
 * articles" carousel). Header, footer, navigation and cookie banner are left
 * out, so a site-wide menu change is not reported as article drift.
 */
export function sourceHashOf(route: SitecoreRoute): string {
  const main = placeholder(route, 'jss-main');
  const article = main.find((c) => c.componentName === 'Article');
  const header = main.find((c) => c.componentName === 'PageHeader') ?? findComponent(article, 'PageHeader');
  const strip = (comps: SitecoreComponent[]): unknown =>
    comps
      .filter((c) => !IGNORED.has(c.componentName ?? ''))
      .map((c) => ({
        componentName: c.componentName,
        fields: c.fields ?? null,
        placeholders: Object.fromEntries(
          Object.entries(c.placeholders ?? {}).map(([k, v]) => [k, strip(v)]),
        ),
      }));
  const subset = {
    fields: route.fields ?? {},
    header: header?.fields ?? null,
    content: article ? Object.fromEntries(Object.entries(article.placeholders ?? {}).map(([k, v]) => [k, strip(v)])) : null,
  };
  return createHash('sha256').update(canonicalJson(subset)).digest('hex');
}

// ── Magazine page: slug → issue ────────────────────────────────────────────

export interface IssueRef {
  issue: string;
  issueTitle: string;
  issuePdf: string;
}

/**
 * Issue numbers live on `/en/veterinary-focus-magazine`, not on the article:
 * one `ContentBlocksVariant` per issue titled "36.1 Beyond body condition"
 * (with the issue PDF on Button1), followed — in the same block or the next
 * untitled ones — by links to that issue's articles. The first issue that
 * links a slug wins (special editions re-list older articles).
 */
export function parseIssueMap(route: SitecoreRoute): Map<string, IssueRef> {
  const map = new Map<string, IssueRef>();
  let current: IssueRef | null = null;
  const visit = (comps: SitecoreComponent[]) => {
    for (const c of comps) {
      if (c.componentName === 'ContentBlocksVariant') {
        const f = (c.fields ?? {}) as Bag;
        const title = fieldText(f.Title).replace(/\s+/g, ' ').trim();
        const m = /^(\d+\.(?:\d+|S))\s+(.+)$/i.exec(title);
        if (m) {
          const btn = (f.Button1 as { value?: { href?: string } } | undefined)?.value?.href ?? '';
          current = { issue: m[1], issueTitle: m[2].trim(), issuePdf: btn };
        } else if (title) {
          current = null;
        }
        if (current) {
          for (const link of fieldText(f.Content).matchAll(/href="\/en\/veterinary\/([a-z0-9-]+)"/gi)) {
            if (!map.has(link[1])) map.set(link[1], current);
          }
        }
      }
      for (const nested of Object.values(c.placeholders ?? {})) visit(nested);
    }
  };
  for (const comps of Object.values(route.placeholders ?? {})) visit(comps);
  return map;
}
