/**
 * Branded transactional-email renderer.
 *
 * Turns a template's content blocks into email HTML that survives real mail
 * clients: table layout, inline styles, no external assets, ≤600px, with a
 * `prefers-color-scheme` block for the clients that honour it. The same
 * function powers the admin editor's live preview, so what you see there is
 * byte-for-byte what lands in the inbox.
 *
 * Pure and dependency-free — imported by both the browser and the functions.
 */
import {
  DEFAULT_BRAND,
  type EmailBlock,
  type EmailBrand,
  type EmailTemplate,
  type RenderedEmail,
} from './types';

// ── Variable interpolation ─────────────────────────────────────────────

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function interpolate(input: string, vars: Record<string, string>): string {
  return input.replace(TOKEN_RE, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : whole,
  );
}

/** Variable names a template actually references, in first-appearance order. */
export function templateVariables(template: EmailTemplate): string[] {
  const seen = new Set<string>();
  const scan = (s: string | undefined) => {
    if (!s) return;
    for (const m of s.matchAll(TOKEN_RE)) seen.add(m[1]);
  };
  scan(template.subject);
  scan(template.preheader);
  scan(template.htmlOverride ?? '');
  for (const b of template.blocks) {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
      case 'callout':
      case 'code':
        scan(b.text);
        break;
      case 'button':
        scan(b.label);
        scan(b.href);
        break;
      case 'list':
        b.items.forEach(scan);
        break;
      case 'meta':
        b.items.forEach((i) => {
          scan(i.label);
          scan(i.value);
        });
        break;
      default:
        break;
    }
  }
  return [...seen];
}

// ── Escaping ───────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only http(s) and mailto links are emitted. An interpolated variable ends up
 * inside an `href`, so a `javascript:` or `data:` value must not survive —
 * anything else collapses to '#'.
 */
export function safeHref(value: string): string {
  const trimmed = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
  return '#';
}

/** Minimal inline markup so copy can carry emphasis without raw HTML. */
function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br />');
}

// ── Block rendering ────────────────────────────────────────────────────

const TONE: Record<string, { bg: string; border: string; ink: string }> = {
  neutral: { bg: '#f6f1ef', border: '#e7ddd9', ink: '#5c3f3f' },
  info: { bg: '#d4ebff', border: '#a9d3f7', ink: '#0b4f80' },
  success: { bg: '#d3f7d3', border: '#a5e5aa', ink: '#12621f' },
  warn: { bg: '#ffe7bc', border: '#f2cf8c', ink: '#7a4700' },
};

function renderBlock(block: EmailBlock, brand: EmailBrand): string {
  switch (block.type) {
    case 'heading':
      return `<tr><td style="padding:0 0 12px;">
        <h1 class="pbt-ink" style="margin:0;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#20090a;">${inlineFormat(block.text)}</h1>
      </td></tr>`;

    case 'paragraph':
      return `<tr><td style="padding:0 0 14px;">
        <p class="pbt-body" style="margin:0;font-size:15px;line-height:1.62;color:#5c3f3f;">${inlineFormat(block.text)}</p>
      </td></tr>`;

    case 'button':
      return `<tr><td style="padding:8px 0 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td
          style="border-radius:12px;background:${escapeHtml(brand.accent)};background-image:linear-gradient(180deg, ${escapeHtml(brand.accent)}, ${escapeHtml(brand.accentDeep)});">
          <a href="${safeHref(block.href)}"
             style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(block.label)}</a>
        </td></tr></table>
      </td></tr>`;

    case 'callout': {
      const tone = TONE[block.tone ?? 'neutral'] ?? TONE.neutral;
      return `<tr><td style="padding:2px 0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border-radius:12px;background:${tone.bg};border:1px solid ${tone.border};">
          <tr><td style="padding:13px 16px;font-size:14px;line-height:1.55;color:${tone.ink};">${inlineFormat(block.text)}</td></tr>
        </table>
      </td></tr>`;
    }

    case 'list':
      return `<tr><td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${block.items
            .map(
              (item) => `<tr>
            <td width="18" valign="top" style="padding:0 0 8px;font-size:15px;line-height:1.6;color:${escapeHtml(brand.accent)};">&bull;</td>
            <td class="pbt-body" valign="top" style="padding:0 0 8px;font-size:15px;line-height:1.6;color:#5c3f3f;">${inlineFormat(item)}</td>
          </tr>`,
            )
            .join('')}
        </table>
      </td></tr>`;

    case 'meta':
      return `<tr><td style="padding:2px 0 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          class="pbt-panel" style="border-radius:14px;background:#faf6f4;border:1px solid #eee3de;">
          ${block.items
            .map(
              (item, i) => `<tr>
            <td style="padding:${i === 0 ? '14px' : '10px'} 16px 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#886968;width:38%;">${escapeHtml(item.label)}</td>
            <td class="pbt-ink" style="padding:${i === 0 ? '14px' : '10px'} 16px 10px;font-size:14px;font-weight:600;color:#20090a;">${escapeHtml(item.value)}</td>
          </tr>`,
            )
            .join('')}
        </table>
      </td></tr>`;

    case 'code':
      return `<tr><td style="padding:0 0 18px;">
        <div class="pbt-panel" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;letter-spacing:0.06em;padding:14px 16px;border-radius:12px;background:#faf6f4;border:1px solid #eee3de;color:#20090a;word-break:break-all;">${escapeHtml(block.text)}</div>
      </td></tr>`;

    case 'divider':
      return `<tr><td style="padding:6px 0 20px;"><div class="pbt-rule" style="height:1px;background:#eee3de;line-height:1px;">&nbsp;</div></td></tr>`;

    default:
      return '';
  }
}

// ── Plain-text fallback ────────────────────────────────────────────────

function blockToText(block: EmailBlock): string {
  const strip = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/_([^_]+)_/g, '$1');
  switch (block.type) {
    case 'heading':
      return `${strip(block.text)}\n${'─'.repeat(Math.min(48, strip(block.text).length))}`;
    case 'paragraph':
    case 'callout':
      return strip(block.text);
    case 'button':
      return `${strip(block.label)}: ${block.href}`;
    case 'list':
      return block.items.map((i) => `  • ${strip(i)}`).join('\n');
    case 'meta':
      return block.items.map((i) => `  ${i.label}: ${i.value}`).join('\n');
    case 'code':
      return `  ${block.text}`;
    case 'divider':
      return '─────';
    default:
      return '';
  }
}

// ── Shell ──────────────────────────────────────────────────────────────

function shell(brand: EmailBrand, preheader: string, body: string): string {
  const year = '{{__year__}}'; // replaced by the caller-provided vars pass
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(brand.productName)}</title>
<style>
  /* Clients that honour prefers-color-scheme get a proper dark treatment;
     everyone else keeps the light design, which is already the default. */
  @media (prefers-color-scheme: dark) {
    .pbt-bg      { background:#140506 !important; }
    .pbt-card    { background:#1d0b0c !important; border-color:#38201f !important; }
    .pbt-ink     { color:#fbf4f2 !important; }
    .pbt-body    { color:#d3bebc !important; }
    .pbt-muted   { color:#a48d8b !important; }
    .pbt-panel   { background:#251111 !important; border-color:#3d2323 !important; }
    .pbt-rule    { background:#3d2323 !important; }
  }
  @media only screen and (max-width:620px) {
    .pbt-card-pad { padding:26px 22px !important; }
    .pbt-outer    { padding:16px 12px !important; }
  }
</style>
</head>
<body class="pbt-bg" style="margin:0;padding:0;background:#f6f1ef;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pbt-bg" style="background:#f6f1ef;">
  <tr><td align="center" class="pbt-outer" style="padding:32px 16px;">
    <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <!--
      width:100% + max-width:600px, NOT width:600px. A table sized in pixels
      never shrinks below that width — max-width resolves against a containing
      block the table itself just sized — so a fixed width here overflows every
      phone. Outlook ignores max-width entirely, hence the ghost table above.
    -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

      <!-- header -->
      <tr><td style="padding:0 4px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="34" style="padding-right:10px;">
            <div style="width:34px;height:34px;border-radius:11px;background:${escapeHtml(brand.accent)};background-image:linear-gradient(135deg, ${escapeHtml(brand.accent)}, ${escapeHtml(brand.accentDeep)});color:#ffffff;font-size:15px;font-weight:800;line-height:34px;text-align:center;">${escapeHtml(brand.logoText)}</div>
          </td>
          <td class="pbt-ink" style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:#20090a;">${escapeHtml(brand.productName)}</td>
        </tr></table>
      </td></tr>

      <!-- card -->
      <tr><td class="pbt-card" style="background:#ffffff;border:1px solid #efe4e0;border-radius:22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td class="pbt-card-pad" style="padding:32px 34px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${body}
            </table>
          </td></tr>
        </table>
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:20px 8px 0;">
        <p class="pbt-muted" style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#886968;">${escapeHtml(brand.footerNote)}</p>
        <p class="pbt-muted" style="margin:0;font-size:12px;line-height:1.6;color:#886968;">
          ${brand.supportEmail ? `Questions? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:#886968;">${escapeHtml(brand.supportEmail)}</a> &nbsp;·&nbsp; ` : ''}&copy; ${year} ${escapeHtml(brand.productName)}
        </p>
      </td></tr>

    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface RenderOptions {
  template: EmailTemplate;
  vars?: Record<string, string>;
  brand?: Partial<EmailBrand>;
}

export function renderEmail({ template, vars = {}, brand }: RenderOptions): RenderedEmail {
  const b: EmailBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) };
  const values: Record<string, string> = {
    productName: b.productName,
    siteUrl: b.siteUrl,
    supportEmail: b.supportEmail,
    ...vars,
    __year__: String(new Date().getFullYear()),
  };

  const fill = (s: string) => interpolate(s, values);
  const subject = fill(template.subject);
  const preheader = fill(template.preheader);

  if (template.htmlOverride && template.htmlOverride.trim()) {
    const html = fill(template.htmlOverride);
    return { subject, html, text: fill(htmlToText(template.htmlOverride)) };
  }

  const filled: EmailBlock[] = template.blocks.map((block) => fillBlock(block, fill));

  const body = filled.map((block) => renderBlock(block, b)).join('\n');
  const html = interpolate(shell(b, preheader, body), values);

  const text = [
    ...filled.map(blockToText).filter(Boolean),
    '',
    b.footerNote,
    b.supportEmail ? `Questions? ${b.supportEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html, text };
}

function fillBlock(block: EmailBlock, fill: (s: string) => string): EmailBlock {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'code':
      return { ...block, text: fill(block.text) };
    case 'callout':
      return { ...block, text: fill(block.text) };
    case 'button':
      return { ...block, label: fill(block.label), href: fill(block.href) };
    case 'list':
      return { ...block, items: block.items.map(fill) };
    case 'meta':
      return {
        ...block,
        items: block.items.map((i) => ({ label: fill(i.label), value: fill(i.value) })),
      };
    default:
      return block;
  }
}

/** Rough text fallback for raw-HTML overrides — good enough for multipart. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
