/**
 * Admin: list flag definitions + rules; create/update/delete rules.
 *
 *   GET  /admin-flags                 → { flags, rules }
 *   POST /admin-flags                 → { type: 'rule', op: 'upsert', rule: {...} }
 *                                     → { type: 'rule', op: 'delete', id }
 *                                     → { type: 'flag', op: 'upsert', flag: {...} }
 *
 * Every write is mirrored to admin_audit_log.
 */
import { errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';

interface RuleUpsert {
  id?: string;
  flag_key: string;
  priority?: number;
  audience?: Record<string, unknown>;
  value: unknown;
  enabled?: boolean;
  note?: string;
}

interface FlagUpsert {
  key: string;
  surface: 'screen' | 'nav' | 'scenario' | 'component' | 'field' | 'ai';
  value_type: 'boolean' | 'string' | 'number' | 'json';
  default_value: unknown;
  description?: string | null;
}

interface PostBody {
  type: 'rule' | 'flag';
  op: 'upsert' | 'delete';
  rule?: RuleUpsert;
  flag?: FlagUpsert;
  id?: string;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const [flagsRes, rulesRes] = await Promise.all([
      ctx.sb.from('flags').select('*').order('surface').order('key'),
      ctx.sb.from('flag_rules').select('*').order('priority', { ascending: false }),
    ]);
    if (flagsRes.error) return errorResponse(500, flagsRes.error.message);
    if (rulesRes.error) return errorResponse(500, rulesRes.error.message);
    return jsonResponse({ flags: flagsRes.data ?? [], rules: rulesRes.data ?? [] });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (body.type === 'rule') {
    if (body.op === 'upsert') {
      const rule = body.rule;
      if (!rule || !rule.flag_key) return errorResponse(400, 'Missing rule.flag_key');
      const before = rule.id
        ? (await ctx.sb.from('flag_rules').select('*').eq('id', rule.id).maybeSingle()).data
        : null;
      const payload = {
        ...(rule.id ? { id: rule.id } : {}),
        flag_key: rule.flag_key,
        priority: rule.priority ?? 100,
        audience: rule.audience ?? {},
        value: rule.value,
        enabled: rule.enabled ?? true,
        note: rule.note ?? null,
      };
      const { data, error } = await ctx.sb
        .from('flag_rules')
        .upsert(payload)
        .select('*')
        .maybeSingle();
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'flag_rule',
        entity_id: data?.id ?? rule.flag_key,
        action: rule.id ? 'update' : 'create',
        before,
        after: data,
      });
      return jsonResponse(data);
    }
    if (body.op === 'delete') {
      if (!body.id) return errorResponse(400, 'Missing id');
      const before = (
        await ctx.sb.from('flag_rules').select('*').eq('id', body.id).maybeSingle()
      ).data;
      const { error } = await ctx.sb.from('flag_rules').delete().eq('id', body.id);
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'flag_rule',
        entity_id: body.id,
        action: 'delete',
        before,
      });
      return jsonResponse({ ok: true });
    }
  }

  if (body.type === 'flag') {
    if (body.op !== 'upsert' || !body.flag) return errorResponse(400, 'Bad flag op');
    const flag = body.flag;
    const before = (
      await ctx.sb.from('flags').select('*').eq('key', flag.key).maybeSingle()
    ).data;
    const { data, error } = await ctx.sb
      .from('flags')
      .upsert({
        key: flag.key,
        surface: flag.surface,
        value_type: flag.value_type,
        default_value: flag.default_value,
        description: flag.description ?? null,
      })
      .select('*')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, {
      entity_type: 'flag',
      entity_id: flag.key,
      action: before ? 'update' : 'create',
      before,
      after: data,
    });
    return jsonResponse(data);
  }

  return errorResponse(400, 'Unknown operation');
};
