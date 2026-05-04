/** Feature flags for v1 frictionless launch. */
export const FLAGS = {
  /** When true, sign-up triggers Supabase email verification. v1 keeps off. */
  EMAIL_VERIFICATION: false,
  /** When true, debounce-mirror localStorage writes to Supabase. Active once signed in. */
  CLOUD_SYNC: true,
} as const;
