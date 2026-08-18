/**
 * Admin: read + write the global simulation config, with version history.
 *
 *   GET  /admin-simulation-config              → { config, updated_at }
 *   GET  /admin-simulation-config?op=history   → { versions: SimulationVersion[] }
 *   POST /admin-simulation-config              → body: { config, note?, baseUpdatedAt? }
 *                                                → { config, updated_at }
 *   POST /admin-simulation-config?op=restore   → body: { auditId, baseUpdatedAt? }
 *                                                → { config, updated_at }
 *
 * `baseUpdatedAt` is the optimistic-concurrency token: pass the `updated_at`
 * the editor loaded and a save that would clobber someone else's newer write
 * returns 409 `{ error: 'conflict', updated_at }` instead. Omit it and the
 * write is unconditional (last-write-wins), as before.
 *
 * The config is stored as opaque JSONB in public.simulation_config (id='global').
 * Every write is mirrored to admin_audit_log with entity_type 'simulation_config'
 * and the FULL before/after config — which is what makes the history + restore
 * ops possible without a second table: the audit log already IS the version
 * history.
 *
 * The consumer reads the resolved value through the public flags-resolve
 * endpoint (service role); the table is not directly readable by anon/auth roles.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import { emailsByUserId } from './_shared/users';

/** Version history window — deliberately bounded so the panel stays readable. */
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 50;
const MAX_NOTE_LEN = 200;

/** Trim + cap an admin-supplied version label. Empty → undefined (no note). */
function cleanNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_NOTE_LEN);
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface CurrentConfig {
  config: Record<string, unknown> | null;
  /** Row timestamp, or null when no row exists yet. The concurrency token. */
  updatedAt: string | null;
  /** True when the singleton row exists (distinct from "config is empty"). */
  exists: boolean;
  error: string | null;
}

async function readCurrentConfig(sb: SupabaseClient): Promise<CurrentConfig> {
  const { data, error } = await sb
    .from('simulation_config')
    .select('config, updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    return { config: null, updatedAt: null, exists: false, error: error.message as string };
  }
  return {
    config: (data?.config ?? null) as Record<string, unknown> | null,
    updatedAt: (data?.updated_at ?? null) as string | null,
    exists: Boolean(data),
    error: null,
  };
}

/**
 * Optimistic-concurrency check.
 *
 * The Simulation screen edits ONE global JSON blob, so two admins with the
 * panel open will last-write-wins each other's tuning without noticing. A
 * client that sends the `updated_at` it loaded gets a 409 instead, carrying
 * the current timestamp so the UI can offer a reload. Omitting the field keeps
 * the old unconditional behaviour (older clients still work).
 */
function conflictResponse(
  body: { baseUpdatedAt?: unknown },
  current: CurrentConfig,
): Response | null {
  const base = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : null;
  if (!base || !current.exists) return null;
  if (current.updatedAt === base) return null;
  return jsonResponse(
    {
      error: 'conflict',
      updated_at: current.updatedAt,
    },
    { status: 409 },
  );
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'simulation.read');
  if (ctx instanceof Response) return ctx;

  const op = new URL(req.url).searchParams.get('op');

  if (req.method === 'GET') {
    if (op === 'history') {
      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await ctx.sb
        .from('admin_audit_log')
        .select('id, created_at, actor_id, action, note, before, after')
        .eq('entity_type', 'simulation_config')
        .eq('entity_id', 'global')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) return errorResponse(500, error.message);

      const rows = (data ?? []) as Array<Record<string, unknown>>;

      // Best-effort email enrichment — a hiccup in the Auth admin API must not
      // cost the admin their version history, so fall back to bare actor ids.
      let emails = new Map<string, string>();
      if (rows.length > 0) {
        try {
          emails = await emailsByUserId(ctx.sb);
        } catch {
          // leave emails empty; the UI shortens the raw id instead
        }
      }

      return jsonResponse({
        versions: rows.map((r) => ({
          ...r,
          actor_email: r.actor_id ? emails.get(String(r.actor_id)) ?? null : null,
        })),
      });
    }
    if (op) return errorResponse(400, `Unknown op: ${op}`);

    const current = await readCurrentConfig(ctx.sb);
    if (current.error) return errorResponse(500, current.error);
    return jsonResponse({ config: current.config ?? {}, updated_at: current.updatedAt });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }
  if (!can(ctx, 'simulation.write')) return errorResponse(403, 'Missing permission: simulation.write');

  let body: { config?: unknown; note?: unknown; auditId?: unknown; baseUpdatedAt?: unknown };
  try {
    body = (await req.json()) as {
      config?: unknown;
      note?: unknown;
      auditId?: unknown;
      baseUpdatedAt?: unknown;
    };
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  // ── op=restore: re-apply the config as it stood after a past save ──────────
  if (op === 'restore') {
    const auditId = typeof body.auditId === 'string' ? body.auditId.trim() : '';
    if (!auditId) return errorResponse(400, 'Missing auditId');

    const { data: entry, error: fetchErr } = await ctx.sb
      .from('admin_audit_log')
      .select('id, entity_type, entity_id, after, created_at')
      .eq('id', auditId)
      .maybeSingle();
    if (fetchErr) return errorResponse(500, fetchErr.message);
    if (!entry) return errorResponse(404, 'Version not found');
    if (entry.entity_type !== 'simulation_config' || entry.entity_id !== 'global') {
      return errorResponse(400, 'Audit entry is not a simulation config version');
    }

    // Restoring a version means re-applying its "after" — the config as it
    // stood once that save landed.
    // An `after` that isn't an object means the version being restored had no
    // config at all (the empty/defaults state). That's a legitimate thing to
    // restore, but it looks identical to a bug in the history panel — so the
    // audit note says which one it was.
    const emptyRestore = !isPlainObject(entry.after);
    const restored = isPlainObject(entry.after) ? (entry.after as Record<string, unknown>) : {};

    const current = await readCurrentConfig(ctx.sb);
    if (current.error) return errorResponse(500, current.error);
    const conflict = conflictResponse(body, current);
    if (conflict) return conflict;

    const { data, error } = await ctx.sb
      .from('simulation_config')
      .upsert({
        id: 'global',
        config: restored,
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .select('config, updated_at')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);

    const after = (data?.config ?? restored) as Record<string, unknown>;
    const stamp = `Restored version from ${new Date(String(entry.created_at)).toISOString()}`;
    await writeAuditLog(ctx, {
      entity_type: 'simulation_config',
      entity_id: 'global',
      action: 'update',
      before: current.config,
      after,
      note: emptyRestore ? `${stamp} — Restored to defaults (empty version)` : stamp,
    });

    return jsonResponse({ config: after, updated_at: (data?.updated_at ?? null) as string | null });
  }

  if (op) return errorResponse(400, `Unknown op: ${op}`);

  // ── default: save a new version ───────────────────────────────────────────
  const incoming = body.config;
  if (!isPlainObject(incoming)) {
    return errorResponse(400, 'config must be a plain object');
  }
  const config = incoming;
  const note = cleanNote(body.note);

  // Fetch current value for the audit log "before" snapshot — and for the
  // optimistic-concurrency check against the version the client loaded.
  const current = await readCurrentConfig(ctx.sb);
  if (current.error) return errorResponse(500, current.error);
  const conflict = conflictResponse(body, current);
  if (conflict) return conflict;

  // Upsert the global row.
  const { data, error } = await ctx.sb
    .from('simulation_config')
    .upsert({
      id: 'global',
      config,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('config, updated_at')
    .maybeSingle();
  if (error) return errorResponse(500, error.message);

  const after = (data?.config ?? config) as Record<string, unknown>;

  await writeAuditLog(ctx, {
    entity_type: 'simulation_config',
    entity_id: 'global',
    action: 'update',
    before: current.config,
    after,
    note,
  });

  return jsonResponse({ config: after, updated_at: (data?.updated_at ?? null) as string | null });
};
