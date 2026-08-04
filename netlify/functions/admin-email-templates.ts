/**
 * Admin: transactional email templates.
 *
 *   GET                          → every template (DB copy layered over the
 *                                  shipped default) + variable declarations
 *   POST { op: 'save', … }       → persist an edited template
 *   POST { op: 'reset', key }    → restore the shipped default
 *   POST { op: 'test', key, to } → send this template to one address
 *
 * The editor renders previews client-side with the same `renderEmail` the
 * sender uses, so the preview pane is the message, not an approximation.
 */
import { DEFAULT_TEMPLATES, getDefaultTemplate, sampleVars } from '../../src/shared/email/defaults';
import type { EmailBlock } from '../../src/shared/email/types';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import { loadEmailSettings, sendTemplateEmail } from './_shared/mailer';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'button', 'callout', 'list', 'meta', 'code', 'divider']);
const MAX_BLOCKS = 40;

interface TemplateRow {
  key: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  html_override: string | null;
  enabled: boolean;
  updated_at: string | null;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'email.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data } = await ctx.sb.from('email_templates').select('*');
    const rows = new Map<string, TemplateRow>(
      ((data ?? []) as TemplateRow[]).map((r) => [r.key, r]),
    );
    const settings = await loadEmailSettings(ctx.sb);

    const templates = DEFAULT_TEMPLATES.map((def) => {
      const row = rows.get(def.key);
      return {
        key: def.key,
        name: row?.name ?? def.name,
        group: def.group,
        description: def.description,
        trigger: def.trigger,
        variables: def.variables,
        subject: row?.subject ?? def.subject,
        preheader: row?.preheader ?? def.preheader,
        blocks: row?.blocks ?? def.blocks,
        htmlOverride: row?.html_override ?? null,
        enabled: row?.enabled ?? true,
        customized: Boolean(row),
        updatedAt: row?.updated_at ?? null,
      };
    });

    // Templates added straight into the DB (not in code) still show up.
    for (const [key, row] of rows) {
      if (templates.some((t) => t.key === key)) continue;
      templates.push({
        key,
        name: row.name,
        group: 'Account',
        description: row.description ?? '',
        trigger: 'Custom template',
        variables: [],
        subject: row.subject,
        preheader: row.preheader,
        blocks: row.blocks ?? [],
        htmlOverride: row.html_override,
        enabled: row.enabled,
        customized: true,
        updatedAt: row.updated_at,
      });
    }

    return jsonResponse({
      templates,
      brand: settings.brand,
      canEdit: can(ctx, 'email.templates.write'),
      canSend: can(ctx, 'email.send'),
      problem: settings.fromEmail ? null : 'No sender address configured yet.',
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  const op = String(body.op ?? '');
  const key = String(body.key ?? '');
  if (!key) return errorResponse(400, 'key required');

  // ── test send ─────────────────────────────────────────────
  if (op === 'test') {
    if (!can(ctx, 'email.send')) return errorResponse(403, 'Missing permission: email.send');
    const to = String(body.to ?? '').trim();
    if (!EMAIL_RE.test(to)) return errorResponse(400, 'Valid recipient required');
    const result = await sendTemplateEmail({
      sb: ctx.sb,
      templateKey: key,
      to,
      vars: sampleVars(key),
      meta: { test: true, actor: ctx.user.id },
    });
    return jsonResponse(result, { status: result.ok ? 200 : 502 });
  }

  if (!can(ctx, 'email.templates.write')) {
    return errorResponse(403, 'Missing permission: email.templates.write');
  }

  // ── reset ─────────────────────────────────────────────────
  if (op === 'reset') {
    const def = getDefaultTemplate(key);
    if (!def) return errorResponse(400, 'No shipped default for that template');
    const { data: before } = await ctx.sb.from('email_templates').select('*').eq('key', key).maybeSingle();
    const { error } = await ctx.sb.from('email_templates').delete().eq('key', key);
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, {
      entity_type: 'email_template',
      entity_id: key,
      action: 'revert',
      before,
      note: 'Reset to shipped default',
    });
    return jsonResponse({ ok: true, template: { ...def, htmlOverride: null, customized: false } });
  }

  if (op !== 'save') return errorResponse(400, `Unknown op: ${op}`);

  const subject = String(body.subject ?? '').trim();
  if (!subject) return errorResponse(400, 'Subject is required');
  if (subject.length > 300) return errorResponse(400, 'Subject is too long');

  const blocks = sanitizeBlocks(body.blocks);
  const htmlOverride =
    typeof body.htmlOverride === 'string' && body.htmlOverride.trim() ? body.htmlOverride : null;
  if (!blocks.length && !htmlOverride) {
    return errorResponse(400, 'A template needs at least one block (or raw HTML).');
  }

  const def = getDefaultTemplate(key);
  const { data: before } = await ctx.sb.from('email_templates').select('*').eq('key', key).maybeSingle();

  const { error } = await ctx.sb.from('email_templates').upsert(
    {
      key,
      name: String(body.name ?? def?.name ?? key).slice(0, 120),
      description: String(body.description ?? def?.description ?? '').slice(0, 500),
      subject,
      preheader: String(body.preheader ?? '').slice(0, 300),
      blocks,
      html_override: htmlOverride,
      enabled: body.enabled === undefined ? true : body.enabled === true,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) return errorResponse(500, error.message);

  await writeAuditLog(ctx, {
    entity_type: 'email_template',
    entity_id: key,
    action: before ? 'update' : 'create',
    before,
    after: { subject, blocks: blocks.length, enabled: body.enabled !== false, raw: Boolean(htmlOverride) },
  });
  return jsonResponse({ ok: true });
};

/**
 * Accept only the block shapes the renderer knows. Anything else is dropped
 * rather than stored — an unknown block would render as nothing in the inbox
 * while still looking fine in the editor.
 */
function sanitizeBlocks(raw: unknown): EmailBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: EmailBlock[] = [];
  for (const item of raw.slice(0, MAX_BLOCKS)) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const type = String(b.type ?? '');
    if (!BLOCK_TYPES.has(type)) continue;
    const text = typeof b.text === 'string' ? b.text.slice(0, 4000) : '';
    switch (type) {
      case 'heading':
      case 'paragraph':
      case 'code':
        if (text) out.push({ type, text } as EmailBlock);
        break;
      case 'callout': {
        const tone = ['neutral', 'info', 'success', 'warn'].includes(String(b.tone))
          ? (b.tone as 'neutral' | 'info' | 'success' | 'warn')
          : 'neutral';
        if (text) out.push({ type: 'callout', text, tone });
        break;
      }
      case 'button': {
        const label = typeof b.label === 'string' ? b.label.slice(0, 120) : '';
        const href = typeof b.href === 'string' ? b.href.slice(0, 2000) : '';
        if (label && href) out.push({ type: 'button', label, href });
        break;
      }
      case 'list': {
        const items = Array.isArray(b.items)
          ? b.items.filter((i): i is string => typeof i === 'string' && Boolean(i.trim())).slice(0, 20)
          : [];
        if (items.length) out.push({ type: 'list', items });
        break;
      }
      case 'meta': {
        const items = Array.isArray(b.items)
          ? (b.items as Array<Record<string, unknown>>)
              .filter((i) => i && typeof i.label === 'string' && typeof i.value === 'string')
              .slice(0, 12)
              .map((i) => ({ label: String(i.label).slice(0, 80), value: String(i.value).slice(0, 300) }))
          : [];
        if (items.length) out.push({ type: 'meta', items });
        break;
      }
      case 'divider':
        out.push({ type: 'divider' });
        break;
      default:
        break;
    }
  }
  return out;
}
