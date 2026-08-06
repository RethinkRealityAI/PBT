/**
 * Email template editor + live preview.
 *
 * The preview is not a mock-up: it calls the same `renderEmail` the sender
 * calls, so the iframe shows the exact HTML that will land in the inbox.
 * Device and theme toggles change how it's framed, never what's rendered —
 * except the dark toggle, which force-applies the same rules the email's own
 * `prefers-color-scheme` block would trigger on a dark-mode client.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COLOR } from '../lib/tokens';
import { Glass } from '../primitives/Glass';
import { PillButton } from '../primitives';
import { Field, btnPrimary, btnSecondary, inputStyle } from './FlagsScreen';
import { Callout, ErrorNote } from './TeamScreen';
import { writeTemplate, type EmailTemplateRow } from '../data/email';
import { renderEmail } from '../../../src/shared/email/render';
import type { EmailBlock, EmailBrand } from '../../../src/shared/email/types';

type Device = 'desktop' | 'mobile';
type Theme = 'light' | 'dark';

const BLOCK_LABEL: Record<EmailBlock['type'], string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  button: 'Button',
  callout: 'Callout',
  list: 'Bullet list',
  meta: 'Detail table',
  code: 'Code / token',
  divider: 'Divider',
};

const NEW_BLOCK: Record<EmailBlock['type'], () => EmailBlock> = {
  heading: () => ({ type: 'heading', text: 'Heading' }),
  paragraph: () => ({ type: 'paragraph', text: 'Write something useful here.' }),
  button: () => ({ type: 'button', label: 'Open', href: '{{siteUrl}}' }),
  callout: () => ({ type: 'callout', text: 'Something worth noticing.', tone: 'neutral' }),
  list: () => ({ type: 'list', items: ['First point', 'Second point'] }),
  meta: () => ({ type: 'meta', items: [{ label: 'Label', value: 'Value' }] }),
  code: () => ({ type: 'code', text: '123456' }),
  divider: () => ({ type: 'divider' }),
};

/** The dark rules from the email's own media query, forced on for preview. */
const DARK_FORCE = `<style>
  .pbt-bg{background:#140506!important}
  .pbt-card{background:#1d0b0c!important;border-color:#38201f!important}
  .pbt-ink{color:#fbf4f2!important}
  .pbt-body{color:#d3bebc!important}
  .pbt-muted{color:#a48d8b!important}
  .pbt-panel{background:#251111!important;border-color:#3d2323!important}
  .pbt-rule{background:#3d2323!important}
  h1{color:#fbf4f2!important}
  p{color:#d3bebc!important}
</style>`;

export function EmailTemplateEditor({
  template,
  brand,
  canEdit,
  canSend,
  onSaved,
}: {
  template: EmailTemplateRow;
  brand: EmailBrand;
  canEdit: boolean;
  canSend: boolean;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [preheader, setPreheader] = useState(template.preheader);
  const [blocks, setBlocks] = useState<EmailBlock[]>(template.blocks);
  const [enabled, setEnabled] = useState(template.enabled);
  const [rawMode, setRawMode] = useState(Boolean(template.htmlOverride));
  const [htmlOverride, setHtmlOverride] = useState(template.htmlOverride ?? '');
  const [device, setDevice] = useState<Device>('desktop');
  const [theme, setTheme] = useState<Theme>('light');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  // Switching templates in the sidebar re-seeds the editor state.
  useEffect(() => {
    setSubject(template.subject);
    setPreheader(template.preheader);
    setBlocks(template.blocks);
    setEnabled(template.enabled);
    setRawMode(Boolean(template.htmlOverride));
    setHtmlOverride(template.htmlOverride ?? '');
    setError(null);
    setNotice(null);
  }, [template]);

  const vars = useMemo(
    () => Object.fromEntries(template.variables.map((v) => [v.key, v.sample])),
    [template.variables],
  );

  const rendered = useMemo(() => {
    try {
      return renderEmail({
        template: {
          key: template.key,
          name: template.name,
          description: template.description,
          subject,
          preheader,
          blocks,
          htmlOverride: rawMode ? htmlOverride : null,
        },
        vars,
        brand,
      });
    } catch (err) {
      return {
        subject,
        html: `<p style="font-family:sans-serif;padding:24px;color:#b6001f">Preview failed: ${String(err)}</p>`,
        text: '',
      };
    }
  }, [template.key, template.name, template.description, subject, preheader, blocks, rawMode, htmlOverride, vars, brand]);

  const previewHtml =
    theme === 'dark' ? rendered.html.replace('</head>', `${DARK_FORCE}</head>`) : rendered.html;

  const dirty =
    subject !== template.subject ||
    preheader !== template.preheader ||
    enabled !== template.enabled ||
    JSON.stringify(blocks) !== JSON.stringify(template.blocks) ||
    (rawMode ? htmlOverride : null) !== (template.htmlOverride ?? null);

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
        await writeTemplate({
          op: 'save',
          key: template.key,
          name: template.name,
          subject,
          preheader,
          blocks,
          htmlOverride: rawMode ? htmlOverride : null,
          enabled,
        });
        onSaved();
      },
      'Saved.',
    );

  const reset = () =>
    run(
      'reset',
      async () => {
        await writeTemplate({ op: 'reset', key: template.key });
        onSaved();
      },
      'Restored the shipped default.',
    );

  const sendTest = () =>
    run(
      'test',
      async () => {
        const res = await writeTemplate({ op: 'test', key: template.key, to: testTo.trim() });
        if (res.status && res.status !== 'sent') {
          throw new Error(res.error ?? `Delivery ${res.status}`);
        }
      },
      `Test sent to ${testTo.trim()}.`,
    );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
      {/* ── Editor ─────────────────────────────────────────── */}
      <Glass padding={20} radius={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: COLOR.ink }}>{template.name}</div>
            <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 3, maxWidth: 460, lineHeight: 1.5 }}>
              {template.trigger}
            </div>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              color: enabled ? COLOR.success : COLOR.inkMute,
              cursor: canEdit ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {enabled ? 'Sending' : 'Paused'}
          </label>
        </div>

        {template.customized && (
          <div style={{ fontSize: 11, color: COLOR.warn, fontWeight: 700, marginTop: 8 }}>
            EDITED — differs from the shipped default
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Preview line" help="The grey text next to the subject in most inboxes.">
            <input
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              style={inputStyle}
              disabled={!canEdit}
            />
          </Field>
        </div>

        <VariableChips variables={template.variables} />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            margin: '18px 0 8px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink }}>Content</div>
          {canEdit && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COLOR.inkMute }}>
              <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)} />
              Raw HTML
            </label>
          )}
        </div>

        {rawMode ? (
          <>
            <Callout tone="warn">
              Raw HTML bypasses the branded shell — you own the whole document,
              including dark mode and mobile widths. Clear this box to go back
              to blocks.
            </Callout>
            <textarea
              value={htmlOverride}
              onChange={(e) => setHtmlOverride(e.target.value)}
              disabled={!canEdit}
              spellCheck={false}
              style={{
                ...inputStyle,
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11.5,
                minHeight: 320,
                resize: 'vertical',
              }}
            />
          </>
        ) : (
          <BlockList blocks={blocks} onChange={setBlocks} canEdit={canEdit} />
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && (
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
            {notice}
          </div>
        )}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              style={{ ...btnPrimary, opacity: dirty && !busy ? 1 : 0.5 }}
              disabled={!dirty || busy !== null}
              onClick={() => void save()}
            >
              {busy === 'save' ? 'Saving…' : 'Save template'}
            </button>
            {template.customized && (
              <button style={btnSecondary} disabled={busy !== null} onClick={() => void reset()}>
                {busy === 'reset' ? 'Restoring…' : 'Reset to default'}
              </button>
            )}
          </div>
        )}

        {canSend && (
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
              style={{ ...inputStyle, maxWidth: 260 }}
            />
            <button
              style={{ ...btnSecondary, opacity: /@/.test(testTo) && !busy ? 1 : 0.5 }}
              disabled={!/@/.test(testTo) || busy !== null}
              onClick={() => void sendTest()}
            >
              {busy === 'test' ? 'Sending…' : 'Send test'}
            </button>
            <span style={{ fontSize: 11.5, color: COLOR.inkMute }}>
              Sends the saved version with sample data.
            </span>
          </div>
        )}
      </Glass>

      {/* ── Preview ────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 78, alignSelf: 'start' }}>
        <Glass padding={16} radius={18}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <PillButton active={device === 'desktop'} onClick={() => setDevice('desktop')} size="sm">
              Desktop
            </PillButton>
            <PillButton active={device === 'mobile'} onClick={() => setDevice('mobile')} size="sm">
              Mobile
            </PillButton>
            <div style={{ width: 1, height: 18, background: 'rgba(60,20,15,0.1)', margin: '0 4px' }} />
            <PillButton active={theme === 'light'} onClick={() => setTheme('light')} size="sm">
              Light
            </PillButton>
            <PillButton active={theme === 'dark'} onClick={() => setTheme('dark')} size="sm">
              Dark
            </PillButton>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(60,20,15,0.04)',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{rendered.subject}</div>
            <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 2 }}>
              {preheader ? renderPreheader(preheader, vars) : 'No preview line'}
            </div>
          </div>

          <PreviewFrame html={previewHtml} device={device} theme={theme} />

          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 11.5, color: COLOR.inkMute, cursor: 'pointer' }}>
              Plain-text version
            </summary>
            <pre
              style={{
                marginTop: 8,
                fontFamily: 'var(--pbt-mono)',
                fontSize: 11,
                lineHeight: 1.55,
                color: COLOR.inkSoft,
                whiteSpace: 'pre-wrap',
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {rendered.text}
            </pre>
          </details>
        </Glass>
      </div>
    </div>
  );
}

/**
 * The email is a fixed 600px table, and the preview pane is narrower than that
 * on most laptops. Rendering it at true width and scaling the whole frame down
 * keeps the proportions honest — squeezing the iframe instead would reflow the
 * layout into something no mail client would ever produce.
 */
const FRAME_WIDTH: Record<Device, number> = { desktop: 660, mobile: 390 };
const FRAME_HEIGHT = 640;

function PreviewFrame({
  html,
  device,
  theme,
}: {
  html: string;
  device: Device;
  theme: Theme;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const width = FRAME_WIDTH[device];
  const scale = available ? Math.min(1, available / width) : 1;
  // Scaling happens around the top-left corner, so centring is a margin, not
  // `margin: auto` — the element's layout box keeps its unscaled width.
  const offset = Math.max(0, (available - width * scale) / 2);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setAvailable(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        background: theme === 'dark' ? '#140506' : '#f6f1ef',
        borderRadius: 14,
        border: '0.5px solid rgba(60,20,15,0.08)',
        overflow: 'hidden',
        // Reserve the scaled height so the panel doesn't jump on resize.
        height: FRAME_HEIGHT * scale,
      }}
    >
      <div
        style={{
          width,
          height: FRAME_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          marginLeft: offset,
        }}
      >
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            colorScheme: theme,
          }}
        />
      </div>
    </div>
  );
}

function renderPreheader(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

// ── Variable chips ─────────────────────────────────────────────────────

function VariableChips({ variables }: { variables: EmailTemplateRow['variables'] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!variables.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          fontFamily: 'var(--pbt-mono)',
          marginBottom: 7,
        }}
      >
        Variables — click to copy
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {variables.map((v) => (
          <button
            key={v.key}
            title={`${v.label} — e.g. ${v.sample}`}
            onClick={() => {
              void navigator.clipboard?.writeText(`{{${v.key}}}`);
              setCopied(v.key);
              window.setTimeout(() => setCopied(null), 1200);
            }}
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 7,
              border: '0.5px solid rgba(60,20,15,0.1)',
              background: copied === v.key ? COLOR.successSoft : 'rgba(255,255,255,0.7)',
              color: copied === v.key ? COLOR.success : COLOR.inkSoft,
              cursor: 'pointer',
            }}
          >
            {copied === v.key ? 'copied!' : `{{${v.key}}}`}
            {v.required && <span style={{ color: COLOR.brand }}> *</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Block list ─────────────────────────────────────────────────────────

function BlockList({
  blocks,
  onChange,
  canEdit,
}: {
  blocks: EmailBlock[];
  onChange: (b: EmailBlock[]) => void;
  canEdit: boolean;
}) {
  const update = (i: number, next: EmailBlock) =>
    onChange(blocks.map((b, idx) => (idx === i ? next : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {blocks.map((block, i) => (
        <div
          key={`${block.type}-${i}`}
          style={{
            borderRadius: 12,
            border: '0.5px solid rgba(60,20,15,0.09)',
            background: 'rgba(255,255,255,0.55)',
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: COLOR.inkMute,
                fontFamily: 'var(--pbt-mono)',
              }}
            >
              {BLOCK_LABEL[block.type]}
            </span>
            <div style={{ flex: 1 }} />
            {canEdit && (
              <>
                <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </IconBtn>
                <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>
                  ↓
                </IconBtn>
                <IconBtn
                  label="Remove block"
                  danger
                  onClick={() => onChange(blocks.filter((_, idx) => idx !== i))}
                >
                  ✕
                </IconBtn>
              </>
            )}
          </div>
          <BlockFields block={block} onChange={(b) => update(i, b)} canEdit={canEdit} />
        </div>
      ))}

      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {(Object.keys(BLOCK_LABEL) as Array<EmailBlock['type']>).map((type) => (
            <button
              key={type}
              onClick={() => onChange([...blocks, NEW_BLOCK[type]()])}
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                padding: '5px 10px',
                borderRadius: 8,
                border: '0.5px dashed rgba(60,20,15,0.2)',
                background: 'transparent',
                color: COLOR.inkSoft,
                cursor: 'pointer',
              }}
            >
              + {BLOCK_LABEL[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockFields({
  block,
  onChange,
  canEdit,
}: {
  block: EmailBlock;
  onChange: (b: EmailBlock) => void;
  canEdit: boolean;
}) {
  const area: React.CSSProperties = {
    ...inputStyle,
    minHeight: 54,
    resize: 'vertical',
    fontSize: 12.5,
  };

  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
    case 'code':
      return (
        <>
          <textarea
            value={block.text}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...block, text: e.target.value } as EmailBlock)}
            style={block.type === 'heading' ? { ...area, minHeight: 38 } : area}
          />
          {block.type === 'callout' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(['neutral', 'info', 'success', 'warn'] as const).map((tone) => (
                <button
                  key={tone}
                  disabled={!canEdit}
                  onClick={() => onChange({ ...block, tone })}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 9px',
                    borderRadius: 7,
                    border: 'none',
                    cursor: 'pointer',
                    background:
                      block.tone === tone || (!block.tone && tone === 'neutral')
                        ? COLOR.brand
                        : 'rgba(60,20,15,0.06)',
                    color:
                      block.tone === tone || (!block.tone && tone === 'neutral') ? '#fff' : COLOR.inkSoft,
                  }}
                >
                  {tone}
                </button>
              ))}
            </div>
          )}
        </>
      );

    case 'button':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
          <input
            value={block.label}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            style={inputStyle}
            placeholder="Label"
          />
          <input
            value={block.href}
            disabled={!canEdit}
            onChange={(e) => onChange({ ...block, href: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'var(--pbt-mono)', fontSize: 12 }}
            placeholder="{{acceptUrl}}"
          />
        </div>
      );

    case 'list':
      return (
        <textarea
          value={block.items.join('\n')}
          disabled={!canEdit}
          onChange={(e) => onChange({ ...block, items: e.target.value.split('\n') })}
          style={area}
          placeholder="One bullet per line"
        />
      );

    case 'meta':
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 30px', gap: 6 }}>
              <input
                value={item.label}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    ...block,
                    items: block.items.map((it, idx) =>
                      idx === i ? { ...it, label: e.target.value } : it,
                    ),
                  })
                }
                style={inputStyle}
              />
              <input
                value={item.value}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    ...block,
                    items: block.items.map((it, idx) =>
                      idx === i ? { ...it, value: e.target.value } : it,
                    ),
                  })
                }
                style={inputStyle}
              />
              {canEdit && (
                <IconBtn
                  label="Remove row"
                  danger
                  onClick={() => onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) })}
                >
                  ✕
                </IconBtn>
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={() => onChange({ ...block, items: [...block.items, { label: '', value: '' }] })}
              style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11.5, justifySelf: 'start' }}
            >
              + Row
            </button>
          )}
        </div>
      );

    case 'divider':
      return <div style={{ height: 1, background: 'rgba(60,20,15,0.12)', margin: '4px 0' }} />;

    default:
      return null;
  }
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: 'rgba(60,20,15,0.05)',
        color: danger ? COLOR.danger : COLOR.inkSoft,
        opacity: disabled ? 0.35 : 1,
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}
