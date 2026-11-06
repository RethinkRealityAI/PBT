/**
 * A deliberately small HTML → Markdown converter for the Academy's Sitecore
 * rich text. Pure and deterministic: the same HTML always yields the same
 * Markdown, byte for byte, which is what lets a fixture test pin it and a
 * content hash mean something.
 *
 * Why our own instead of a library: the input is one CMS's narrow dialect
 * (p / h2–h4 / ul / ol / table / strong / em / a / br, plus inline SVG icons
 * and `&nbsp;` padding), and the output rules are ours — boxes as
 * blockquotes, single-cell layout tables unwrapped, links reduced to their
 * text. Nothing is reworded: every word that reaches the Markdown is a word
 * of the source.
 */

// ── Entities ───────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', prime: '′', Prime: '″',
  shy: '', zwj: '', zwnj: '', lrm: '', rlm: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷',
  micro: 'µ', para: '¶', sect: '§', permil: '‰', euro: '€', pound: '£', yen: '¥', cent: '¢',
  frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', ordf: 'ª', ordm: 'º',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', equiv: '≡', infin: '∞', minus: '−', sum: '∑',
  radic: '√', prop: '∝', part: '∂', int: '∫', there4: '∴', sim: '∼', cong: '≅',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', rArr: '⇒', lArr: '⇐', hArr: '⇔',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í',
  icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô',
  otilde: 'õ', ouml: 'ö', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', szlig: 'ß', thorn: 'þ', oelig: 'œ',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í',
  Icirc: 'Î', Iuml: 'Ï', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ',
  Ouml: 'Ö', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', OElig: 'Œ',
  iexcl: '¡', iquest: '¿', acute: '´', cedil: '¸', uml: '¨', macr: '¯', not: '¬', brvbar: '¦',
  dagger: '†', Dagger: '‡', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦',
  check: '✓', starf: '★', female: '♀', male: '♂',
};

/** Entity names seen that we could not decode — reported, never guessed. */
export const unknownEntities = new Set<string>();

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code === 0xa0) return ' ';
      if (code === 0xad || code === 0x200b || code === 0x200c || code === 0x200d) return '';
      return String.fromCodePoint(code);
    }
    if (body in NAMED) return NAMED[body];
    unknownEntities.add(body);
    return whole;
  });
}

// ── Tree ───────────────────────────────────────────────────────────────────

export interface HtmlNode {
  tag: string; // '#text' for text
  attrs: Record<string, string>;
  children: HtmlNode[];
  text?: string;
}

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col', 'wbr', 'area', 'base']);
/** Dropped with everything inside them. */
const DROP = new Set(['svg', 'script', 'style', 'noscript', 'iframe', 'video', 'audio', 'object', 'button', 'form', 'template']);
/** An open <p>/<li>/<td>… closes when one of these starts (HTML's implied end tags). */
const AUTO_CLOSE: Record<string, string[]> = {
  p: ['p', 'div', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figure'],
  li: ['li'],
  td: ['td', 'th', 'tr'],
  th: ['td', 'th', 'tr'],
  tr: ['tr'],
};

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack: HtmlNode[] = [root];
  const top = () => stack[stack.length - 1];
  // Attribute values may contain '>' (a citation tooltip "P > 0.05"), so
  // quoted strings are matched whole.
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+(?:[^>"'/]|\/(?!>)|"[^"]*"|'[^']*')*)?)\s*(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  let dropDepth = 0;
  let dropTag = '';
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined || (m[0] === '<' && !m[2])) {
      if (dropDepth === 0) top().children.push({ tag: '#text', attrs: {}, children: [], text: m[0] });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (dropDepth > 0) {
      if (tag === dropTag) dropDepth += closing ? -1 : m[4] ? 0 : 1;
      continue;
    }
    if (!closing && DROP.has(tag)) {
      if (!m[4]) {
        dropDepth = 1;
        dropTag = tag;
      }
      continue;
    }
    if (closing) {
      const idx = stack.map((n) => n.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx;
      continue;
    }
    // Implied end tags.
    for (let i = stack.length - 1; i > 0; i--) {
      const open = stack[i].tag;
      if (AUTO_CLOSE[open]?.includes(tag)) {
        stack.length = i;
        break;
      }
      if (['ul', 'ol', 'table', 'td', 'th', 'li', 'blockquote', 'div'].includes(open)) break;
    }
    const node: HtmlNode = { tag, attrs: parseAttrs(m[3] ?? ''), children: [] };
    top().children.push(node);
    if (!VOID.has(tag) && !m[4]) stack.push(node);
  }
  return root;
}

// ── Rendering ──────────────────────────────────────────────────────────────

const BLOCK = new Set([
  'p', 'div', 'caption', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figure', 'figcaption', 'section', 'article', 'hr', 'dl', 'dt', 'dd', 'center',
]);

const isBlock = (n: HtmlNode) => BLOCK.has(n.tag);

/** Inline content → one line of Markdown (`\n` only where a <br> was). */
export function renderInline(nodes: HtmlNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.tag === '#text') {
      out += decodeEntities(n.text ?? '').replace(/[ \t\r\n\f ]+/g, ' ');
    } else if (n.tag === 'br') {
      out += '\n';
    } else if ((n.tag === 'strong' || n.tag === 'b') && (n.attrs.title || /reference-snippet/.test(n.attrs.class ?? ''))) {
      // A citation marker ("[<strong title='Ackerman L. …'>3</strong>]"): the
      // tooltip is not article prose, and bolding the number is noise.
      out += renderInline(n.children);
    } else if (n.tag === 'strong' || n.tag === 'b') {
      out += wrap(renderInline(n.children), '**');
    } else if (n.tag === 'em' || n.tag === 'i') {
      out += wrap(renderInline(n.children), '*');
    } else if (n.tag === 'img') {
      // Images are not fetched; their alt text is not article prose.
    } else {
      out += renderInline(n.children);
    }
  }
  return out;
}

/** `**x**` with the whitespace moved outside the markers; nothing for blank. */
function wrap(inner: string, marker: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  if (!m[2]) return inner;
  // Already fully wrapped (nested <strong><strong>) — don't double it.
  if (m[2].startsWith(marker) && m[2].endsWith(marker) && m[2].length > marker.length * 2) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

/**
 * Tidy one rendered paragraph: trim each line, drop empty lines, and turn a
 * typed "•" bullet (older articles draw lists that way) into a Markdown one.
 */
function tidy(s: string): string {
  return s
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim().replace(/^•\s*/, '- '))
    .filter((l) => l && l !== '-' && !/^(\*\*|\*)+$/.test(l))
    .join('\n');
}

/**
 * Older articles draw section headings as a paragraph holding one big styled
 * span (`<p><span style="font-size: 1.875rem">Introduction</span></p>`).
 * Returns the heading level it stands for, or 0.
 */
function styledHeadingLevel(p: HtmlNode): number {
  const kids = p.children.filter((c) => !(c.tag === '#text' && !decodeEntities(c.text ?? '').trim()));
  if (kids.length !== 1 || kids[0].tag !== 'span') return 0;
  const m = /font-size:\s*([\d.]+)\s*(rem|em|px)/i.exec(kids[0].attrs.style ?? '');
  if (!m) return 0;
  const size = m[2].toLowerCase() === 'px' ? Number(m[1]) / 16 : Number(m[1]);
  if (size >= 1.5) return 2;
  if (size >= 1.2) return 3;
  return 0;
}

/** Strip Markdown emphasis — for headings and table-free plain uses. */
export function stripEmphasis(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

/** A table cell on one line: a list inside it becomes "a; b; c". */
function cellText(n: HtmlNode): string {
  const parts = renderBlocks(n.children).map((b) =>
    /^\s*(?:-|\d+\.) /.test(b)
      ? b
          .split('\n')
          .map((l) => l.replace(/^\s*(?:-|\d+\.) /, '').trim())
          .filter(Boolean)
          .join('; ')
      : b.replace(/\n+/g, ' '),
  );
  return parts.join(' ').replace(/\|/g, '\\|').trim();
}

function renderTable(table: HtmlNode): string[] {
  const rows: HtmlNode[] = [];
  const collect = (n: HtmlNode) => {
    for (const c of n.children) {
      if (c.tag === 'tr') rows.push(c);
      else if (['thead', 'tbody', 'tfoot'].includes(c.tag)) collect(c);
    }
  };
  collect(table);
  const grid = rows.map((r) => r.children.filter((c) => c.tag === 'td' || c.tag === 'th'));
  const cells = grid.flat();
  const captionNode = table.children.find((c) => c.tag === 'caption');
  const caption = captionNode ? stripEmphasis(tidy(renderInline(captionNode.children)).replace(/\n/g, ' ')) : '';
  // A captioned table is a numbered exhibit ("Table 1. …"): a box.
  const boxed = (blocks: string[]) => (caption ? [quote([`**${caption}**`, ...blocks])] : blocks);
  // A one-cell "table" is the CMS's way of drawing a box: unwrap it.
  if (cells.length === 1) return boxed(renderBlocks(cells[0].children));
  if (cells.length === 0) return caption ? [`**${caption}**`] : [];
  const text = grid.map((r) => r.map(cellText));
  const width = Math.max(...text.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const lines = [`| ${pad(text[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`];
  for (const r of text.slice(1)) lines.push(`| ${pad(r).join(' | ')} |`);
  return boxed([lines.join('\n')]);
}

function renderList(list: HtmlNode, depth: number): string {
  const ordered = list.tag === 'ol';
  const lines: string[] = [];
  let n = Number(list.attrs.start) || 1;
  for (const li of list.children) {
    if (li.tag !== 'li') {
      // Stray text between <li>s (whitespace) is ignored; stray elements kept.
      if (li.tag !== '#text') {
        for (const b of renderBlocks([li])) lines.push(indent(b, depth));
      }
      continue;
    }
    const marker = ordered ? `${n++}.` : '-';
    const inline: HtmlNode[] = [];
    const nested: string[] = [];
    for (const c of li.children) {
      if (c.tag === 'ul' || c.tag === 'ol') nested.push(renderList(c, depth + 1));
      else if (isBlock(c)) nested.push(...renderBlocks([c]).map((b) => indent(b, depth + 1)));
      else inline.push(c);
    }
    const head = tidy(renderInline(inline)).replace(/\n/g, ' ');
    if (head) lines.push(`${'  '.repeat(depth)}${marker} ${head}`);
    else if (nested.length) lines.push(`${'  '.repeat(depth)}${marker}`);
    lines.push(...nested);
  }
  return lines.filter((l) => l.trim()).join('\n');
}

function indent(s: string, depth: number): string {
  return s
    .split('\n')
    .map((l) => '  '.repeat(depth) + l)
    .join('\n');
}

/** Block content → Markdown blocks (to be joined with blank lines). */
export function renderBlocks(nodes: HtmlNode[]): string[] {
  const out: string[] = [];
  let inline: HtmlNode[] = [];
  const flush = () => {
    const t = tidy(renderInline(inline));
    if (t) out.push(t);
    inline = [];
  };
  for (const n of nodes) {
    if (!isBlock(n)) {
      inline.push(n);
      continue;
    }
    flush();
    const h = /^h([1-6])$/.exec(n.tag);
    if (h) {
      const t = stripEmphasis(tidy(renderInline(n.children)).replace(/\n/g, ' '));
      if (t) out.push(`${'#'.repeat(Math.max(2, Number(h[1])))} ${t}`);
    } else if (n.tag === 'ul' || n.tag === 'ol') {
      const l = renderList(n, 0);
      if (l) out.push(l);
    } else if (n.tag === 'table') {
      out.push(...renderTable(n));
    } else if (n.tag === 'blockquote') {
      const inner = renderBlocks(n.children);
      if (inner.length) out.push(quote(inner));
    } else if (n.tag === 'hr') {
      // presentational
    } else if (n.tag === 'caption') {
      // handled by renderTable
    } else if (n.tag === 'p' && !n.children.some(isBlock)) {
      const t = tidy(renderInline(n.children));
      const level = t ? styledHeadingLevel(n) : 0;
      if (level) out.push(`${'#'.repeat(level)} ${stripEmphasis(t.replace(/\n/g, ' '))}`);
      else if (t) out.push(t);
    } else {
      out.push(...renderBlocks(n.children));
    }
  }
  flush();
  return mergeBullets(out);
}

/**
 * Consecutive one-line bullets (the "•" lines older articles type as
 * separate `<div>`s) become one list instead of a run of one-item lists.
 */
function mergeBullets(blocks: string[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^- [^\n]*$/.test(b) && /^(?:- [^\n]*\n?)+$/.test(prev)) {
      out[out.length - 1] = `${prev}\n${b}`;
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Blocks → one blockquote. */
export function quote(blocks: string[]): string {
  return blocks
    .join('\n\n')
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');
}

/** HTML → Markdown blocks (to be joined with blank lines). */
export function htmlToBlocks(html: string): string[] {
  return renderBlocks(parseHtml(html).children);
}

/**
 * Plain words of an HTML fragment, by plain tag stripping — deliberately
 * NOT through the renderer above, so the coverage check compares the
 * converter against an independent reading of the same source.
 */
export function htmlWords(html: string): string[] {
  const attrs = `(?:[^>"']|"[^"]*"|'[^']*')*`;
  const blockTags = new RegExp(
    `<\\/?(?:p|div|br|li|ul|ol|table|caption|thead|tbody|tr|td|th|h[1-6]|blockquote|figure|figcaption|section|hr)\\b${attrs}>`,
    'gi',
  );
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(svg|script|style|noscript|iframe|video|audio|object|button|form|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(blockTags, ' ')
      .replace(new RegExp(`<\\/?[a-zA-Z]${attrs}>`, 'g'), ''),
  );
  return text.split(/\s+/).filter(isCountedWord);
}

/**
 * A token the coverage check counts: has a letter or digit, and is not a bare
 * list number ("3.") — the converter turns "<li>" into "3." and a typed "3."
 * into a list marker, so neither side may count them.
 */
function isCountedWord(w: string): boolean {
  return /[\p{L}\p{N}]/u.test(w) && !/^\d+\.$/.test(w);
}

/** Words of Markdown with the syntax removed (coverage check). */
export function markdownWords(md: string): string[] {
  return md
    .replace(/^#{1,6} /gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^\s*-{3,}\s*$/gm, ' ')
    .replace(/\*+/g, '')
    .split(/\s+/)
    .filter(isCountedWord);
}
