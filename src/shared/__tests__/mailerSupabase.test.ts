/**
 * The Supabase transport is a deliberately partial one, and "partial" is only
 * safe if the boundary is exact: every template it cannot carry has to be
 * reported, not quietly dropped. These lock that boundary to the shipped
 * template catalog so adding a template can't silently create a message that
 * nobody ever receives and no log row explains.
 */
import { describe, expect, it } from 'vitest';
import {
  SUPABASE_AUTH_TEMPLATES,
  configurationProblem,
  isConfigured,
  providerAdvisory,
  supabaseDeliveryBlock,
  type EmailSettings,
} from '../../../netlify/functions/_shared/mailer';
import { DEFAULT_TEMPLATES } from '../email/defaults';

const base = (over: Partial<EmailSettings> = {}): EmailSettings => ({
  provider: 'resend',
  fromEmail: 'no-reply@example.com',
  fromName: 'PBT',
  replyTo: '',
  resendApiKey: 're_test',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpSecure: false,
  appBaseUrl: 'https://example.com',
  brand: {} as EmailSettings['brand'],
  ...over,
});

describe('supabase transport capability', () => {
  it('carries password reset and address confirmation', () => {
    expect(SUPABASE_AUTH_TEMPLATES.password_reset).toBe('recovery');
    expect(SUPABASE_AUTH_TEMPLATES.email_verify).toBe('signup');
    expect(supabaseDeliveryBlock('password_reset')).toBeNull();
    expect(supabaseDeliveryBlock('email_verify')).toBeNull();
  });

  it('refuses admin invitations rather than stranding a passwordless account', () => {
    expect(supabaseDeliveryBlock('admin_invite')).toContain('auth email');
  });

  it('names every template it cannot deliver', () => {
    const undeliverable = DEFAULT_TEMPLATES.map((t) => t.key).filter(
      (key) => !SUPABASE_AUTH_TEMPLATES[key],
    );
    // If this list ever empties, the transport quietly became complete and the
    // advisory copy is now lying to admins.
    expect(undeliverable.length).toBeGreaterThan(0);
    for (const key of undeliverable) {
      const block = supabaseDeliveryBlock(key);
      expect(block, `${key} must explain itself`).toBeTruthy();
      expect(block).toContain(key);
    }
  });

  it('treats an unknown template as undeliverable', () => {
    expect(supabaseDeliveryBlock('not_a_real_template')).toBeTruthy();
  });
});

describe('supabase transport health', () => {
  it('needs no sender address or credentials of ours', () => {
    const s = base({ provider: 'supabase', fromEmail: '', resendApiKey: '' });
    expect(isConfigured(s)).toBe(true);
    expect(configurationProblem(s)).toBeNull();
  });

  it('still reports missing credentials for the real providers', () => {
    expect(configurationProblem(base({ resendApiKey: '' }))).toContain('Resend');
    expect(configurationProblem(base({ provider: 'smtp', smtpHost: '' }))).toContain('SMTP');
    expect(configurationProblem(base({ fromEmail: '' }))).toContain('sender address');
  });

  it('advises on the limits only for the built-in mailer', () => {
    const advisory = providerAdvisory(base({ provider: 'supabase' }));
    expect(advisory).toBeTruthy();
    // The three things an admin gets wrong if nobody tells them.
    expect(advisory).toContain('rate-limited');
    expect(advisory).toContain('Supabase');
    expect(advisory?.toLowerCase()).toContain('invitation');

    expect(providerAdvisory(base())).toBeNull();
    expect(providerAdvisory(base({ provider: 'smtp', smtpHost: 'smtp.example.com' }))).toBeNull();
  });
});
