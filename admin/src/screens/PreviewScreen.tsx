/**
 * Live preview of the consumer app inside an iframe with postMessage-driven
 * flag overrides. The admin can stage flag values + scenario overrides on
 * the left pane and watch the consumer re-render on the right without
 * persisting anything to Supabase.
 *
 * Protocol (admin → iframe):
 *   { type: 'pbt:preview-flags', flags: {...}, scenarioOverrides: [...] }
 * (iframe → admin):
 *   { type: 'pbt:preview-ready' }
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { Glass } from '../primitives/Glass';
import { Eyebrow, SectionTitle, StatusPill } from '../primitives';
import { COLOR } from '../lib/tokens';
import { useFlagsSnapshot, useScenarioOverrides } from '../data/queries';
import type { FlagDef, ScenarioOverrideRow } from '../data/types';
import { Field, btnPrimary, btnSecondary, inputStyle } from './FlagsScreen';

const PREVIEW_URL = '/?pbt_preview=1';

type DeviceFrame = 'mobile' | 'tablet' | 'desktop';

const FRAME_WIDTH: Record<DeviceFrame, number> = {
  mobile: 390,
  tablet: 820,
  desktop: 1200,
};

export function PreviewScreen() {
  const snapshot = useFlagsSnapshot(0);
  const overrides = useScenarioOverrides(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<DeviceFrame>('mobile');
  const [previewFlags, setPreviewFlags] = useState<Record<string, unknown>>({});
  const [previewOverrides, setPreviewOverrides] = useState<ScenarioOverrideRow[]>([]);

  // Listen for the consumer's "ready" handshake.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string };
      if (data?.type === 'pbt:preview-ready') {
        setReady(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Push flag overrides to iframe on change.
  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'pbt:preview-flags',
        flags: previewFlags,
        scenarioOverrides: previewOverrides,
      },
      window.location.origin,
    );
  }, [ready, previewFlags, previewOverrides]);

  const flagsByKey = useMemo(() => {
    const m = new Map<string, FlagDef>();
    for (const f of snapshot.data.flags) m.set(f.key, f);
    return m;
  }, [snapshot.data.flags]);

  function reset() {
    setPreviewFlags({});
    setPreviewOverrides([]);
  }

  function loadCurrent() {
    setPreviewOverrides(overrides.data);
  }

  return (
    <>
      <ContextBar
        title="Preview"
        subtitle="Stage flag values in real time. Nothing here is saved — flip changes you like into a rule from the Flags screen."
      />
      <ScreenShell>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '380px minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* ── Left pane: flag editor ── */}
          <div style={{ display: 'grid', gap: 12 }}>
            <Glass padding={18} radius={18}>
              <SectionTitle title="Stage overrides" />
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={reset} style={btnSecondary}>
                  Reset
                </button>
                <button onClick={loadCurrent} style={btnSecondary}>
                  Load saved overrides
                </button>
              </div>
              <div style={{ marginTop: 14 }}>
                <Eyebrow>Status</Eyebrow>
                <div style={{ marginTop: 6 }}>
                  <StatusPill tone={ready ? 'success' : 'neutral'}>
                    {ready ? 'iframe connected' : 'waiting for iframe…'}
                  </StatusPill>
                </div>
              </div>
            </Glass>
            <Glass padding={18} radius={18} style={{ maxHeight: 600, overflowY: 'auto' }}>
              <Eyebrow>Boolean flags</Eyebrow>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {snapshot.data.flags
                  .filter((f) => f.value_type === 'boolean')
                  .map((f) => {
                    const stagedRaw = previewFlags[f.key];
                    const stagedVal =
                      stagedRaw === undefined ? (f.default_value as boolean) : (stagedRaw as boolean);
                    const staged = f.key in previewFlags;
                    return (
                      <label
                        key={f.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: staged ? 'rgba(245,200,90,0.15)' : 'transparent',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={stagedVal}
                          onChange={(e) =>
                            setPreviewFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))
                          }
                        />
                        <span
                          style={{
                            fontFamily: 'var(--pbt-mono)',
                            color: COLOR.ink,
                            fontSize: 11,
                            wordBreak: 'break-all',
                          }}
                        >
                          {f.key}
                        </span>
                      </label>
                    );
                  })}
              </div>
              <Eyebrow style={{ marginTop: 14 }}>String fields</Eyebrow>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {snapshot.data.flags
                  .filter((f) => f.value_type === 'string')
                  .map((f) => {
                    const v = previewFlags[f.key];
                    return (
                      <Field key={f.key} label={f.key.replace(/^field\./, '')}>
                        <input
                          value={typeof v === 'string' ? v : ''}
                          onChange={(e) =>
                            setPreviewFlags((prev) => ({
                              ...prev,
                              [f.key]: e.target.value,
                            }))
                          }
                          placeholder={String(f.default_value ?? '')}
                          style={inputStyle}
                        />
                      </Field>
                    );
                  })}
              </div>
            </Glass>
          </div>

          {/* ── Right pane: iframe ── */}
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['mobile', 'tablet', 'desktop'] as DeviceFrame[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrame(f)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: 'pointer',
                    background: frame === f ? COLOR.brand : 'rgba(60,20,15,0.06)',
                    color: frame === f ? '#fff' : COLOR.ink,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {f}
                </button>
              ))}
              <button
                onClick={() => iframeRef.current?.contentWindow?.location.reload()}
                style={{ ...btnSecondary, marginLeft: 'auto' }}
              >
                Reload iframe
              </button>
              {/* Use 'open in new tab' to debug full-page issues */}
              <a
                href={PREVIEW_URL}
                target="_blank"
                rel="noreferrer"
                style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}
              >
                Open in tab
              </a>
            </div>
            <Glass padding={0} radius={20} shine={false} style={{ overflow: 'hidden' }}>
              <iframe
                ref={iframeRef}
                src={PREVIEW_URL}
                title="Consumer preview"
                style={{
                  width: FRAME_WIDTH[frame],
                  maxWidth: '100%',
                  height: 760,
                  border: 'none',
                  display: 'block',
                  margin: '0 auto',
                  background: '#fff',
                }}
              />
            </Glass>
          </div>
        </div>
      </ScreenShell>
    </>
  );
}
