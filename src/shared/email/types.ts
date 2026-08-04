/**
 * Shared email model — used by the Netlify Functions that send mail and by the
 * admin Email screen that edits and previews it. Dependency-free on purpose.
 */

export type EmailBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'callout'; text: string; tone?: 'neutral' | 'info' | 'success' | 'warn' }
  | { type: 'list'; items: string[] }
  | { type: 'meta'; items: Array<{ label: string; value: string }> }
  | { type: 'code'; text: string }
  | { type: 'divider' };

export type EmailBlockType = EmailBlock['type'];

export interface EmailTemplate {
  key: string;
  name: string;
  description: string;
  subject: string;
  /** Inbox preview line. Hidden in the body, shown next to the subject. */
  preheader: string;
  blocks: EmailBlock[];
  /** When set, sent verbatim instead of rendering `blocks`. */
  htmlOverride?: string | null;
  enabled?: boolean;
}

export interface EmailBrand {
  productName: string;
  /** Short mark shown in the header badge (1–3 characters reads best). */
  logoText: string;
  accent: string;
  accentDeep: string;
  siteUrl: string;
  supportEmail: string;
  footerNote: string;
}

export const DEFAULT_BRAND: EmailBrand = {
  productName: 'Pushback Training',
  logoText: 'P',
  accent: '#db0027',
  accentDeep: '#b6001f',
  siteUrl: '',
  supportEmail: '',
  footerNote:
    'You received this email because your address is registered with Pushback Training.',
};

/** A declared variable a template may interpolate as `{{key}}`. */
export interface TemplateVariable {
  key: string;
  label: string;
  /** Value used when previewing or sending a test. */
  sample: string;
  /** Links must resolve for the email to be useful — flagged in the editor. */
  required?: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
