/**
 * Admin data hooks for transactional email — templates, provider settings,
 * and the delivery log.
 */
import { useEffect, useState } from 'react';
import { apiFetch, postJson, rangeToSince } from '../lib/api';
import type { EmailBlock, EmailBrand, TemplateVariable } from '../../../src/shared/email/types';

export interface EmailTemplateRow {
  key: string;
  name: string;
  group: 'Team' | 'Account' | 'Security';
  description: string;
  trigger: string;
  variables: TemplateVariable[];
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  htmlOverride: string | null;
  enabled: boolean;
  customized: boolean;
  updatedAt: string | null;
}

export interface TemplatesPayload {
  templates: EmailTemplateRow[];
  brand: EmailBrand;
  canEdit: boolean;
  canSend: boolean;
  problem: string | null;
}

export type EmailProvider = 'resend' | 'smtp' | 'supabase';

export interface EmailSettingsPayload {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpSecure: boolean;
  appBaseUrl: string;
  brand: EmailBrand;
  hasResendKey: boolean;
  hasSmtpPass: boolean;
  resendKeyHint: string;
  origin: { credentials: 'database' | 'env' | 'none'; sender: 'database' | 'env' | 'none' };
  problem: string | null;
  /** Working, but with caveats worth stating — currently the Supabase transport. */
  advisory: string | null;
  dedicatedSecretKey: boolean;
  updatedAt: string | null;
  canEdit: boolean;
  canSend: boolean;
}

export interface EmailLogRow {
  id: string;
  template_key: string;
  to_email: string;
  subject: string;
  provider: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useResource<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown>): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useEmailTemplates = (refreshKey = 0) =>
  useResource<TemplatesPayload>(() => apiFetch<TemplatesPayload>('admin-email-templates'), [refreshKey]);

export const useEmailSettings = (refreshKey = 0) =>
  useResource<EmailSettingsPayload>(() => apiFetch<EmailSettingsPayload>('admin-email-settings'), [refreshKey]);

export const useEmailLog = (refreshKey = 0, days = 28) =>
  useResource<EmailLogRow[]>(
    () => apiFetch<EmailLogRow[]>('admin-email-log', { since: rangeToSince(`${days}d`), limit: 200 }),
    [refreshKey, days],
  );

export interface SaveTemplateBody {
  op: 'save' | 'reset' | 'test';
  key: string;
  name?: string;
  subject?: string;
  preheader?: string;
  blocks?: EmailBlock[];
  htmlOverride?: string | null;
  enabled?: boolean;
  to?: string;
}

export const writeTemplate = (body: SaveTemplateBody) =>
  postJson<{ ok?: true; status?: string; error?: string }>('admin-email-templates', body);

export interface SaveSettingsBody {
  op: 'update' | 'test';
  provider?: EmailProvider;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  resendApiKey?: string;
  appBaseUrl?: string;
  brand?: Partial<EmailBrand>;
  to?: string;
  templateKey?: string;
}

export const writeSettings = (body: SaveSettingsBody) =>
  postJson<{ ok?: true; problem?: string | null; status?: string; error?: string }>(
    'admin-email-settings',
    body,
  );
