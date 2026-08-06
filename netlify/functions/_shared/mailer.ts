/**
 * Transactional email delivery.
 *
 * Two transports, one interface:
 *   • resend — HTTPS API, nothing to install, best default
 *   • smtp   — any provider (or an in-house relay) via nodemailer
 *
 * Configuration is read from `email_settings` (admin-editable, credentials
 * encrypted at rest) and falls back to environment variables so a fresh deploy
 * can send before anyone opens the portal. Every attempt is written to
 * `email_log`, because "did that invite actually go out?" should be answerable
 * without leaving the admin portal.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmail } from '../../../src/shared/email/render';
import { DEFAULT_BRAND, type EmailBrand, type EmailTemplate } from '../../../src/shared/email/types';
import { DEFAULT_TEMPLATES } from '../../../src/shared/email/defaults';
import { decryptSecret } from './secretbox';

export interface EmailSettings {
  provider: 'resend' | 'smtp';
  fromEmail: string;
  fromName: string;
  replyTo: string;
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  appBaseUrl: string;
  brand: EmailBrand;
}

export interface SettingsSource extends EmailSettings {
  /** Where each half of the config came from — surfaced in the admin UI. */
  origin: { credentials: 'database' | 'env' | 'none'; sender: 'database' | 'env' | 'none' };
}

const envStr = (...names: string[]): string => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
};

/** Read the singleton settings row, layered over env-var defaults. */
export async function loadEmailSettings(sb: SupabaseClient): Promise<SettingsSource> {
  let row: Record<string, unknown> | null = null;
  try {
    const { data } = await sb.from('email_settings').select('*').eq('id', 'global').maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  } catch {
    row = null;
  }

  const str = (k: string): string => (typeof row?.[k] === 'string' ? (row[k] as string) : '');
  const dbResendKey = decryptSecret(str('resend_api_key_cipher'));
  const dbSmtpPass = decryptSecret(str('smtp_pass_cipher'));

  const envResend = envStr('RESEND_API_KEY');
  const envSmtpHost = envStr('SMTP_HOST');

  const provider = ((): 'resend' | 'smtp' => {
    const p = str('provider');
    if (p === 'resend' || p === 'smtp') return p;
    return envSmtpHost && !envResend ? 'smtp' : 'resend';
  })();

  const resendApiKey = dbResendKey || envResend;
  const smtpHost = str('smtp_host') || envSmtpHost;
  const smtpPass = dbSmtpPass || envStr('SMTP_PASSWORD', 'SMTP_PASS');
  const fromEmail = str('from_email') || envStr('EMAIL_FROM_ADDRESS', 'SMTP_FROM');

  const hasCreds = provider === 'resend' ? Boolean(resendApiKey) : Boolean(smtpHost);
  const brandRow = (row?.brand ?? {}) as Partial<EmailBrand>;

  const appBaseUrl = (str('app_base_url') || envStr('APP_BASE_URL', 'URL', 'DEPLOY_PRIME_URL')).replace(
    /\/+$/,
    '',
  );

  return {
    provider,
    fromEmail,
    fromName: str('from_name') || envStr('EMAIL_FROM_NAME') || DEFAULT_BRAND.productName,
    replyTo: str('reply_to') || envStr('EMAIL_REPLY_TO'),
    resendApiKey,
    smtpHost,
    smtpPort: Number(row?.smtp_port ?? 0) || Number(envStr('SMTP_PORT')) || 587,
    smtpUser: str('smtp_user') || envStr('SMTP_USER', 'SMTP_USERNAME'),
    smtpPass,
    smtpSecure: row?.smtp_secure === true || envStr('SMTP_SECURE') === 'true',
    appBaseUrl,
    brand: {
      ...DEFAULT_BRAND,
      siteUrl: appBaseUrl,
      supportEmail: str('reply_to') || envStr('EMAIL_REPLY_TO') || DEFAULT_BRAND.supportEmail,
      ...brandRow,
    },
    origin: {
      credentials: (provider === 'resend' ? dbResendKey : dbSmtpPass || str('smtp_host'))
        ? 'database'
        : hasCreds
          ? 'env'
          : 'none',
      sender: str('from_email') ? 'database' : fromEmail ? 'env' : 'none',
    },
  };
}

export function isConfigured(s: EmailSettings): boolean {
  if (!s.fromEmail) return false;
  return s.provider === 'resend' ? Boolean(s.resendApiKey) : Boolean(s.smtpHost);
}

/** Why sending would fail right now, in words an admin can act on. */
export function configurationProblem(s: EmailSettings): string | null {
  if (!s.fromEmail) return 'No sender address is set. Add a verified “from” address in Email → Settings.';
  if (s.provider === 'resend' && !s.resendApiKey) return 'No Resend API key is set.';
  if (s.provider === 'smtp' && !s.smtpHost) return 'No SMTP host is set.';
  return null;
}

// ── Template resolution ────────────────────────────────────────────────

/** DB template if present and enabled, otherwise the shipped default. */
export async function resolveTemplate(
  sb: SupabaseClient,
  key: string,
): Promise<{ template: EmailTemplate; enabled: boolean } | null> {
  const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key);
  let row: Record<string, unknown> | null = null;
  try {
    const { data } = await sb.from('email_templates').select('*').eq('key', key).maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  } catch {
    row = null;
  }
  if (!row && !fallback) return null;
  if (!row) return { template: fallback as EmailTemplate, enabled: fallback?.enabled !== false };

  return {
    enabled: row.enabled !== false,
    template: {
      key,
      name: String(row.name ?? fallback?.name ?? key),
      description: String(row.description ?? fallback?.description ?? ''),
      subject: String(row.subject ?? fallback?.subject ?? ''),
      preheader: String(row.preheader ?? fallback?.preheader ?? ''),
      blocks: Array.isArray(row.blocks) ? (row.blocks as EmailTemplate['blocks']) : (fallback?.blocks ?? []),
      htmlOverride: (row.html_override as string | null) ?? null,
    },
  };
}

// ── Sending ────────────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  subject?: string;
}

interface SendArgs {
  sb: SupabaseClient;
  templateKey: string;
  to: string;
  vars?: Record<string, string>;
  /** Extra context stored on the log row (invite id, actor, …). */
  meta?: Record<string, unknown>;
  settings?: SettingsSource;
}

/**
 * Render a template and deliver it. Never throws: transactional email is a
 * side effect of an action that has already succeeded (the invite row exists,
 * the account is disabled), so a delivery failure is reported and logged, not
 * propagated into a 500 that would make the caller retry the whole operation.
 */
export async function sendTemplateEmail(args: SendArgs): Promise<SendResult> {
  const { sb, templateKey, to } = args;
  const settings = args.settings ?? (await loadEmailSettings(sb));

  const resolved = await resolveTemplate(sb, templateKey);
  if (!resolved) return logAndReturn(sb, templateKey, to, '', settings.provider, 'failed', 'Unknown template', args.meta);
  if (!resolved.enabled) {
    return logAndReturn(sb, templateKey, to, '', settings.provider, 'skipped', 'Template disabled', args.meta);
  }

  const problem = configurationProblem(settings);
  const rendered = renderEmail({
    template: resolved.template,
    vars: args.vars,
    brand: settings.brand,
  });
  if (problem) {
    return logAndReturn(sb, templateKey, to, rendered.subject, settings.provider, 'skipped', problem, args.meta);
  }

  try {
    if (settings.provider === 'resend') {
      await sendViaResend(settings, to, rendered.subject, rendered.html, rendered.text);
    } else {
      await sendViaSmtp(settings, to, rendered.subject, rendered.html, rendered.text);
    }
    return logAndReturn(sb, templateKey, to, rendered.subject, settings.provider, 'sent', null, args.meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    console.error('[email] send failed', templateKey, message);
    return logAndReturn(sb, templateKey, to, rendered.subject, settings.provider, 'failed', message, args.meta);
  }
}

function fromHeader(s: EmailSettings): string {
  return s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail;
}

async function sendViaResend(
  s: EmailSettings,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${s.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: fromHeader(s),
      to: [to],
      subject,
      html,
      text,
      ...(s.replyTo ? { reply_to: s.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; name?: string };
    throw new Error(body.message ?? `Resend rejected the message (${res.status})`);
  }
}

async function sendViaSmtp(
  s: EmailSettings,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  // Imported lazily so the resend path never pays for it.
  const { createTransport } = await import('nodemailer');
  const transport = createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure || s.smtpPort === 465,
    ...(s.smtpUser ? { auth: { user: s.smtpUser, pass: s.smtpPass } } : {}),
  });
  await transport.sendMail({
    from: fromHeader(s),
    to,
    subject,
    html,
    text,
    ...(s.replyTo ? { replyTo: s.replyTo } : {}),
  });
}

async function logAndReturn(
  sb: SupabaseClient,
  templateKey: string,
  to: string,
  subject: string,
  provider: string,
  status: 'sent' | 'failed' | 'skipped',
  error: string | null,
  meta?: Record<string, unknown>,
): Promise<SendResult> {
  try {
    await sb.from('email_log').insert({
      template_key: templateKey,
      to_email: to,
      subject,
      provider,
      status,
      error,
      meta: meta ?? {},
    });
  } catch (err) {
    console.error('[email] log insert failed', err);
  }
  return { ok: status === 'sent', status, error: error ?? undefined, subject };
}
