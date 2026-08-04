/**
 * Public: branded account-lifecycle email.
 *
 *   POST { op: 'request', email, scope }  → email a reset link
 *   POST { op: 'confirm' }  + Bearer JWT  → "your password was changed" notice
 *   POST { op: 'welcome' }  + Bearer JWT  → welcome mail after sign-up
 *
 * Supabase can send its own recovery mail, but then the message looks nothing
 * like the product and can't be edited by an admin. Instead we mint the same
 * action link server-side with `generateLink` and deliver it through the
 * configured provider using the editable `password_reset` template.
 *
 * Enumeration: the response is identical whether or not the address exists.
 * Throttling: at most RATE_LIMIT sends per address per window, counted from
 * email_log so it survives cold starts.
 */
import { errorResponse, getServiceClient, jsonResponse, requireUser } from './_shared/admin';
import { loadEmailSettings, sendTemplateEmail } from './_shared/mailer';

const RATE_LIMIT = 3;
const WINDOW_MINUTES = 15;
const LINK_TTL = '1 hour';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const op = String(body.op ?? 'request');

  if (op === 'confirm') return confirmPasswordChange(req);
  if (op === 'welcome') return sendWelcome(req);
  if (op !== 'request') return errorResponse(400, `Unknown op: ${op}`);

  const email = String(body.email ?? '').trim().toLowerCase();
  const scope = body.scope === 'admin' ? 'admin' : 'app';
  // Same body for every outcome — callers can't distinguish "sent" from
  // "no such account" from "throttled".
  const ok = () => jsonResponse({ ok: true });
  if (!EMAIL_RE.test(email)) return ok();

  const sb = getServiceClient();

  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await sb
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('template_key', 'password_reset')
      .eq('to_email', email)
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_LIMIT) return ok();
  } catch {
    // Log table unavailable — proceed rather than block recovery entirely.
  }

  const settings = await loadEmailSettings(sb);
  const base = settings.appBaseUrl || safeOrigin(req);
  const redirectTo = scope === 'admin' ? `${base}/admin/reset` : `${base}/reset-password`;

  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  // No account for this address (or Supabase declined) — stay silent.
  if (error || !data?.properties?.action_link) return ok();

  await sendTemplateEmail({
    sb,
    templateKey: 'password_reset',
    to: email,
    settings,
    meta: { scope },
    vars: {
      name: displayNameFor(data.user?.user_metadata, email),
      resetUrl: data.properties.action_link,
      expiresIn: LINK_TTL,
    },
  });

  return ok();
};

/** Signed-in caller telling us their password just changed — send the notice. */
async function confirmPasswordChange(req: Request): Promise<Response> {
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const email = ctx.user.email;
  if (!email) return jsonResponse({ ok: true });

  const { data: profile } = await ctx.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  await sendTemplateEmail({
    sb: ctx.sb,
    templateKey: 'password_changed',
    to: email,
    meta: { user_id: ctx.user.id },
    vars: {
      name: profile?.display_name || email.split('@')[0],
      changedAt: new Date().toUTCString(),
    },
  });
  return jsonResponse({ ok: true });
}

/**
 * Welcome mail, sent by the app right after a successful sign-up. Requires the
 * new user's own JWT, so it can't be used to mail arbitrary addresses, and it
 * only ever sends to the caller's own address.
 */
async function sendWelcome(req: Request): Promise<Response> {
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  const email = ctx.user.email;
  if (!email) return jsonResponse({ ok: true });

  const settings = await loadEmailSettings(ctx.sb);
  const { data: profile } = await ctx.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  await sendTemplateEmail({
    sb: ctx.sb,
    templateKey: 'welcome',
    to: email,
    settings,
    meta: { user_id: ctx.user.id },
    vars: {
      name: profile?.display_name || displayNameFor(ctx.user.user_metadata, email),
      appUrl: settings.appBaseUrl || safeOrigin(req),
    },
  });
  return jsonResponse({ ok: true });
}

function displayNameFor(meta: unknown, email: string): string {
  const name = (meta as { display_name?: string } | null)?.display_name;
  return name || email.split('@')[0];
}

function safeOrigin(req: Request): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}
