/**
 * Chainable fake for `@supabase/supabase-js` used by the Netlify Function
 * tests. Not a test file (the runner only picks up *.test.ts).
 *
 * `from(table)` returns a chain that records every builder call and is
 * awaitable: awaiting it invokes the table's handler with the recorded ops
 * and resolves to whatever the handler returns (`{ data, error }`).
 */
import { vi } from 'vitest';

export interface SbOp {
  op: string;
  args: unknown[];
}

export interface SbCall {
  table: string;
  ops: SbOp[];
}

export interface SbResult {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

export type TableHandler = (call: SbCall) => SbResult | Promise<SbResult>;

const CHAIN_OPS = [
  'select',
  'eq',
  'neq',
  'is',
  'in',
  'order',
  'limit',
  'maybeSingle',
  'single',
  'insert',
  'upsert',
  'update',
  'delete',
] as const;

export function makeFakeSupabase(initial: Record<string, TableHandler> = {}) {
  const handlers: Record<string, TableHandler> = { ...initial };
  const calls: SbCall[] = [];
  const getUser = vi.fn();
  const rpc = vi.fn();

  const client = {
    auth: { getUser },
    rpc,
    from(table: string) {
      const call: SbCall = { table, ops: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const op of CHAIN_OPS) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push({ op, args });
          return chain;
        };
      }
      chain.then = (
        resolve: (v: SbResult) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const h = handlers[table];
        return Promise.resolve()
          .then(() => (h ? h(call) : { data: null, error: null }))
          .then(resolve, reject);
      };
      return chain;
    },
  };

  return {
    client,
    calls,
    getUser,
    rpc,
    setHandler(table: string, handler: TableHandler) {
      handlers[table] = handler;
    },
    /** Calls made against one table, in order. */
    callsFor(table: string): SbCall[] {
      return calls.filter((c) => c.table === table);
    },
    /** The op with this name on the first call to `table` (or undefined). */
    firstOp(table: string, op: string): SbOp | undefined {
      return calls.find((c) => c.table === table)?.ops.find((o) => o.op === op);
    },
  };
}

export type FakeSupabase = ReturnType<typeof makeFakeSupabase>;

/** Sets the env every function reads at request time. */
export function setFunctionEnv(): void {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
}

export function jsonRequest(
  path: string,
  body: unknown,
  init: { headers?: Record<string, string>; method?: string; ip?: string } = {},
): Request {
  const method = init.method ?? 'POST';
  const bodyless = method === 'GET' || method === 'HEAD';
  return new Request(`http://localhost/.netlify/functions/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-nf-client-connection-ip': init.ip ?? '203.0.113.7',
      ...(init.headers ?? {}),
    },
    body: bodyless ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}
