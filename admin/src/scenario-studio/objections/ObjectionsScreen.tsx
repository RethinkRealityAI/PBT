/**
 * Scenario Studio → Objections (`#/scenarios/objections`).
 *
 * The pushbacks scenarios are built on, in one list: the seven built into the
 * app (read-only) and the team's own — which is how a new subject such as
 * probiotics gets into the Studio and the trainee app's builder without a
 * deploy. Each team objection says which animals it is for, its knowledge
 * topic, how many scenarios use it, and whether it is active; it can be
 * edited, retired (hidden from pickers, scenarios keep playing), deleted
 * (refused while scenarios use it) and restored.
 */
import { useMemo, useState } from 'react';
import { ContextBar, ScreenShell } from '../../primitives/Shell';
import { Button, InlineAlert } from '../../primitives/form';
import { ReadOnlyBanner, useCan } from '../../primitives/access';
import { useConfirm } from '../../primitives/Confirm';
import { useToast } from '../../primitives/Toast';
import { LoadingShimmer } from '../../primitives';
import { ApiError } from '../../lib/api';
import { COLOR } from '../../lib/tokens';
import { useScenarioOverrides } from '../../data/queries';
import {
  builtInObjections,
  type AdminObjection,
} from '../../../../src/shared/scenarios/objections';
import { StatusDot } from '../ui';
import { buildStudioEntries, relativeTime } from '../studioModel';
import {
  animalsLabel,
  formFromObjection,
  formToWrite,
  topicText,
  usageLabel,
} from './objectionsModel';
import { ObjectionsProvider } from './ObjectionsContext';
import { ObjectionEditor } from './ObjectionEditor';
import { useObjections, type ObjectionsApi } from './useObjections';

type EditorState = { objection: AdminObjection | null } | null;

export function ObjectionsScreen({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const api = useObjections({ refreshOnMount: true });
  return (
    <ObjectionsProvider value={api}>
      <ObjectionsBody api={api} query={query} onQuery={onQuery} />
    </ObjectionsProvider>
  );
}

function matches(o: { title: string; example: string; titleFr?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${o.title} ${o.example} ${o.titleFr ?? ''}`.toLowerCase().includes(q);
}

function ObjectionsBody({ api, query, onQuery }: { api: ObjectionsApi; query: string; onQuery: (q: string) => void }) {
  const can = useCan();
  const canWrite = can('scenarios.write');
  const toast = useToast();
  const confirm = useConfirm();
  const overrides = useScenarioOverrides();
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** A delete the server refused, per objection: the scenarios still using it. */
  const [refused, setRefused] = useState<Record<string, Array<{ scenario_id: string; title: string }>>>({});
  const [showDeleted, setShowDeleted] = useState(false);

  // Scenario names for "which scenarios use it" — the same titles the
  // Studio's library shows.
  const scenarioTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of buildStudioEntries(overrides.data, [])) map.set(e.id, e.title);
    return map;
  }, [overrides.data]);
  const scenariosUsing = (id: string) =>
    overrides.data
      .filter((o) => o.pushback_id === id)
      .map((o) => ({ id: o.scenario_id, title: scenarioTitles.get(o.scenario_id) ?? 'Untitled scenario', live: o.visible }));

  const team = api.objections.filter((o) => matches(o, query));
  const deleted = api.deleted.filter((o) => matches(o, query));
  const builtIns = builtInObjections().filter((o) => matches(o, query));
  const canAdd = canWrite && api.available;

  async function setActive(o: AdminObjection, visible: boolean) {
    if (!canWrite || busyId) return;
    setBusyId(o.id);
    try {
      const saved = await api.save(formToWrite({ ...formFromObjection(o), visible }), o.updatedAt);
      toast({
        message: visible
          ? `“${saved.title}” is active again — it’s offered when building scenarios.`
          : `“${saved.title}” retired — it’s hidden when building scenarios. Scenarios using it keep working.`,
        tone: 'success',
        action: { label: 'Undo', onClick: () => void setActive(saved, !visible) },
      });
    } catch (err) {
      toast({
        message:
          err instanceof ApiError && err.code === 'stale'
            ? 'Someone else changed this objection a moment ago — the list has been reloaded. Try again.'
            : `Couldn’t ${visible ? 'reactivate' : 'retire'} it — ${err instanceof Error ? err.message : 'unknown error'}`,
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(o: AdminObjection) {
    if (!canWrite || busyId) return;
    // An objection in use is refused by the server anyway; ask it straight
    // away so the admin sees WHICH scenarios — nothing is deleted then.
    if (o.usage.scenarios === 0) {
      const ok = await confirm({
        title: `Delete “${o.title}”?`,
        consequences: [
          'It disappears from every picker in the Studio and the trainee app.',
          ...(o.usage.trainee > 0
            ? [
                `${o.usage.trainee} trainee${o.usage.trainee === 1 ? ' has' : 's have'} built their own scenario on it. They keep playing their copy, but it can no longer be added to the library.`,
              ]
            : []),
          'You can bring it back from “Recently deleted” on this page.',
        ],
        confirmLabel: 'Delete objection',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(o.id);
    try {
      const res = await api.remove(o.id);
      if (res.ok === false) {
        const using = res.scenarios;
        setRefused((r) => ({ ...r, [o.id]: using }));
        return;
      }
      setRefused((r) => {
        const next = { ...r };
        delete next[o.id];
        return next;
      });
      toast({
        message: `“${o.title}” deleted.`,
        tone: 'success',
        action: { label: 'Undo', onClick: () => void restore(o) },
      });
    } catch (err) {
      toast({ message: `Couldn’t delete it — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function restore(o: AdminObjection) {
    if (!canWrite) return;
    setBusyId(o.id);
    try {
      await api.restore(o.id);
      toast({ message: `“${o.title}” restored.`, tone: 'success' });
    } catch (err) {
      toast({ message: `Couldn’t restore it — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ContextBar
        title="Objections"
        subtitle="The pushbacks your scenarios are built on."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="scenarios.write">
          You can see every objection here, but adding or changing them needs the{' '}
          <code style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 700 }}>scenarios.write</code> permission.
        </ReadOnlyBanner>

        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: COLOR.inkSoft, maxWidth: 720 }}>
          Objections are the pushbacks your scenarios are built on — what the owner is objecting to.
          To cover a new subject, such as probiotics, add an objection here. It then appears in the
          Studio and in the trainee app’s scenario builder, for the animals you choose.
        </p>

        {api.missingTable && (
          <InlineAlert tone="info" title="Your own objections need a database update">
            Until it’s applied, only the built-in objections below are available. Nothing else is
            affected — scenarios and the trainee app keep working.
          </InlineAlert>
        )}
        {api.error && (
          <InlineAlert tone="error" title="The objections didn’t load">
            {api.error}{' '}
            <Button size="sm" tone="secondary" onClick={api.refetch} style={{ marginLeft: 6 }}>
              Try again
            </Button>
          </InlineAlert>
        )}

        {/* ── Your team's objections ── */}
        <section aria-labelledby="objections-team-title" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 id="objections-team-title" style={sectionTitle}>
              Your team’s objections
            </h2>
            {canWrite && (
              <Button
                tone="primary"
                onClick={() => setEditor({ objection: null })}
                disabled={!canAdd}
                title={api.missingTable ? 'Needs a database update first' : undefined}
                style={{ marginLeft: 'auto' }}
              >
                + New objection
              </Button>
            )}
          </div>

          {!api.loaded && api.loading ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <LoadingShimmer height={96} />
              <LoadingShimmer height={96} />
            </div>
          ) : team.length === 0 ? (
            <div style={emptyBox}>
              {query.trim()
                ? `No team objection matches “${query.trim()}”.`
                : api.missingTable
                  ? 'Team objections can be added once the database update is applied.'
                  : 'No team objections yet. Add one to cover a new subject — probiotics, for example.'}
            </div>
          ) : (
            <ul aria-label="Your team’s objections" style={listReset}>
              {team.map((o) => (
                <TeamRow
                  key={o.id}
                  objection={o}
                  canWrite={canWrite}
                  busy={busyId === o.id}
                  usedBy={scenariosUsing(o.id)}
                  refused={refused[o.id] ?? null}
                  titleOf={(id) => scenarioTitles.get(id) ?? null}
                  onEdit={() => setEditor({ objection: o })}
                  onRetire={() => void setActive(o, !o.visible)}
                  onDelete={() => void remove(o)}
                  onDismissRefusal={() =>
                    setRefused((r) => {
                      const next = { ...r };
                      delete next[o.id];
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          )}

          {api.deleted.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div>
                <button
                  type="button"
                  className="pbt-focusable"
                  aria-expanded={showDeleted}
                  onClick={() => setShowDeleted((v) => !v)}
                  style={linkStyle}
                >
                  {showDeleted ? '▾' : '▸'} Recently deleted ({api.deleted.length})
                </button>
              </div>
              {showDeleted && (
                <ul aria-label="Recently deleted objections" style={listReset}>
                  {deleted.map((o) => (
                    <li key={o.id} style={{ ...rowBox, opacity: 0.9 }}>
                      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink, overflowWrap: 'anywhere' }}>
                          {o.title}
                        </div>
                        <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 2 }}>
                          {animalsLabel(o.species)}
                          {o.deletedAt && Number.isFinite(Date.parse(o.deletedAt))
                            ? ` · Deleted ${relativeTime(Date.parse(o.deletedAt))}`
                            : ''}
                        </div>
                      </div>
                      {canWrite && (
                        <Button
                          size="sm"
                          tone="secondary"
                          busy={busyId === o.id}
                          disabled={busyId !== null}
                          onClick={() => void restore(o)}
                          aria-label={`Restore “${o.title}”`}
                        >
                          Restore
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Built in ── */}
        <section aria-labelledby="objections-builtin-title" style={{ display: 'grid', gap: 12 }}>
          <div>
            <h2 id="objections-builtin-title" style={sectionTitle}>
              Built into the app
            </h2>
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 4 }}>
              These ship with the app and can’t be changed here.
            </div>
          </div>
          <ul aria-label="Built-in objections" style={listReset}>
            {builtIns.map((o) => (
              <li key={o.id} style={rowBox}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 3, fontStyle: o.id === 'custom' ? 'normal' : 'italic' }}>
                    {o.id === 'custom' ? 'The scenario describes the objection in its own words.' : o.example}
                  </div>
                </div>
                <span style={chip}>{animalsLabel(o.species)}</span>
              </li>
            ))}
          </ul>
        </section>
      </ScreenShell>

      <ObjectionEditor
        open={editor !== null}
        objection={editor?.objection ?? null}
        canWrite={canWrite}
        onClose={() => setEditor(null)}
      />
    </>
  );
}

function TeamRow({
  objection: o,
  canWrite,
  busy,
  usedBy,
  refused,
  titleOf,
  onEdit,
  onRetire,
  onDelete,
  onDismissRefusal,
}: {
  objection: AdminObjection;
  canWrite: boolean;
  busy: boolean;
  usedBy: Array<{ id: string; title: string; live: boolean }>;
  refused: Array<{ scenario_id: string; title: string }> | null;
  titleOf: (id: string) => string | null;
  onEdit: () => void;
  onRetire: () => void;
  onDelete: () => void;
  onDismissRefusal: () => void;
}) {
  const [showUsers, setShowUsers] = useState(false);
  return (
    <li style={{ ...rowBox, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 750, color: COLOR.ink, overflowWrap: 'anywhere' }}>{o.title}</span>
            <StatusDot tone={o.visible ? 'success' : 'neutral'}>{o.visible ? 'Active' : 'Retired'}</StatusDot>
          </div>
          {o.example && (
            <div style={{ fontSize: 13, color: COLOR.inkSoft, marginTop: 4, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
              {o.example}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={chip}>{animalsLabel(o.species)}</span>
            <span style={chip}>{topicText(o.focusArea)}</span>
            {o.titleFr && <span style={chip}>French ✓</span>}
            {o.usage.scenarios > 0 && usedBy.length > 0 ? (
              <button
                type="button"
                className="pbt-focusable"
                aria-expanded={showUsers}
                onClick={() => setShowUsers((v) => !v)}
                style={{ ...linkStyle, fontSize: 12.5 }}
              >
                {usageLabel(o.usage)}
              </button>
            ) : (
              <span style={{ fontSize: 12.5, color: COLOR.inkMute }}>{usageLabel(o.usage)}</span>
            )}
          </div>
          {showUsers && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: COLOR.inkSoft, display: 'grid', gap: 2 }}>
              {usedBy.map((s) => (
                <li key={s.id}>
                  {s.title}
                  {s.live ? ' — live' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" tone="secondary" onClick={onEdit} aria-label={`${canWrite ? 'Edit' : 'View'} “${o.title}”`}>
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {canWrite && (
            <>
              <Button
                size="sm"
                tone="ghost"
                busy={busy}
                disabled={busy}
                onClick={onRetire}
                aria-label={`${o.visible ? 'Retire' : 'Reactivate'} “${o.title}”`}
              >
                {o.visible ? 'Retire' : 'Reactivate'}
              </Button>
              <Button size="sm" tone="ghost" disabled={busy} onClick={onDelete} aria-label={`Delete “${o.title}”`}>
                <span style={{ color: COLOR.danger }}>Delete</span>
              </Button>
            </>
          )}
        </div>
      </div>
      {refused && (
        <InlineAlert tone="warn" title="Can’t delete it — scenarios still use it">
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
            {refused.map((s) => (
              <li key={s.scenario_id}>{titleOf(s.scenario_id) ?? readableTitle(s.title)}</li>
            ))}
          </ul>
          <div style={{ marginTop: 8 }}>
            Move {refused.length === 1 ? 'it' : 'them'} to another objection first — or retire this one
            instead: it’s hidden when building scenarios, and these keep working.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {o.visible && (
              <Button size="sm" tone="secondary" onClick={onRetire}>
                Retire instead
              </Button>
            )}
            <Button size="sm" tone="ghost" onClick={onDismissRefusal}>
              OK
            </Button>
          </div>
        </InlineAlert>
      )}
    </li>
  );
}

/** The server names an untitled scenario by its id; never show a raw id. */
function readableTitle(title: string): string {
  return /^(admin|seed|user):/.test(title) ? 'Untitled scenario' : title;
}

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 750,
  color: COLOR.ink,
  letterSpacing: '-0.02em',
};

const listReset: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 };

const rowBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '14px 16px',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.95)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 8px 22px -18px rgba(60,20,15,0.25)',
  minWidth: 0,
};

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(60,20,15,0.055)',
  fontSize: 12,
  fontWeight: 650,
  color: COLOR.inkSoft,
  whiteSpace: 'nowrap',
};

const emptyBox: React.CSSProperties = {
  padding: '22px 18px',
  borderRadius: 16,
  border: '1px dashed rgba(60,20,15,0.16)',
  background: 'rgba(255,255,255,0.45)',
  fontSize: 13.5,
  color: COLOR.inkMute,
  textAlign: 'center',
};

const linkStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 750,
  color: COLOR.brand,
  cursor: 'pointer',
};

