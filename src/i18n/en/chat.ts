/**
 * Chat / live-voice screen strings. Namespaces use flat dotted keys;
 * every key added here must be added to EVERY other locale's matching file
 * (the `Catalog` type makes a missing key a compile error — see
 * CLAUDE.md "Translations (MANDATORY)").
 */
export const chat = {
  'chat.voice.capWarning': 'Voice sessions wrap up at 5 minutes — about a minute left.',
} as const;
