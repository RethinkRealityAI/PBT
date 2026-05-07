import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';

export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const limit = Math.min(
    1000,
    Number(new URL(req.url).searchParams.get('limit') ?? 500),
  );
  const { data, error } = await ctx.sb
    .from('user_scenarios')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return errorResponse(500, error.message);
  return jsonResponse(data ?? []);
};
