/**
 * Transport for the server-side AI functions (`netlify/functions/ai-*`).
 *
 * The Gemini key lives ONLY in those functions; the browser talks to them
 * over plain JSON. This module is the single place that knows how:
 *
 *   • identity  — the Supabase access token rides along as a Bearer header
 *                 when the user is signed in; anonymous callers send none
 *                 (anonymous-first is product design, see the contract).
 *   • privacy   — `allowTelemetry` (the `pbt:allow_training_use` opt-out)
 *                 and `preview` (admin "Test in app") are merged into every
 *                 body unless the caller set them, so no call site can
 *                 forget to honour them.
 *   • failure   — non-2xx and network errors both surface as `AiApiError`
 *                 with a typed `code`, so callers branch on the contract's
 *                 `AiErrorCode` instead of parsing messages.
 *
 * `VITE_AI_FUNCTIONS_BASE` (default '' → same-origin relative path) lets a
 * `netlify dev` server or a deployed preview be targeted, e.g. from the live
 * scenario-resolution test.
 */
import {
  type AiErrorCode,
  type AiErrorResponse,
  type AiRequestMeta,
  AI_ENDPOINTS,
} from '../shared/ai/contract';
import { getSupabase } from '../features/auth/supabaseClient';
import { isTrainingUseAllowed } from '../lib/privacy';
import { isPreviewMode } from '../lib/previewMode';

declare global {
  interface ImportMetaEnv {
    /** Optional origin for the AI functions (tests / previews). Default: same origin. */
    readonly VITE_AI_FUNCTIONS_BASE?: string;
  }
}

export type AiEndpoint = (typeof AI_ENDPOINTS)[keyof typeof AI_ENDPOINTS];

export interface PostAiOptions {
  /** Hard deadline for the round-trip. Default 30 s. */
  timeoutMs?: number;
  /** Caller-owned abort (e.g. component unmount); combined with the timeout. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const ERROR_CODES: readonly AiErrorCode[] = [
  'bad_request',
  'unauthorized',
  'rate_limited',
  'payload_too_large',
  'upstream',
  'server',
];

function isAiErrorCode(v: unknown): v is AiErrorCode {
  return typeof v === 'string' && (ERROR_CODES as readonly string[]).includes(v);
}

/**
 * Thrown by {@link postAi} for every failure. `status` is the HTTP status
 * (0 when the request never completed — offline, aborted, timed out) and
 * `code` is the server's `AiErrorCode`, falling back to `'server'`.
 */
export class AiApiError extends Error {
  readonly status: number;
  readonly code: AiErrorCode;

  constructor(message: string, status: number, code: AiErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiApiError';
    this.status = status;
    this.code = code;
  }
}

function functionsBase(): string {
  const base = (import.meta.env.VITE_AI_FUNCTIONS_BASE as string | undefined) ?? '';
  return base.replace(/\/+$/, '');
}

/** Current Supabase access token, or null when anonymous / Supabase is off. */
async function bearerToken(): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** A signal that fires on the timeout OR the caller's signal, whichever first. */
function deadlineSignal(timeoutMs: number, caller?: AbortSignal): AbortSignal {
  const timeout =
    typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : (() => {
          const c = new AbortController();
          setTimeout(() => c.abort(new Error('timeout')), timeoutMs);
          return c.signal;
        })();
  if (!caller) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, caller]);
  const combined = new AbortController();
  const forward = (s: AbortSignal) => () => combined.abort(s.reason);
  if (caller.aborted) combined.abort(caller.reason);
  else caller.addEventListener('abort', forward(caller), { once: true });
  timeout.addEventListener('abort', forward(timeout), { once: true });
  return combined.signal;
}

/**
 * POST a JSON body to one of the AI functions and return its parsed JSON.
 *
 * Throws {@link AiApiError} on any failure — callers that must never throw
 * (the scorer) wrap it themselves.
 */
export async function postAi<TRes>(
  endpoint: AiEndpoint,
  body: object,
  opts: PostAiOptions = {},
): Promise<TRes> {
  const payload: Record<string, unknown> & AiRequestMeta = { ...body };
  if (payload.allowTelemetry === undefined) payload.allowTelemetry = isTrainingUseAllowed();
  if (payload.preview === undefined) payload.preview = isPreviewMode();

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = await bearerToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const url = `${functionsBase()}${endpoint}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: deadlineSignal(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new AiApiError(`AI request failed: ${reason}`, 0, 'server', { cause: err });
  }

  if (!res.ok) {
    let code: AiErrorCode = 'server';
    let message = `AI request failed (${res.status})`;
    try {
      const data = (await res.json()) as Partial<AiErrorResponse>;
      if (isAiErrorCode(data.code)) code = data.code;
      if (typeof data.error === 'string' && data.error.trim()) message = data.error;
    } catch {
      /* non-JSON error body — keep the status-based message */
    }
    throw new AiApiError(message, res.status, code);
  }

  try {
    return (await res.json()) as TRes;
  } catch (err) {
    throw new AiApiError('AI response was not valid JSON', res.status, 'server', { cause: err });
  }
}
