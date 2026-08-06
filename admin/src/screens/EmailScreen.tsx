/**
 * Email — the transactional messaging surface.
 *
 *   Templates — pick a message, edit it, watch the preview update live
 *   Settings  — provider (Resend, SMTP, or Supabase's built-in), sender
 *               identity, brand
 *   Delivery  — what actually went out, and what failed
 */
import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import { EmptyState, LoadingShimmer } from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import {
  useEmailLog,
  useEmailSettings,
  useEmailTemplates,
  writeSettings,
  type EmailLogRow,
  type EmailProvider,
  type EmailSettingsPayload,
  type EmailTemplateRow,
} from '../data/email';
import { Field, btnPrimary, btnSecondary, inputStyle } from './FlagsScreen';
import { Callout, ErrorNote } from './TeamScreen';
import { EmailTemplateEditor } from './EmailTemplateEditor';

export type EmailTab = 'templates' | 'settings' | 'log';

export function EmailScreen({
  myPermissions,
  tab,
  onTab,
}: {
  myPermissions: string[];
  /** Controlled by the Email destination's section tabs. */
  tab: EmailTab;
  onTab: (t: EmailTab) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const templates = useEmailTemplates(refreshKey);
  const settings = useEmailSettings(refreshKey);
  const log = useEmailLog(refreshKey);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const list = templates.data?.templates ?? [];
  const selected = useMemo(
    () => list.find((t) => t.key === selectedKey) ?? list[0] ?? null,
    [list, selectedKey],
  );

  const canEdit = myPermissions.includes('email.templates.write');
  const canSend = myPermissions.includes('email.send');
  const problem = settings.data?.problem ?? null;
  const advisory = settings.data?.advisory ?? null;

  return (
    <>
      <ContextBar
        title="Email"
        subtitle="Branded transactional mail — templates, provider, and delivery"
        actions={<ProviderBadge settings={settings.data} />}
      />
      <ScreenShell>

        {problem && (
          <Callout tone="warn">
            <strong>Email isn’t sending yet.</strong> {problem}{' '}
            <button
              onClick={() => onTab('settings')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'inherit',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              Open settings
            </button>
          </Callout>
        )}

        {/* Not a failure — a working transport whose limits shape what the rest
            of this screen can actually do, so it belongs above the tabs too. */}
        {!problem && advisory && <Callout tone="warn">{advisory}</Callout>}

        {tab === 'templates' &&
          (templates.loading ? (
            <LoadingShimmer height={420} />
          ) : templates.error ? (
            <ErrorNote>{templates.error}</ErrorNote>
          ) : (
            <>
              <TemplatePicker
                templates={list}
                selectedKey={selected?.key ?? null}
                onSelect={setSelectedKey}
              />
              {selected && templates.data && (
                <EmailTemplateEditor
                  key={selected.key}
                  template={selected}
                  brand={templates.data.brand}
                  canEdit={canEdit}
                  canSend={canSend}
                  onSaved={refresh}
                />
              )}
            </>
          ))}

        {tab === 'settings' &&
          (settings.loading ? (
            <LoadingShimmer height={360} />
          ) : settings.error ? (
            <ErrorNote>{settings.error}</ErrorNote>
          ) : settings.data ? (
            <SettingsPanel settings={settings.data} onSaved={refresh} />
          ) : null)}

        {tab === 'log' &&
          (log.loading ? <LoadingShimmer height={320} /> : <DeliveryLog rows={log.data ?? []} />)}
      </ScreenShell>
    </>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────

const PROVIDER_LABEL: Record<EmailProvider, string> = {
  resend: 'Resend',
  smtp: 'SMTP',
  supabase: 'Supabase built-in',
};

const PROVIDER_CHOICES: ReadonlyArray<{ key: EmailProvider; label: string; blurb: string }> = [
  { key: 'resend', label: 'Resend', blurb: 'HTTPS API. Paste a key, verify a domain, done.' },
  { key: 'smtp', label: 'SMTP', blurb: 'Any provider or in-house relay, over TLS.' },
  {
    key: 'supabase',
    label: 'Supabase built-in',
    blurb: 'No setup. Auth mail only, rate-limited — a stopgap.',
  },
];

function ProviderBadge({ settings }: { settings: EmailSettingsPayload | null }) {
  if (!settings) return null;
  // The built-in mailer isn't broken, but calling it green would overstate a
  // transport that can't send most of these templates.
  const healthy = !settings.problem && !settings.advisory;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 12px',
        borderRadius: 11,
        background: healthy ? COLOR.successSoft : COLOR.warnSoft,
        color: healthy ? COLOR.success : COLOR.warn,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'currentColor',
        }}
      />
      {PROVIDER_LABEL[settings.provider] ?? settings.provider}
      {settings.provider === 'supabase'
        ? ' · auth mail only'
        : settings.fromEmail
          ? ` · ${settings.fromEmail}`
          : ' · no sender'}
    </div>
  );
}

// ── Template picker ────────────────────────────────────────────────────

/**
 * A horizontal grouped picker rather than a vertical rail: seven templates
 * don't need a whole column, and taking that column back is what lets the
 * editor and its preview sit side by side at a readable width.
 */
function TemplatePicker({
  templates,
  selectedKey,
  onSelect,
}: {
  templates: EmailTemplateRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, EmailTemplateRow[]>();
    for (const t of templates) {
      const list = map.get(t.group) ?? [];
      list.push(t);
      map.set(t.group, list);
    }
    return [...map.entries()];
  }, [templates]);

  return (
    <Glass padding={12} radius={16}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {groups.map(([group, items]) => (
          <div key={group} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: COLOR.inkMute,
                fontFamily: 'var(--pbt-mono)',
                paddingRight: 2,
              }}
            >
              {group}
            </span>
            {items.map((t) => {
              const active = t.key === selectedKey;
              return (
                <button
                  key={t.key}
                  onClick={() => onSelect(t.key)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    borderRadius: 10,
                    border: active ? 'none' : '0.5px solid rgba(60,20,15,0.1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--pbt-font)',
                    fontSize: 12.5,
                    fontWeight: active ? 800 : 600,
                    color: active ? '#fff' : COLOR.inkSoft,
                    background: active
                      ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.55 0.24 18))'
                      : 'rgba(255,255,255,0.65)',
                    boxShadow: active
                      ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 5px 12px -6px oklch(0.55 0.22 18 / 0.5)'
                      : 'none',
                  }}
                >
                  {t.name}
                  {!t.enabled && <Dot color={active ? 'rgba(255,255,255,0.7)' : COLOR.inkMute} title="Paused" />}
                  {t.customized && <Dot color={active ? '#fff' : COLOR.warn} title="Edited" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Glass>
  );
}

function Dot({ color, title }: { color: string; title: string }) {
  return (
    <span
      title={title}
      style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );
}

// ── Settings ───────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: EmailSettingsPayload;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState(settings.provider);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [fromName, setFromName] = useState(settings.fromName);
  const [replyTo, setReplyTo] = useState(settings.replyTo);
  const [appBaseUrl, setAppBaseUrl] = useState(settings.appBaseUrl);
  const [resendApiKey, setResendApiKey] = useState('');
  const [smtpHost, setSmtpHost] = useState(settings.smtpHost);
  const [smtpPort, setSmtpPort] = useState(settings.smtpPort);
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser);
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(settings.smtpSecure);
  const [brand, setBrand] = useState(settings.brand);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canEdit = settings.canEdit;

  async function run(kind: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run(
      'save',
      async () => {
        await writeSettings({
          op: 'update',
          provider,
          fromEmail,
          fromName,
          replyTo,
          appBaseUrl,
          smtpHost,
          smtpPort,
          smtpUser,
          smtpSecure,
          brand,
          // Only send credentials the admin actually typed — an untouched
          // field must not clear a stored secret.
          ...(resendApiKey ? { resendApiKey } : {}),
          ...(smtpPass ? { smtpPass } : {}),
        });
        setResendApiKey('');
        setSmtpPass('');
        onSaved();
      },
      'Settings saved.',
    );

  const test = () =>
    run(
      'test',
      async () => {
        const res = await writeSettings({ op: 'test', to: testTo.trim(), templateKey: 'password_reset' });
        if (res.status && res.status !== 'sent') throw new Error(res.error ?? `Delivery ${res.status}`);
      },
      `Test email sent to ${testTo.trim()}.`,
    );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16 }}>
      <Glass padding={22} radius={18}>
        <SectionHeading>Provider</SectionHeading>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {PROVIDER_CHOICES.map((p) => (
            <button
              key={p.key}
              disabled={!canEdit}
              onClick={() => setProvider(p.key)}
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '13px 15px',
                borderRadius: 13,
                cursor: canEdit ? 'pointer' : 'default',
                border:
                  provider === p.key
                    ? `1.5px solid ${COLOR.brand}`
                    : '1px solid rgba(60,20,15,0.1)',
                background: provider === p.key ? COLOR.brandSoft : 'rgba(255,255,255,0.6)',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 800, color: COLOR.ink }}>{p.label}</div>
              <div style={{ fontSize: 11.5, color: COLOR.inkSoft, marginTop: 3, lineHeight: 1.45 }}>
                {p.blurb}
              </div>
            </button>
          ))}
        </div>

        {provider === 'supabase' && (
          <Callout tone="warn">
            <strong>A stopgap, not a destination.</strong> Supabase’s built-in
            service sends <strong>password reset</strong> and{' '}
            <strong>address confirmation</strong> only, using the templates from
            your Supabase dashboard rather than the ones on the Templates tab,
            from Supabase’s sending address rather than yours. It is rate-limited
            (2 an hour by default) and documented as a testing service.
            Everything else — invitations, welcome, role-change and disabled
            notices — is recorded in the delivery log as skipped. Invitations
            still work: the portal shows a one-time link you can pass on
            directly, and you can grant portal access to an existing account
            from People → Admins with no email at all.
          </Callout>
        )}

        {provider === 'supabase' ? (
          // Nothing to configure: the project's own service role is the entire
          // credential, and the sender address is Supabase's, not ours.
          <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
            No credentials to enter — mail goes out through this Supabase
            project. The sender address, subject lines and wording all come from
            your Supabase dashboard under Authentication → Email Templates.
          </div>
        ) : provider === 'resend' ? (
          <Field
            label="Resend API key"
            help={
              settings.hasResendKey
                ? `A key is stored (${settings.resendKeyHint}). Leave blank to keep it.`
                : 'Starts with re_. Encrypted before it touches the database.'
            }
          >
            <input
              type="password"
              value={resendApiKey}
              disabled={!canEdit}
              onChange={(e) => setResendApiKey(e.target.value)}
              placeholder={settings.hasResendKey ? '•••••••••••••••' : 're_…'}
              style={inputStyle}
              autoComplete="new-password"
            />
          </Field>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="Host">
                <input
                  value={smtpHost}
                  disabled={!canEdit}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.postmarkapp.com"
                  style={inputStyle}
                />
              </Field>
              <Field label="Port">
                <input
                  type="number"
                  value={smtpPort}
                  disabled={!canEdit}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Username">
                <input
                  value={smtpUser}
                  disabled={!canEdit}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  style={inputStyle}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Password"
                help={settings.hasSmtpPass ? 'Stored. Leave blank to keep.' : undefined}
              >
                <input
                  type="password"
                  value={smtpPass}
                  disabled={!canEdit}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={settings.hasSmtpPass ? '•••••••••' : ''}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <label style={checkboxRow}>
              <input
                type="checkbox"
                checked={smtpSecure}
                disabled={!canEdit}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              Implicit TLS (port 465). Leave off for STARTTLS on 587.
            </label>
          </div>
        )}

        <SectionHeading style={{ marginTop: 22 }}>Sender identity</SectionHeading>
        {provider === 'supabase' && (
          <div style={{ fontSize: 12, color: COLOR.warn, marginBottom: 10, lineHeight: 1.5 }}>
            Kept for when you switch to Resend or SMTP — the built-in mailer
            ignores it and sends from Supabase’s own address.
          </div>
        )}
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
            <Field label="From name">
              <input
                value={fromName}
                disabled={!canEdit}
                onChange={(e) => setFromName(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="From address" help="Must be on a domain your provider has verified.">
              <input
                type="email"
                value={fromEmail}
                disabled={!canEdit}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="no-reply@yourclinic.com"
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Reply-to" help="Where replies land. Also shown as the support address in emails.">
            <input
              type="email"
              value={replyTo}
              disabled={!canEdit}
              onChange={(e) => setReplyTo(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field
            label="App base URL"
            help="Used to build invite and reset links. Must be the public URL of this deploy."
          >
            <input
              value={appBaseUrl}
              disabled={!canEdit}
              onChange={(e) => setAppBaseUrl(e.target.value)}
              placeholder="https://pbt.example.com"
              style={inputStyle}
            />
          </Field>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <SuccessNote>{notice}</SuccessNote>}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={btnPrimary} disabled={busy !== null} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}

        {settings.canSend && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginTop: 16,
              paddingTop: 14,
              borderTop: '0.5px solid rgba(60,20,15,0.07)',
            }}
          >
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@clinic.com"
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button
              style={{ ...btnSecondary, opacity: /@/.test(testTo) && !busy ? 1 : 0.5 }}
              disabled={!/@/.test(testTo) || busy !== null}
              onClick={() => void test()}
            >
              {busy === 'test' ? 'Sending…' : 'Send test email'}
            </button>
          </div>
        )}
      </Glass>

      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <Glass padding={22} radius={18}>
          <SectionHeading>Brand</SectionHeading>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 10 }}>
              <Field label="Product name">
                <input
                  value={brand.productName}
                  disabled={!canEdit}
                  onChange={(e) => setBrand({ ...brand, productName: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Logo mark" help="1–3 characters.">
                <input
                  value={brand.logoText}
                  disabled={!canEdit}
                  maxLength={3}
                  onChange={(e) => setBrand({ ...brand, logoText: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Accent" help="Hex only — inline styles in email.">
                <ColorField
                  value={brand.accent}
                  disabled={!canEdit}
                  onChange={(v) => setBrand({ ...brand, accent: v })}
                />
              </Field>
              <Field label="Accent (deep)" help="Bottom of the button gradient.">
                <ColorField
                  value={brand.accentDeep}
                  disabled={!canEdit}
                  onChange={(v) => setBrand({ ...brand, accentDeep: v })}
                />
              </Field>
            </div>
            <Field label="Footer note">
              <textarea
                value={brand.footerNote}
                disabled={!canEdit}
                onChange={(e) => setBrand({ ...brand, footerNote: e.target.value })}
                style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
              />
            </Field>
          </div>
        </Glass>

        <Glass padding={22} radius={18}>
          <SectionHeading>Security</SectionHeading>
          <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
            <FactRow
              label="Credential storage"
              value={
                settings.origin.credentials === 'database'
                  ? 'Encrypted in the database'
                  : settings.origin.credentials === 'env'
                    ? 'From environment variables'
                    : 'Not configured'
              }
            />
            <FactRow
              label="Encryption key"
              value={
                settings.dedicatedSecretKey
                  ? 'Dedicated EMAIL_SECRET_KEY'
                  : 'Derived from the service-role key'
              }
              warn={!settings.dedicatedSecretKey}
            />
            <FactRow
              label="Last changed"
              value={settings.updatedAt ? fmtAgo(new Date(settings.updatedAt).getTime()) : 'Never'}
            />
          </dl>
          {!settings.dedicatedSecretKey && (
            <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 12, lineHeight: 1.55 }}>
              Set <code>EMAIL_SECRET_KEY</code> in the deploy environment so
              rotating the Supabase service-role key doesn’t also invalidate
              stored email credentials.
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function ColorField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#db0027'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 34,
          height: 32,
          padding: 2,
          borderRadius: 8,
          border: '1px solid rgba(60,20,15,0.12)',
          background: 'transparent',
          cursor: disabled ? 'default' : 'pointer',
        }}
      />
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, fontFamily: 'var(--pbt-mono)', fontSize: 12 }}
      />
    </div>
  );
}

function FactRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <dt style={{ fontSize: 12, color: COLOR.inkMute }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 700,
          color: warn ? COLOR.warn : COLOR.ink,
          textAlign: 'right',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

// ── Delivery log ───────────────────────────────────────────────────────

const LOG_GRID = '110px 1.4fr 1.6fr 90px 130px';

function DeliveryLog({ rows }: { rows: EmailLogRow[] }) {
  if (!rows.length) {
    return (
      <Glass padding={0} radius={20}>
        <EmptyState
          title="Nothing sent yet"
          subtitle="Invitations, resets, and test sends will appear here"
        />
      </Glass>
    );
  }
  const tone = (s: EmailLogRow['status']) =>
    s === 'sent'
      ? { bg: COLOR.successSoft, fg: COLOR.success }
      : s === 'failed'
        ? { bg: COLOR.dangerSoft, fg: COLOR.danger }
        : { bg: COLOR.warnSoft, fg: COLOR.warn };

  return (
    <Glass padding={0} radius={20}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: LOG_GRID,
          gap: 14,
          padding: '13px 22px',
          background: 'rgba(255,255,255,0.5)',
          borderBottom: '0.5px solid rgba(60,20,15,0.06)',
        }}
      >
        {['Status', 'Recipient', 'Subject', 'Via', 'When'].map((h) => (
          <div
            key={h}
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: COLOR.inkMute,
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((r) => {
        const t = tone(r.status);
        return (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: LOG_GRID,
              gap: 14,
              padding: '12px 22px',
              alignItems: 'center',
              borderBottom: '0.5px solid rgba(60,20,15,0.04)',
            }}
          >
            <span
              style={{
                justifySelf: 'start',
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.09em',
                padding: '3px 8px',
                borderRadius: 6,
                background: t.bg,
                color: t.fg,
              }}
            >
              {r.status.toUpperCase()}
            </span>
            <div style={{ fontSize: 12.5, color: COLOR.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.to_email}
              <div style={{ fontSize: 11, color: COLOR.inkMute }}>{r.template_key}</div>
            </div>
            <div style={{ fontSize: 12.5, color: COLOR.inkSoft, minWidth: 0 }}>
              {r.subject || '—'}
              {r.error && (
                <div style={{ fontSize: 11, color: COLOR.danger, marginTop: 2 }}>{r.error}</div>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLOR.inkMute }}>{r.provider}</div>
            <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
              {fmtAgo(new Date(r.created_at).getTime())}
            </div>
          </div>
        );
      })}
    </Glass>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────

function SectionHeading({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: COLOR.inkMute,
        fontFamily: 'var(--pbt-mono)',
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: COLOR.success,
        background: COLOR.successSoft,
        padding: '9px 12px',
        borderRadius: 10,
        marginTop: 10,
      }}
    >
      {children}
    </div>
  );
}

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12.5,
  color: COLOR.inkSoft,
  cursor: 'pointer',
};
