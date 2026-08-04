/**
 * Default transactional email templates.
 *
 * These ship with the product and are seeded into `email_templates` on first
 * read. Admins edit the DB copy from the Email screen; "Reset to default"
 * restores the version defined here, so a bad edit is never permanent.
 *
 * Every template declares its variables, which drives both the editor's
 * insert-a-variable chips and the sample data used for preview and test sends.
 */
import type { EmailTemplate, TemplateVariable } from './types';

export interface TemplateDefinition extends EmailTemplate {
  /** Grouping in the editor sidebar. */
  group: 'Team' | 'Account' | 'Security';
  variables: TemplateVariable[];
  /** Shown in the editor: what actually triggers this email. */
  trigger: string;
}

const V = {
  name: { key: 'name', label: 'Recipient name', sample: 'Jordan' },
  productName: { key: 'productName', label: 'Product name', sample: 'Pushback Training' },
  supportEmail: { key: 'supportEmail', label: 'Support email', sample: 'support@example.com' },
  siteUrl: { key: 'siteUrl', label: 'Site URL', sample: 'https://pbt.example.com' },
} satisfies Record<string, TemplateVariable>;

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  // ── Team ─────────────────────────────────────────────────────────────
  {
    key: 'admin_invite',
    name: 'Admin invitation',
    group: 'Team',
    description:
      'Sent when someone is invited to the admin portal. Contains the single-use acceptance link.',
    trigger: 'An admin sends an invitation from Team & Roles → Invites.',
    subject: 'You’ve been invited to the {{productName}} admin portal',
    preheader: '{{inviterName}} invited you to join as {{roleName}}. The link expires in {{expiresIn}}.',
    variables: [
      V.name,
      { key: 'inviterName', label: 'Invited by', sample: 'Dapo Ajisafe' },
      { key: 'roleName', label: 'Role name', sample: 'Content Manager' },
      { key: 'roleSummary', label: 'Role summary', sample: 'Scenarios, simulation tuning, knowledge base, and feature flags.' },
      { key: 'acceptUrl', label: 'Accept link', sample: 'https://pbt.example.com/admin/invite?token=sample', required: true },
      { key: 'expiresIn', label: 'Link lifetime', sample: '7 days' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'You’ve been invited to {{productName}}' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — **{{inviterName}}** has invited you to the {{productName}} admin portal. Accept below to choose a password and get started.',
      },
      {
        type: 'meta',
        items: [
          { label: 'Role', value: '{{roleName}}' },
          { label: 'Invited by', value: '{{inviterName}}' },
          { label: 'Link expires in', value: '{{expiresIn}}' },
        ],
      },
      { type: 'paragraph', text: '{{roleSummary}}' },
      { type: 'button', label: 'Accept invitation', href: '{{acceptUrl}}' },
      {
        type: 'callout',
        tone: 'neutral',
        text: 'This invitation is single-use and expires in {{expiresIn}}. If you weren’t expecting it, you can safely ignore this email — nothing happens until you accept.',
      },
    ],
  },
  {
    key: 'role_changed',
    name: 'Role changed',
    group: 'Team',
    description: 'Notifies an admin that their role — and therefore their access — has changed.',
    trigger: 'An admin changes another account’s role or permission overrides.',
    subject: 'Your {{productName}} access has changed',
    preheader: 'You’re now {{roleName}}.',
    variables: [
      V.name,
      { key: 'roleName', label: 'New role', sample: 'Analyst' },
      { key: 'roleSummary', label: 'Role summary', sample: 'Read-only across analytics, sessions, and AI quality.' },
      { key: 'actorName', label: 'Changed by', sample: 'Dapo Ajisafe' },
      { key: 'adminUrl', label: 'Admin portal URL', sample: 'https://pbt.example.com/admin' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'Your access has changed' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — **{{actorName}}** updated your role in the {{productName}} admin portal.',
      },
      { type: 'meta', items: [{ label: 'New role', value: '{{roleName}}' }] },
      { type: 'paragraph', text: '{{roleSummary}}' },
      { type: 'button', label: 'Open the admin portal', href: '{{adminUrl}}' },
      {
        type: 'paragraph',
        text: 'If this looks wrong, reply to this email or contact {{supportEmail}}.',
      },
    ],
  },

  // ── Account ──────────────────────────────────────────────────────────
  {
    key: 'welcome',
    name: 'Welcome',
    group: 'Account',
    description: 'Sent after someone creates an account in the consumer app.',
    trigger: 'A user upgrades from anonymous use to a saved account.',
    subject: 'Welcome to {{productName}}',
    preheader: 'Your progress now syncs across devices.',
    variables: [
      V.name,
      { key: 'appUrl', label: 'App URL', sample: 'https://pbt.example.com' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'Welcome aboard, {{name}}' },
      {
        type: 'paragraph',
        text: 'Your {{productName}} account is ready. Your ECHO profile, session history, and scorecards now follow you to any device you sign in on.',
      },
      {
        type: 'list',
        items: [
          'Run a roleplay any time — text or voice',
          'Track your ACT scores session over session',
          'Pick up saved scenarios where you left off',
        ],
      },
      { type: 'button', label: 'Start a session', href: '{{appUrl}}' },
      {
        type: 'callout',
        tone: 'info',
        text: 'Tip: your training data stays yours. You can opt out of it being used to improve the platform in Settings → Privacy.',
      },
    ],
  },
  {
    key: 'account_disabled',
    name: 'Account disabled',
    group: 'Account',
    description: 'Sent when an admin disables an account.',
    trigger: 'An admin disables an account from the Users screen.',
    subject: 'Your {{productName}} account has been disabled',
    preheader: 'You won’t be able to sign in until it’s re-enabled.',
    variables: [V.name, V.productName, V.supportEmail],
    blocks: [
      { type: 'heading', text: 'Your account has been disabled' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — your {{productName}} account has been disabled by an administrator. You won’t be able to sign in until it is re-enabled.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Your data has not been deleted. If you think this is a mistake, contact {{supportEmail}}.',
      },
    ],
  },

  // ── Security ─────────────────────────────────────────────────────────
  {
    key: 'password_reset',
    name: 'Password reset',
    group: 'Security',
    description: 'The reset link sent when someone forgets their password.',
    trigger: 'Someone requests a reset from the app or the admin sign-in screen.',
    subject: 'Reset your {{productName}} password',
    preheader: 'The link expires in {{expiresIn}}.',
    variables: [
      V.name,
      { key: 'resetUrl', label: 'Reset link', sample: 'https://pbt.example.com/reset#sample', required: true },
      { key: 'expiresIn', label: 'Link lifetime', sample: '1 hour' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'Reset your password' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — we received a request to reset the password for your {{productName}} account. Choose a new one below.',
      },
      { type: 'button', label: 'Choose a new password', href: '{{resetUrl}}' },
      {
        type: 'callout',
        tone: 'neutral',
        text: 'This link expires in {{expiresIn}} and can only be used once. If you didn’t request a reset, you can ignore this email — your password stays as it is.',
      },
    ],
  },
  {
    key: 'password_changed',
    name: 'Password changed',
    group: 'Security',
    description: 'Confirmation that a password was successfully changed.',
    trigger: 'A password reset completes, or a user changes their password.',
    subject: 'Your {{productName}} password was changed',
    preheader: 'If this wasn’t you, act now.',
    variables: [
      V.name,
      { key: 'changedAt', label: 'Changed at', sample: '4 August 2026 at 14:22 UTC' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'Your password was changed' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — the password on your {{productName}} account was changed on {{changedAt}}.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'If this wasn’t you, reset your password immediately and contact {{supportEmail}}.',
      },
    ],
  },
  {
    key: 'email_verify',
    name: 'Verify email address',
    group: 'Security',
    description: 'Confirms a new address. Used when email verification is enabled.',
    trigger: 'A user signs up while the EMAIL_VERIFICATION flag is on.',
    subject: 'Confirm your email for {{productName}}',
    preheader: 'One tap and you’re in.',
    variables: [
      V.name,
      { key: 'verifyUrl', label: 'Verification link', sample: 'https://pbt.example.com/verify?token=sample', required: true },
      { key: 'expiresIn', label: 'Link lifetime', sample: '24 hours' },
      V.productName,
      V.supportEmail,
    ],
    blocks: [
      { type: 'heading', text: 'Confirm your email' },
      {
        type: 'paragraph',
        text: 'Hi {{name}} — confirm this address to finish setting up your {{productName}} account.',
      },
      { type: 'button', label: 'Confirm email address', href: '{{verifyUrl}}' },
      {
        type: 'paragraph',
        text: 'The link expires in {{expiresIn}}. If you didn’t create an account, you can ignore this email.',
      },
    ],
  },
];

export const DEFAULT_TEMPLATE_KEYS = DEFAULT_TEMPLATES.map((t) => t.key);

export function getDefaultTemplate(key: string): TemplateDefinition | undefined {
  return DEFAULT_TEMPLATES.find((t) => t.key === key);
}

/** Sample values for preview + test sends, from each template's declarations. */
export function sampleVars(key: string): Record<string, string> {
  const def = getDefaultTemplate(key);
  if (!def) return {};
  return Object.fromEntries(def.variables.map((v) => [v.key, v.sample]));
}
