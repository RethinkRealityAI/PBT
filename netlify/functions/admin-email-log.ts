/**
 * Admin: transactional email delivery log.
 * Answers "did that invite actually go out?" without leaving the portal.
 */
import { errorResponse, jsonResponse, readRange, requireAdmin } from './_shared/admin';

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'email.read');
  if (ctx instanceof Response) return ctx;

  const { since, limit } = readRange(req);
  const { data, error } = await ctx.sb
    .from('email_log')
    .select('id, template_key, to_email, subject, provider, status, error, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(Math.min(500, limit));
  if (error) return errorResponse(500, error.message);
  return jsonResponse(data ?? []);
};
