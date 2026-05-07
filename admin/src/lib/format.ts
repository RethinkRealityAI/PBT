export function fmtAgo(ms: number): string {
  const min = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / (60 * 24))}d ago`;
  return `${Math.floor(min / (60 * 24 * 7))}w ago`;
}

export function fmtDuration(sec: number): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function fmtMoney(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function fmtNumber(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

/** Initials from a display name. Fallback "?" so we never render empty. */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
