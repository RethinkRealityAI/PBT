import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';

export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { data, error } = await ctx.sb
    .from('profiles')
    .select(
      'user_id, display_name, echo_primary, echo_secondary, is_admin, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) return errorResponse(500, error.message);
  return jsonResponse(data ?? []);
};
