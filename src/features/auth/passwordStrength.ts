import type zxcvbnType from 'zxcvbn';

/**
 * zxcvbn ships ~390 kB gzip of password dictionaries, so it is loaded on
 * demand (dynamic import → its own `vendor-zxcvbn` chunk) instead of riding
 * the consumer's critical path. `preloadPasswordStrength()` lets the
 * sign-up UI start the fetch when the modal opens, so the dictionaries are
 * usually resident before the first keystroke needs them.
 */
type Zxcvbn = typeof zxcvbnType;

let zxcvbnFn: Zxcvbn | null = null;
let zxcvbnLoading: Promise<Zxcvbn> | null = null;

function loadZxcvbn(): Promise<Zxcvbn> {
  if (zxcvbnFn) return Promise.resolve(zxcvbnFn);
  zxcvbnLoading ??= import('zxcvbn').then((m) => {
    zxcvbnFn = m.default;
    return m.default;
  });
  return zxcvbnLoading;
}

export function preloadPasswordStrength(): void {
  void loadZxcvbn().catch(() => {
    // Network hiccup — checkPassword() will retry when actually needed.
    zxcvbnLoading = null;
  });
}

/** Stable feedback identifier — UIs map this to a localized string. */
export type PasswordFeedbackCode =
  | 'empty'
  | 'short'
  | 'score0'
  | 'score1'
  | 'score2'
  | 'score3'
  | 'score4';

export interface PasswordCheck {
  score: 0 | 1 | 2 | 3 | 4;
  /** English fallback text; localized UIs should render `code` via t(). */
  feedback: string;
  code: PasswordFeedbackCode;
  ok: boolean;
}

const MESSAGES: Record<number, string> = {
  0: 'Too weak — try a longer phrase or mix in symbols.',
  1: 'Weak — try a longer phrase or mix in symbols.',
  2: 'Okay, but easy to crack. Add length or words.',
  3: 'Strong enough.',
  4: 'Excellent.',
};

export async function checkPassword(password: string): Promise<PasswordCheck> {
  if (!password) return { score: 0, feedback: 'Enter a password.', code: 'empty', ok: false };
  if (password.length < 10) {
    return {
      score: 0,
      feedback: 'At least 10 characters, please.',
      code: 'short',
      ok: false,
    };
  }
  const zxcvbn = await loadZxcvbn();
  const result = zxcvbn(password);
  const score = result.score as PasswordCheck['score'];
  return {
    score,
    feedback: MESSAGES[score],
    code: `score${score}` as PasswordFeedbackCode,
    ok: score >= 3,
  };
}
