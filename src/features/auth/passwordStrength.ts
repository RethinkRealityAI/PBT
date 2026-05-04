import zxcvbn from 'zxcvbn';

export interface PasswordCheck {
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string;
  ok: boolean;
}

const MESSAGES: Record<number, string> = {
  0: 'Too weak — try a longer phrase or mix in symbols.',
  1: 'Weak — try a longer phrase or mix in symbols.',
  2: 'Okay, but easy to crack. Add length or words.',
  3: 'Strong enough.',
  4: 'Excellent.',
};

export function checkPassword(password: string): PasswordCheck {
  if (!password) return { score: 0, feedback: 'Enter a password.', ok: false };
  if (password.length < 10) {
    return {
      score: 0,
      feedback: 'At least 10 characters, please.',
      ok: false,
    };
  }
  const result = zxcvbn(password);
  const score = result.score as PasswordCheck['score'];
  return {
    score,
    feedback: MESSAGES[score],
    ok: score >= 3,
  };
}
