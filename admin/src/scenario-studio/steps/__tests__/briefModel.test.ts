import { describe, expect, it } from 'vitest';
import {
  PREFIX_EXAMPLES,
  appendSentence,
  hasSentence,
  isHeadingLine,
  removeSentence,
  segmentPrompt,
} from '../briefModel';

describe('example notes', () => {
  const s = PREFIX_EXAMPLES[0].sentence;

  it('append on its own line, never twice', () => {
    expect(appendSentence('', s)).toBe(s);
    expect(appendSentence(null, s)).toBe(s);
    expect(appendSentence('Be curt.  ', s)).toBe(`Be curt.\n${s}`);
    expect(appendSentence(`Be curt.\n${s}`, s)).toBe(`Be curt.\n${s}`);
    expect(hasSentence(`x ${s}`, s)).toBe(true);
  });

  it('remove takes the line back out and tidies up', () => {
    expect(removeSentence(`Be curt.\n${s}`, s)).toBe('Be curt.');
    expect(removeSentence(`A\n${s}\nB`, s)).toBe('A\nB');
    expect(removeSentence(`Start ${s} end`, s)).toBe('Start end');
    expect(removeSentence(s, s)).toBe('');
  });
});

describe('segmentPrompt', () => {
  const prompt = [
    '# ADMIN NOTES (apply on top of the canonical brief below)',
    'Global opening.',
    '',
    'Be impatient.',
    '',
    'You are roleplaying a customer. Be impatient.',
    '',
    '# ADMIN ADDENDUM',
    'Never agree first.',
    '',
    'Global closing.',
  ].join('\n');

  it('marks each note where the builder put it, in order', () => {
    const segs = segmentPrompt(prompt, {
      globalPrefix: 'Global opening.',
      scenarioPrefix: '  Be impatient.  ',
      scenarioSuffix: 'Never agree first.',
      globalSuffix: 'Global closing.',
    });
    expect(segs.map((s) => s.text).join('')).toBe(prompt);
    const marked = segs.filter((s) => s.kind !== 'plain');
    expect(marked).toEqual([
      { text: 'Global opening.', kind: 'global' },
      { text: 'Be impatient.', kind: 'scenario' },
      { text: 'Never agree first.', kind: 'scenario' },
      { text: 'Global closing.', kind: 'global' },
    ]);
    // Only the FIRST "Be impatient." — the copy inside the canonical brief stays plain.
    expect(segs.filter((s) => s.text === 'Be impatient.').length).toBe(1);
  });

  it('no notes = one plain segment; an unfound note is skipped', () => {
    expect(segmentPrompt('abc', { globalPrefix: null, scenarioPrefix: null, scenarioSuffix: null, globalSuffix: null })).toEqual([
      { text: 'abc', kind: 'plain' },
    ]);
    expect(
      segmentPrompt('abc', { globalPrefix: null, scenarioPrefix: 'zzz', scenarioSuffix: null, globalSuffix: null }),
    ).toEqual([{ text: 'abc', kind: 'plain' }]);
  });

  it('headings', () => {
    expect(isHeadingLine('# PUSHBACK')).toBe(true);
    expect(isHeadingLine('## Rules')).toBe(true);
    expect(isHeadingLine('#nospace')).toBe(false);
    expect(isHeadingLine('Plain')).toBe(false);
  });
});
