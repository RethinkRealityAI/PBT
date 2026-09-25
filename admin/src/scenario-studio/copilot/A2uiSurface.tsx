/**
 * A2UI v0.9.1 renderer for the Scenario Studio assistant — ported from
 * PhotoBoothAR's src/components/a2ui/A2uiSurface.tsx onto the PBT admin look
 * (inline styles, admin tokens, the Studio vocabulary in ../ui.tsx).
 *
 * The tree is rebuilt from the surface's flat component map starting at id
 * "root". Only the catalog below renders; an unknown component type renders
 * nothing (warned once) — surfaces can only invoke trusted components, which
 * is the A2UI security model. Inputs write through `onDataChange` (two-way
 * binding); a Button's `action.event` fires `onAction` with its context
 * resolved against the data model AT CLICK TIME, so a confirm sees edits.
 *
 * ── Basic catalog ──────────────────────────────────────────────────────
 *   Card        { child }
 *   Column/List { children: id[] | { path, componentId } (templated),
 *                 justify?, align? }
 *   Row         { children, justify?: start|center|end|spaceBetween, align? }
 *   Text        { text, variant?: h3|h4|body|caption|quote }
 *   Divider     {}
 *   Button      { child, variant?: primary|secondary|borderless,
 *                 action: { event: { name, context } } }
 *   TextField   { label?, value (binding), multiline?, maxLength?, placeholder? }
 *   ChoicePicker{ label?, value (binding), options: {label, value}[] }
 *   CheckBox    { label, value (boolean binding) }
 *
 * ── Studio widgets (PBT_STUDIO_CATALOG_ID) ─────────────────────────────
 *   FieldChange { label: string, before: string (display text, '—' = unset),
 *                 value: binding, kind: 'text'|'long'|'choice',
 *                 options?: {label, value}[] (choice), maxLength? }
 *                 → "Now: <before>" (muted, struck) above the proposed value,
 *                   editable in place.
 *   DocOption   { title: string, meta: string, value: boolean binding }
 *                 → a selectable knowledge-document row.
 *   DriverSwatch{ driver: string | binding }
 *                 → a small chip tinted with the ECHO driver's colour, with
 *                   its one-line blurb. Renders nothing for a non-driver.
 *
 * `busy` disables buttons (the assistant is thinking); `readOnly` disables
 * every control (a role that can't edit scenarios).
 */
import {
  Fragment,
  memo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  resolveBindingPath,
  resolveContext,
  resolveDynamic,
  type A2uiActionEvent,
  type A2uiComponent,
  type SurfaceState,
} from '../../lib/a2ui';
import { COLOR, DRIVERS, RADIUS, type DriverKey } from '../../lib/tokens';
import { Glass } from '../../primitives/Glass';
import { Chip } from '../ui';
import { DRIVER_BLURBS } from '../../../../src/shared/ai/scenarioAgent';

export interface A2uiSurfaceProps {
  surface: SurfaceState;
  onAction: (event: A2uiActionEvent) => void;
  onDataChange: (surfaceId: string, path: string, value: unknown) => void;
  /** Disables actions while the assistant is thinking. */
  busy?: boolean;
  /** Disables every control (view-only roles). */
  readOnly?: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────

const TEXT_STYLES: Record<string, CSSProperties> = {
  h3: { fontSize: 16, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.015em', lineHeight: 1.3 },
  h4: { fontSize: 14.5, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.01em', lineHeight: 1.35 },
  body: { fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.55 },
  caption: { fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 },
  quote: {
    fontSize: 13,
    fontStyle: 'italic',
    color: COLOR.ink,
    lineHeight: 1.55,
    borderLeft: `3px solid ${COLOR.brandSoft}`,
    paddingLeft: 10,
  },
};

const JUSTIFY: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
};

const ALIGN: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.85)',
  fontSize: 13.5,
  lineHeight: 1.5,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

const labelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: COLOR.ink,
  letterSpacing: '-0.005em',
};

function buttonStyle(variant: string, disabled: boolean): CSSProperties {
  const base: CSSProperties = {
    fontFamily: 'var(--pbt-font)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    lineHeight: 1.4,
  };
  if (variant === 'borderless') {
    return {
      ...base,
      padding: '7px 10px',
      border: 'none',
      background: 'transparent',
      color: COLOR.inkSoft,
      fontSize: 12.5,
      fontWeight: 650,
      borderRadius: 999,
    };
  }
  if (variant === 'secondary') {
    return {
      ...base,
      padding: '8px 12px',
      border: '1px solid rgba(60,20,15,0.14)',
      background: 'rgba(255,255,255,0.88)',
      color: COLOR.ink,
      fontSize: 13,
      fontWeight: 600,
      borderRadius: RADIUS.md,
      textAlign: 'left',
      whiteSpace: 'normal',
    };
  }
  return {
    ...base,
    padding: '8px 18px',
    border: `1px solid ${COLOR.brand}`,
    background: COLOR.brand,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 999,
    boxShadow: `0 6px 16px -10px ${COLOR.brand}`,
  };
}

// ── Leaf widgets with their own hooks ────────────────────────────────────

/** A textarea that grows with its content (up to `maxHeight`, then scrolls). */
function AutoTextArea({
  value,
  onChange,
  disabled,
  maxLength,
  placeholder,
  ariaLabel,
  maxHeight = 220,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  ariaLabel?: string;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
  }, [value, maxHeight]);
  return (
    <textarea
      ref={ref}
      className="pbt-studio-field"
      value={value}
      rows={2}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...fieldStyle, resize: 'none', overflowY: 'auto', minHeight: 64 }}
    />
  );
}

/** "123/400" — only once the admin is close to the cap. */
function NearLimit({ length, max }: { length: number; max?: number }) {
  if (!max || length < max * 0.8) return null;
  return (
    <span
      aria-live="polite"
      style={{
        justifySelf: 'end',
        fontFamily: 'var(--pbt-mono)',
        fontSize: 11,
        color: length >= max ? COLOR.danger : COLOR.inkMute,
      }}
    >
      {length}/{max}
    </span>
  );
}

function isDriver(value: unknown): value is DriverKey {
  return typeof value === 'string' && value in DRIVERS;
}

const warned = new Set<string>();

// ── The renderer ─────────────────────────────────────────────────────────

function A2uiSurfaceImpl({ surface, onAction, onDataChange, busy = false, readOnly = false }: A2uiSurfaceProps) {
  const { components, dataModel, surfaceId } = surface;
  const actionsOff = busy || readOnly;

  /** Absolute data-model path behind a `{ path }` binding, or null. */
  const bindingPath = (value: unknown, scope: string): string | null => {
    if (value !== null && typeof value === 'object' && typeof (value as { path?: unknown }).path === 'string') {
      return resolveBindingPath((value as { path: string }).path, scope);
    }
    return null;
  };

  const str = (value: unknown, scope: string): string => {
    const v = resolveDynamic(value, dataModel, scope);
    return v === null || v === undefined ? '' : String(v);
  };

  const write = (path: string | null, value: unknown) => {
    if (path !== null && !readOnly) onDataChange(surfaceId, path, value);
  };

  const fireAction = (c: A2uiComponent, scope: string) => {
    const action = c.action as
      | {
          event?: { name?: string; context?: Record<string, unknown> };
          functionCall?: { call?: string; args?: Record<string, unknown> };
        }
      | undefined;
    if (!action || actionsOff) return;
    if (action.functionCall?.call === 'openUrl') {
      const url = str(action.functionCall.args?.url, scope);
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action.event?.name) {
      onAction({
        name: action.event.name,
        surfaceId,
        sourceComponentId: c.id,
        context: resolveContext(action.event.context, dataModel, scope),
        timestamp: new Date().toISOString(),
      });
    }
  };

  const renderChildren = (c: A2uiComponent, scope: string): ReactNode => {
    const children = c.children as unknown;
    if (Array.isArray(children)) {
      return children.map((id) => (typeof id === 'string' ? render(id, scope) : null));
    }
    // Templated ChildList: { path, componentId } — one instance per array
    // item, each scoped to its item for relative-path bindings.
    if (children !== null && typeof children === 'object') {
      const t = children as { path?: unknown; componentId?: unknown };
      if (typeof t.path === 'string' && typeof t.componentId === 'string') {
        const base = resolveBindingPath(t.path, scope);
        const items = resolveDynamic({ path: base }, dataModel);
        if (Array.isArray(items)) {
          const template = t.componentId;
          return items.map((_item, i) => (
            <Fragment key={`${template}-${i}`}>{render(template, `${base}/${i}`)}</Fragment>
          ));
        }
      }
    }
    return null;
  };

  const render = (id: string, scope: string, inButton = false): ReactNode => {
    const c = components[id];
    if (!c) return null;
    const key = `${surfaceId}:${id}:${scope}`;

    switch (c.component) {
      case 'Card':
        return (
          <Glass
            key={key}
            padding={16}
            radius={RADIUS.lg}
            shine={false}
            style={{ border: '1px solid rgba(60,20,15,0.08)' }}
          >
            {typeof c.child === 'string' && render(c.child, scope)}
          </Glass>
        );

      case 'Column':
      case 'List':
        return (
          <div
            key={key}
            role={c.component === 'List' ? 'list' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: c.component === 'List' ? 8 : 10,
              justifyContent: JUSTIFY[c.justify as string],
              alignItems: ALIGN[c.align as string] ?? 'stretch',
              minWidth: 0,
            }}
          >
            {renderChildren(c, scope)}
          </div>
        );

      case 'Row':
        return (
          <div
            key={key}
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: JUSTIFY[c.justify as string],
              alignItems: ALIGN[c.align as string] ?? 'center',
            }}
          >
            {renderChildren(c, scope)}
          </div>
        );

      case 'Text': {
        const content = str(c.text, scope);
        if (inButton) return <span key={key}>{content}</span>;
        const variant = typeof c.variant === 'string' && c.variant in TEXT_STYLES ? c.variant : 'body';
        return (
          <div key={key} style={{ ...TEXT_STYLES[variant], whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {content}
          </div>
        );
      }

      case 'Divider':
        return (
          <div
            key={key}
            role="separator"
            style={{ height: 1, width: '100%', background: COLOR.border }}
          />
        );

      case 'Button': {
        const variant = typeof c.variant === 'string' ? c.variant : 'primary';
        return (
          <button
            key={key}
            type="button"
            className="pbt-btn"
            onClick={() => fireAction(c, scope)}
            disabled={actionsOff}
            style={buttonStyle(variant, actionsOff)}
          >
            {typeof c.child === 'string' ? render(c.child, scope, true) : null}
          </button>
        );
      }

      case 'TextField': {
        const path = bindingPath(c.value, scope);
        const value = str(c.value, scope);
        const label = c.label !== undefined ? str(c.label, scope) : '';
        const maxLength = typeof c.maxLength === 'number' ? c.maxLength : undefined;
        const placeholder = typeof c.placeholder === 'string' ? c.placeholder : undefined;
        const disabled = readOnly || path === null;
        return (
          <div key={key} style={{ display: 'grid', gap: 6 }}>
            {label && <span style={labelStyle}>{label}</span>}
            {c.multiline === true ? (
              <AutoTextArea
                value={value}
                onChange={(v) => write(path, v)}
                disabled={disabled}
                maxLength={maxLength}
                placeholder={placeholder}
                ariaLabel={label || undefined}
              />
            ) : (
              <input
                className="pbt-studio-field"
                value={value}
                disabled={disabled}
                maxLength={maxLength}
                placeholder={placeholder}
                aria-label={label || undefined}
                onChange={(e) => write(path, e.target.value)}
                style={fieldStyle}
              />
            )}
            <NearLimit length={value.length} max={maxLength} />
          </div>
        );
      }

      case 'ChoicePicker': {
        const path = bindingPath(c.value, scope);
        const current = resolveDynamic(c.value, dataModel, scope);
        const options = Array.isArray(c.options) ? (c.options as { label?: unknown; value?: unknown }[]) : [];
        const label = c.label !== undefined ? str(c.label, scope) : '';
        return (
          <div key={key} role="group" aria-label={label || undefined} style={{ display: 'grid', gap: 6 }}>
            {label && <span style={labelStyle}>{label}</span>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {options.map((o, i) => {
                const value = resolveDynamic(o.value, dataModel, scope);
                return (
                  <Chip
                    key={`${key}-opt-${i}`}
                    selected={String(current) === String(value)}
                    disabled={readOnly || path === null}
                    onClick={() => write(path, value)}
                  >
                    {str(o.label, scope)}
                  </Chip>
                );
              })}
            </div>
          </div>
        );
      }

      case 'CheckBox': {
        const path = bindingPath(c.value, scope);
        const checked = resolveDynamic(c.value, dataModel, scope) === true;
        return (
          <label
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={readOnly || path === null}
              onChange={(e) => write(path, e.target.checked)}
              style={{ accentColor: COLOR.brand, width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: COLOR.ink }}>{str(c.label, scope)}</span>
          </label>
        );
      }

      /* ── Studio widgets ─────────────────────────────────────────────── */

      case 'FieldChange': {
        const path = bindingPath(c.value, scope);
        const label = str(c.label, scope);
        const before = str(c.before, scope);
        const current = resolveDynamic(c.value, dataModel, scope);
        const value = current === null || current === undefined ? '' : String(current);
        const kind = c.kind === 'long' || c.kind === 'choice' ? c.kind : 'text';
        const maxLength = typeof c.maxLength === 'number' ? c.maxLength : undefined;
        const unset = before === '' || before === '—';
        const disabled = readOnly || path === null;
        const options = Array.isArray(c.options) ? (c.options as { label?: unknown; value?: unknown }[]) : [];
        return (
          <div
            key={key}
            role="group"
            aria-label={label}
            style={{
              display: 'grid',
              gap: 6,
              padding: '10px 12px',
              borderRadius: RADIUS.md,
              background: 'rgba(60,20,15,0.035)',
              border: `1px solid ${COLOR.borderSoft}`,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={labelStyle}>{label}</span>
              <span style={{ fontSize: 12, color: COLOR.inkMute, minWidth: 0, overflowWrap: 'anywhere' }}>
                Now:{' '}
                {unset ? (
                  <em>not set</em>
                ) : (
                  <s style={{ textDecorationColor: 'rgba(60,20,15,0.35)' }}>{before}</s>
                )}
              </span>
            </div>
            {kind === 'choice' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {options.map((o, i) => {
                  const optValue = resolveDynamic(o.value, dataModel, scope);
                  return (
                    <Chip
                      key={`${key}-opt-${i}`}
                      selected={String(current) === String(optValue)}
                      disabled={disabled}
                      onClick={() => write(path, optValue)}
                    >
                      {str(o.label, scope)}
                    </Chip>
                  );
                })}
              </div>
            ) : kind === 'long' ? (
              <AutoTextArea
                value={value}
                onChange={(v) => write(path, v)}
                disabled={disabled}
                maxLength={maxLength}
                ariaLabel={`${label} (suggested)`}
              />
            ) : (
              <input
                className="pbt-studio-field"
                value={value}
                disabled={disabled}
                maxLength={maxLength}
                aria-label={`${label} (suggested)`}
                onChange={(e) => write(path, e.target.value)}
                style={fieldStyle}
              />
            )}
            {kind !== 'choice' && <NearLimit length={value.length} max={maxLength} />}
          </div>
        );
      }

      case 'DocOption': {
        const path = bindingPath(c.value, scope);
        const checked = resolveDynamic(c.value, dataModel, scope) === true;
        const title = str(c.title, scope);
        const meta = str(c.meta, scope);
        return (
          <label
            key={key}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: RADIUS.md,
              border: `1.5px solid ${checked ? COLOR.brand : 'rgba(60,20,15,0.10)'}`,
              background: checked ? `color-mix(in oklab, ${COLOR.brand} 7%, white)` : 'rgba(255,255,255,0.72)',
              cursor: readOnly || path === null ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={readOnly || path === null}
              onChange={(e) => write(path, e.target.checked)}
              aria-label={title}
              style={{ accentColor: COLOR.brand, width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, overflowWrap: 'anywhere' }}>{title}</span>
              {meta && <span style={{ fontSize: 11.5, color: COLOR.inkMute }}>{meta}</span>}
            </span>
          </label>
        );
      }

      case 'DriverSwatch': {
        const driver = resolveDynamic(c.driver, dataModel, scope);
        if (!isDriver(driver)) return null;
        const token = DRIVERS[driver];
        return (
          <div
            key={key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              alignSelf: 'flex-start',
              padding: '5px 12px 5px 6px',
              borderRadius: 999,
              background: token.soft,
              border: `1px solid color-mix(in oklab, ${token.color} 30%, transparent)`,
              fontSize: 12,
              color: COLOR.ink,
              maxWidth: '100%',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                background: token.color,
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {token.glyph}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ fontWeight: 700 }}>{driver}</strong>
              <span style={{ color: COLOR.inkSoft }}> · {DRIVER_BLURBS[driver]}</span>
            </span>
          </div>
        );
      }

      default:
        if (!warned.has(c.component)) {
          warned.add(c.component);
          console.warn(`[a2ui] unsupported component type "${c.component}" — skipped`);
        }
        return null;
    }
  };

  if (!components.root) return null;
  return <div style={{ width: '100%', minWidth: 0 }}>{render('root', '')}</div>;
}

/**
 * Memoised: `setSurfaceData` preserves the identity of every surface it
 * doesn't touch, so typing in one card (or in the composer) doesn't
 * re-render the other cards in the transcript.
 */
export const A2uiSurface = memo(A2uiSurfaceImpl);
