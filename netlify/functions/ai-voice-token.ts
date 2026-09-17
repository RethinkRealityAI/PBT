/**
 * Live voice — mint a single-use ephemeral token: `VoiceTokenRequest →
 * VoiceTokenResponse`.
 *
 * Voice is the one AI path that must connect from the device (the Live API
 * is a WebSocket carrying microphone audio). The browser therefore gets a
 * short-lived token from here instead of the long-lived key. The token is
 * CONSTRAINED: the model, the system prompt (built server-side from the
 * server-loaded simulation config + overrides + RAG grounding), the two tool
 * declarations, the audio modality, the speech config and both transcription
 * flags are fixed in the token, so the browser cannot alter what the
 * customer is or how it is scored.
 *
 * Token-locking choice — `lockAdditionalFields` is OMITTED on purpose.
 * Per the SDK's `Tokens.create` docs (node_modules/@google/genai/dist/
 * genai.d.ts, "Case 2"): when `liveConnectConstraints` is set and
 * `lockAdditionalFields` is unset, the API locks ALL fields of
 * LiveConnectConfig — any value the client passes at connect time for a
 * locked field is ignored. `[]` ("Case 4") would lock only the fields set
 * here and leave the rest (e.g. `realtimeInputConfig`, `temperature`)
 * client-tunable; a list ("Case 3") locks set + named fields. Locking
 * everything is the strictest option and costs nothing: the browser session
 * sets exactly the fields fixed here and nothing else. Reference:
 * https://ai.google.dev/gemini-api/docs/ephemeral-tokens.
 *
 * Opening line — the browser sends the kickoff cue (`Begin the simulation
 * now. Deliver this exact opening line…`) as a realtime CLIENT MESSAGE after
 * the socket opens (`voiceSession.ts` → `session.sendRealtimeInput({ text:
 * openingHint })`), not as part of the system prompt. Messages are not
 * config, so a fully locked token does not block it. `openingLine` in the
 * request is therefore accepted but unused here, which preserves behaviour.
 *
 * Lifetime — `newSessionExpireTime` is 2 minutes (the token must be used to
 * OPEN a session promptly after Begin) and `expireTime` is 15 minutes, which
 * outlives the 5-minute session cap (`VOICE_SESSION_CAPS.hardCapMs`) with
 * margin for the graceful wrap-up. `uses: 1` — one token, one session.
 */
import { GoogleGenAI, Modality, Type } from '@google/genai';
import {
  aiError,
  errorMessage,
  isUuid,
  loadPromptOverrides,
  loadSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  readLocale,
  recordCallServer,
  retrieveForScenario,
  sanitizeScenario,
} from './_shared/ai';
import { buildVoiceSystemPrompt } from '../../src/data/knowledge/promptBuilders';
import { MODEL_LIVE } from '../../src/shared/ai/models';
import type { VoiceTokenRequest, VoiceTokenResponse } from '../../src/shared/ai/contract';
import { LOCALE_BCP47 } from '../../src/i18n/locales';

const MAX_BODY_BYTES = 256 * 1024;
/** Token stops accepting messages — must outlive the 5-min session cap. */
export const TOKEN_TTL_MS = 15 * 60_000;
/** Window in which the token may OPEN a session. */
export const NEW_SESSION_WINDOW_MS = 2 * 60_000;

/** The two tools the voice customer can call — identical to the browser's. */
export const VOICE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'updateEmotion',
        description: 'Update the resolution level orb. Call whenever your receptiveness shifts.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            emotion: {
              type: Type.STRING,
              description:
                "Current resolution state. Use 'red' for defensive/resistant, 'yellow' for listening/receptive, or 'green' for convinced/resolved.",
            },
          },
          required: ['emotion'],
        },
      },
      {
        name: 'endSimulation',
        description: 'End the simulation when it reaches a natural conclusion.',
        parameters: {
          type: Type.OBJECT,
          properties: { reason: { type: Type.STRING } },
          required: ['reason'],
        },
      },
    ],
  },
];

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'voice-token', { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<VoiceTokenRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');

  const locale = readLocale(body.locale);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) {
    console.error('[ai-voice-token] GEMINI_API_KEY is not configured');
    return aiError(500, 'server', 'AI is not configured');
  }

  const config = await loadSimulationConfig(caller.sb);
  const [overrides, retrieved] = await Promise.all([
    loadPromptOverrides(caller.sb, scenario, body),
    retrieveForScenario(caller.sb, scenario, config),
  ]);

  const systemInstruction = buildVoiceSystemPrompt({
    scenario,
    config,
    retrieved,
    locale,
    // Per-scenario prompt wraps — same source text mode uses.
    overrides,
  });

  // Ephemeral tokens are a v1alpha-only surface.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString();
  const newSessionExpiresAt = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

  const t0 = performance.now();
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: newSessionExpiresAt,
        liveConnectConstraints: {
          model: MODEL_LIVE,
          config: {
            systemInstruction,
            tools: VOICE_TOOLS,
            // Gemini Live preview models accept exactly ONE response
            // modality. AUDIO + outputAudioTranscription is the only
            // configuration that works.
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              // Same prebuilt voice across locales — it is the customer's
              // persona, not their accent.
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
              // BCP-47 for the app locale: en-US, or fr-CA for French.
              languageCode: LOCALE_BCP47[locale],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
        // lockAdditionalFields deliberately omitted → lock ALL fields (see
        // the header comment).
      },
    });
    if (!token?.name) throw new Error('Ephemeral token response had no name');

    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'voice',
        modelId: MODEL_LIVE,
        latencyMs: Math.round(performance.now() - t0),
      },
      { allowTelemetry, preview },
    );

    const payload: VoiceTokenResponse = {
      token: token.name,
      model: MODEL_LIVE,
      expiresAt,
      newSessionExpiresAt,
    };
    return ok(payload);
  } catch (err) {
    console.error('[ai-voice-token] mint failed', errorMessage(err));
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'voice',
        modelId: MODEL_LIVE,
        latencyMs: Math.round(performance.now() - t0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    return aiError(502, 'upstream', 'Could not start a voice session. Please try again.');
  }
};
