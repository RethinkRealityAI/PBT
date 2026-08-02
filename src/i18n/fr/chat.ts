import type { chat as enChat } from '../en/chat';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const chat: Record<keyof typeof enChat, string> = {
  'chat.voice.capWarning':
    'Les séances vocales se terminent à 5 minutes — il reste environ une minute.',
};
