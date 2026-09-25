/**
 * AI brief step — pure helpers: the one-tap example notes, appending /
 * removing them, and splitting the server-built briefing into highlighted
 * segments for the "See the full briefing" viewer.
 */

export interface NoteExample {
  /** Chip text. */
  label: string;
  /** The sentence the chip appends. */
  sentence: string;
}

export const PREFIX_EXAMPLES: NoteExample[] = [
  {
    label: 'Impatient — late for work',
    sentence: 'Be noticeably more impatient than usual — you are late for work and keep glancing at the time.',
  },
  {
    label: 'Bad past experience with a vet',
    sentence:
      'You had a bad experience with a previous vet who kept pushing products, so you are wary of being sold to.',
  },
  {
    label: 'Partner disagrees',
    sentence:
      'Your partner disagrees with changing anything, and you are dreading the argument when you get home.',
  },
];

export const SUFFIX_EXAMPLES: NoteExample[] = [
  {
    label: 'Never agree before asking about price',
    sentence: 'Never agree to the recommendation before you have asked what it costs.',
  },
  {
    label: 'Mention the article you read online',
    sentence: 'Mention the article you read online at least once, even if the conversation moves on.',
  },
  {
    label: 'Only soften after they ask about the daily routine',
    sentence: 'Only start to soften after the staff member asks about your pet’s daily routine.',
  },
];

/** Does the note already carry this sentence? */
export function hasSentence(current: string | null | undefined, sentence: string): boolean {
  return (current ?? '').includes(sentence);
}

/** Append a sentence on its own line (or as the whole note when empty). */
export function appendSentence(current: string | null | undefined, sentence: string): string {
  const base = (current ?? '').trimEnd();
  if (!base) return sentence;
  if (base.includes(sentence)) return base;
  return `${base}\n${sentence}`;
}

/** Take a sentence back out, tidying the blank line it leaves. */
export function removeSentence(current: string | null | undefined, sentence: string): string {
  // Whole lines first — that is how `appendSentence` wrote it.
  let out = (current ?? '')
    .split('\n')
    .filter((line) => line.trim() !== sentence)
    .join('\n');
  // Typed inline by hand: take the words out, close the gap they leave.
  if (out.includes(sentence)) out = out.split(sentence).join('').replace(/ {2,}/g, ' ');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Briefing segmentation ───────────────────────────────────

export type SegmentKind = 'plain' | 'scenario' | 'global';

export interface PromptSegment {
  text: string;
  kind: SegmentKind;
}

export interface AdminNotesLike {
  scenarioPrefix: string | null;
  scenarioSuffix: string | null;
  globalPrefix: string | null;
  globalSuffix: string | null;
}

/**
 * Split the prompt into plain text and the admin-written notes wrapped
 * around it, so each can be highlighted. The notes are searched in the
 * order the prompt builder writes them (global opening · your opening ·
 * canonical brief · your final · global final), each after the previous
 * match, so a note that also happens to appear inside the canonical brief
 * is not mis-highlighted there.
 */
export function segmentPrompt(prompt: string, notes: AdminNotesLike): PromptSegment[] {
  const ordered: Array<{ text: string; kind: SegmentKind }> = [
    { text: notes.globalPrefix ?? '', kind: 'global' },
    { text: notes.scenarioPrefix ?? '', kind: 'scenario' },
    { text: notes.scenarioSuffix ?? '', kind: 'scenario' },
    { text: notes.globalSuffix ?? '', kind: 'global' },
  ];
  const ranges: Array<{ start: number; end: number; kind: SegmentKind }> = [];
  let cursor = 0;
  for (const note of ordered) {
    const text = note.text.trim();
    if (!text) continue;
    const at = prompt.indexOf(text, cursor);
    if (at < 0) continue;
    ranges.push({ start: at, end: at + text.length, kind: note.kind });
    cursor = at + text.length;
  }
  const out: PromptSegment[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) out.push({ text: prompt.slice(pos, r.start), kind: 'plain' });
    out.push({ text: prompt.slice(r.start, r.end), kind: r.kind });
    pos = r.end;
  }
  if (pos < prompt.length) out.push({ text: prompt.slice(pos), kind: 'plain' });
  return out;
}

/** A briefing line that names a section ("# PUSHBACK"). */
export function isHeadingLine(line: string): boolean {
  return /^#{1,3} \S/.test(line);
}
