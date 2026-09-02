/**
 * Admin: email provider configuration.
 *
 *   GET                            → sender identity, provider, brand, health
 *   POST { op: 'update', … }       → change provider / sender / credentials
 *   POST { op: 'test', to, key }   → send a rendered template to one address
 *
 * Credentials go in encrypted (see _shared/secretbox) and never come back out:
 * the GET response carries only `hasResendKey` / `hasSmtpPass` booleans and a
 * masked hint. Omitting a credential field on update keeps the stored value;
 * sending an empty string clears it.
 */
import { sampleVars } from '../../src/shared/email/defaults';
import { DEFAULT_BRAND } from '../../src/shared/email/types';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import {
  configurationProblem,
  loadEmailSettings,
  providerAdvisory,
  sendTemplateEmail,
  supabaseDeliveryBlock,
} from './_shared/mailer';
import { encryptSecret, hasDedicatedSecretKey, maskSecret } from './_shared/secretbox';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'email.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const s = await loadEmailSettings(ctx.sb);
    const { data: row } = await ctx.sb
      .from('email_settings')
      .select('resend_api_key_cipher, smtp_pass_cipher, updated_at')
      .eq('id', 'global')
      .maybeSingle();

    return jsonResponse({
      provider: s.provider,
      fromEmail: s.fromEmail,
      fromName: s.fromName,
      replyTo: s.replyTo,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpUser: s.smtpUser,
      smtpSecure: s.smtpSecure,
      appBaseUrl: s.appBaseUrl,
      brand: { ...DEFAULT_BRAND, ...s.brand },
      hasResendKey: Boolean(s.resendApiKey),
      hasSmtpPass: Boolean(s.smtpPass),
      resendKeyHint: maskSecret(s.resendApiKey),
      origin: s.origin,
      problem: configurationProblem(s),
      // Not a misconfiguration — the built-in mailer works, within limits an
      // admin needs stated up front rather than discovered from a delivery log.
      advisory: providerAdvisory(s),
      // Warns the admin that credentials are keyed off the service-role key
      // rather than a dedicated one — works, but rotating either breaks both.
      dedicatedSecretKey: hasDedicatedSecretKey(),
      updatedAt: row?.updated_at ?? null,
      canEdit: can(ctx, 'email.settings.write'),
      canSend: can(ctx, 'email.send'),
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  const op = String(body.op ?? 'update');

  // ── test send ─────────────────────────────────────────────
  if (op === 'test') {
    if (!can(ctx, 'email.send')) return errorResponse(403, 'Missing permission: email.send');
    const to = String(body.to ?? '').trim();
    if (!EMAIL_RE.test(to)) return errorResponse(400, 'Valid recipient required');
    const templateKey = String(body.templateKey ?? 'password_reset');
    const result = await sendTemplateEmail({
      sb: ctx.sb,
      templateKey,
      to,
      vars: { ...sampleVars(templateKey), ...(asStringMap(body.vars) ?? {}) },
      meta: { test: true, actor: ctx.user.id },
    });
    return jsonResponse(result, { status: result.ok ? 200 : 502 });
  }

  if (op !== 'update') return errorResponse(400, `Unknown op: ${op}`);
  if (!can(ctx, 'email.settings.write')) {
    return errorResponse(403, 'Missing permission: email.settings.write');
  }

  const patch: Record<string, unknown> = {
    id: 'global',
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.provider !== undefined) {
    const p = String(body.provider);
    if (p !== 'resend' && p !== 'smtp' && p !== 'supabase') {
      return errorResponse(400, 'provider must be resend, smtp, or supabase');
    }
    patch.provider = p;
  }
  if (body.fromEmail !== undefined) {
    const v = String(body.fromEmail).trim();
    if (v && !EMAIL_RE.test(v)) return errorResponse(400, 'From address is not a valid email');
    patch.from_email = v;
  }
  if (body.fromName !== undefined) patch.from_name = String(body.fromName).trim();
  if (body.replyTo !== undefined) {
    const v = String(body.replyTo).trim();
    if (v && !EMAIL_RE.test(v)) return errorResponse(400, 'Reply-to is not a valid email');
    patch.reply_to = v || null;
  }
  if (body.smtpHost !== undefined) patch.smtp_host = String(body.smtpHost).trim() || null;
  if (body.smtpPort !== undefined) patch.smtp_port = Number(body.smtpPort) || 587;
  if (body.smtpUser !== undefined) patch.smtp_user = String(body.smtpUser).trim() || null;
  if (body.smtpSecure !== undefined) patch.smtp_secure = body.smtpSecure === true;
  if (body.appBaseUrl !== undefined) {
    const v = String(body.appBaseUrl).trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\//i.test(v)) return errorResponse(400, 'Base URL must start with http:// or https://');
    patch.app_base_url = v || null;
  }
  if (body.brand !== undefined && body.brand && typeof body.brand === 'object') {
    patch.brand = sanitizeBrand(body.brand as Record<string, unknown>);
  }

  // Credentials: undefined = leave alone, '' = clear, value = re-encrypt.
  if (body.resendApiKey !== undefined) {
    const v = String(body.resendApiKey).trim();
    patch.resend_api_key_cipher = v ? encryptSecret(v) : null;
  }
  if (body.smtpPass !== undefined) {
    const v = String(body.smtpPass);
    patch.smtp_pass_cipher = v ? encryptSecret(v) : null;
  }

  const { error } = await ctx.sb.from('email_settings').upsert(patch, { onConflict: 'id' });
  if (error) return errorResponse(500, error.message);

  await writeAuditLog(ctx, {
    entity_type: 'email_settings',
    entity_id: 'global',
    action: 'update',
    // Never audit the ciphertext — record only that a credential changed.
    after: redactCredentials(patch),
  });

  const s = await loadEmailSettings(ctx.sb);
  return jsonResponse({ ok: true, problem: configurationProblem(s) });
};

function redactCredentials(patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...patch };
  if ('resend_api_key_cipher' in out) out.resend_api_key_cipher = out.resend_api_key_cipher ? '«set»' : null;
  if ('smtp_pass_cipher' in out) out.smtp_pass_cipher = out.smtp_pass_cipher ? '«set»' : null;
  return out;
}

function sanitizeBrand(raw: Record<string, unknown>): Record<string, string> {
  const allowed = ['productName', 'logoText', 'accent', 'accentDeep', 'siteUrl', 'supportEmail', 'footerNote'];
  const out: Record<string, string> = {};
  for (const k of allowed) {
    if (typeof raw[k] === 'string') out[k] = (raw[k] as string).slice(0, 400);
  }
  // Colours land in inline styles; keep them to hex so nothing can break out.
  for (const k of ['accent', 'accentDeep']) {
    if (out[k] && !/^#[0-9a-f]{3,8}$/i.test(out[k])) delete out[k];
  }
  return out;
}

function asStringMap(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
