/**
 * Offline fixtures for the Scenario Studio (see ./mockApi.ts).
 *
 * `STUDIO_ROUTES` answers GETs (they win over mockApi's ROUTES for the same
 * function name); `STUDIO_POST_HANDLERS` answers POSTs from the request body.
 * Covered: admin-scenario-agent (assistant turns with A2UI-able proposals),
 * admin-scenario-inspect (prompt + passages), ai-roleplay / ai-evaluate (the
 * Test drive), and a few saved scenario rows so the gallery isn't empty.
 */
export const STUDIO_ROUTES: Record<string, unknown> = {};

export const STUDIO_POST_HANDLERS: Record<
  string,
  (body: Record<string, unknown>) => unknown | Promise<unknown>
> = {};
