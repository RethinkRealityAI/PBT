/**
 * Scenario Studio → Categories (`#/scenarios/categories`).
 *
 * The catalogue of what can be trained. A CATEGORY is a subject — Obesity &
 * weight loss, Probiotics, GI — and holds two things: the OBJECTIONS owners
 * raise about it (each for dogs, cats or both), and the KNOWLEDGE its
 * scenarios read (documents from the library and/or a knowledge topic). A
 * scenario is built on one objection and reads its category's knowledge
 * unless it picks its own.
 *
 * One card per category, in display order: name, description, the animals
 * it covers (read off its objections), its knowledge, then its objections —
 * the built-in ones read-only, the team's own with Edit / Retire / Delete as
 * before — and "+ Add objection" preset to that category. Built-in
 * categories can be renamed and given knowledge, never deleted; a team
 * category can't be deleted while objections live in it (the server names
 * them and so do we). "Recently deleted" restores both kinds.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Library, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { ContextBar, ScreenShell } from '../../primitives/Shell';
import { Button, InlineAlert } from '../../primitives/form';
import { ReadOnlyBanner, useCan } from '../../primitives/access';
import { useConfirm } from '../../primitives/Confirm';
import { useToast } from '../../primitives/Toast';
import { LoadingShimmer } from '../../primitives';
import { ApiError } from '../../lib/api';
import { COLOR } from '../../lib/tokens';
import { useKnowledgeDocuments, useScenarioOverrides } from '../../data/queries';
import type { AdminObjection, CatalogObjection } from '../../../../src/shared/scenarios/objections';
import type { AdminObjectionCategory } from '../../../../src/shared/scenarios/objectionCategories';
import { PetBadge, StatusDot } from '../ui';
import { buildStudioEntries, relativeTime } from '../studioModel';
import type { KnowledgeState } from '../types';
import { animalsLabel, formFromObjection, formToWrite, usageLabel } from './objectionsModel';
import {
  builtInObjectionsIn,
  canDeleteCategory,
  categoryAnimals,
  categoryKnowledgeLine,
  categoryLabel,
  categoryUsageLabel,
  hasCategoryKnowledge,
  teamObjectionsIn,
} from './categoriesModel';
import { ObjectionsProvider } from './ObjectionsContext';
import { ObjectionEditor } from './ObjectionEditor';
import { CategoryEditor } from './CategoryEditor';
import { useObjections, type ObjectionsApi } from './useObjections';
import { NO_HIDDEN_CONCERNS, lacksHiddenConcerns } from '../readinessWarnings';

const NO_KNOWLEDGE_ACCESS = 'Your role can’t open the knowledge library, so its documents can’t be listed here.';

type ObjectionEditorState = {
  objection: AdminObjection | null;
  categoryId: string | null;
  /** Open on Coaching ("Add hidden concerns" on a row). */
  focus?: 'coaching';
} | null;
type CategoryEditorState = { category: AdminObjectionCategory | null } | null;

export function CategoriesScreen({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const api = useObjections({ refreshOnMount: true });
  return (
    <ObjectionsProvider value={api}>
      <CategoriesBody api={api} query={query} onQuery={onQuery} />
    </ObjectionsProvider>
  );
}

function textMatches(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

function objectionMatches(o: { title: string; example: string; titleFr?: string | null }, query: string): boolean {
  return textMatches(`${o.title} ${o.example} ${o.titleFr ?? ''}`, query);
}

function CategoriesBody({ api, query, onQuery }: { api: ObjectionsApi; query: string; onQuery: (q: string) => void }) {
  const can = useCan();
  const canWrite = can('scenarios.write');
  const canReadKnowledge = can('knowledge.read');
  const toast = useToast();
  const confirm = useConfirm();
  const overrides = useScenarioOverrides();
  const knowledgeQuery = useKnowledgeDocuments();
  const [objectionEditor, setObjectionEditor] = useState<ObjectionEditorState>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** A delete the server refused, per objection: the scenarios still using it. */
  const [refused, setRefused] = useState<Record<string, Array<{ scenario_id: string; title: string }>>>({});
  /** A category delete the server refused: the objections still in it. */
  const [refusedCategory, setRefusedCategory] = useState<Record<string, Array<{ id: string; title: string }>>>({});
  const [showDeleted, setShowDeleted] = useState(false);

  const knowledge = useMemo<KnowledgeState>(
    () =>
      canReadKnowledge
        ? {
            docs: knowledgeQuery.data,
            loading: knowledgeQuery.loading,
            error: knowledgeQuery.error,
            refetch: knowledgeQuery.refetch,
          }
        : { docs: [], loading: false, error: NO_KNOWLEDGE_ACCESS, refetch: () => {} },
    [canReadKnowledge, knowledgeQuery.data, knowledgeQuery.loading, knowledgeQuery.error, knowledgeQuery.refetch],
  );

  // Scenario names for "which scenarios use it" — the same titles the
  // Studio's library shows.
  const scenarioTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of buildStudioEntries(overrides.data, [], api.objections)) map.set(e.id, e.title);
    return map;
  }, [overrides.data, api.objections]);
  const scenariosUsing = (id: string) =>
    overrides.data
      .filter((o) => o.pushback_id === id)
      .map((o) => ({ id: o.scenario_id, title: scenarioTitles.get(o.scenario_id) ?? 'Untitled scenario', live: o.visible }));

  const canAdd = canWrite && api.available;
  const known = new Set(api.categories.map((c) => c.id));
  const orphans = api.objections.filter((o) => !known.has(o.categoryId));

  /** Each category with what it shows under the current search. */
  const groups = api.categories
    .map((category) => {
      const builtIn = builtInObjectionsIn(category.id);
      const team = teamObjectionsIn(category.id, api.objections);
      const own = textMatches(`${category.name} ${category.nameFr ?? ''} ${category.description}`, query);
      return {
        category,
        builtIn: own ? builtIn : builtIn.filter((o) => objectionMatches(o, query)),
        team: own ? team : team.filter((o) => objectionMatches(o, query)),
        own,
        total: builtIn.length + team.length,
      };
    })
    .filter((g) => g.own || g.builtIn.length + g.team.length > 0);

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

  async function removeObjection(o: AdminObjection) {
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
      setRefused((r) => omit(r, o.id));
      toast({
        message: `“${o.title}” deleted.`,
        tone: 'success',
        action: { label: 'Undo', onClick: () => void restoreObjection(o) },
      });
    } catch (err) {
      toast({ message: `Couldn’t delete it — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function restoreObjection(o: AdminObjection) {
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

  async function removeCategory(c: AdminObjectionCategory) {
    if (!canWrite || busyId || !canDeleteCategory(c)) return;
    // Objections inside it: the server refuses and names them — ask it, so
    // the list is the server's, never a guess.
    if (teamObjectionsIn(c.id, api.objections).length === 0) {
      const ok = await confirm({
        title: `Delete the category “${c.name}”?`,
        consequences: [
          'It disappears from every picker in the Studio and the trainee app.',
          ...(hasCategoryKnowledge(c)
            ? ['The documents attached to it stay in the knowledge library.']
            : []),
          'You can bring it back from “Recently deleted” on this page.',
        ],
        confirmLabel: 'Delete category',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(c.id);
    try {
      const res = await api.removeCategory(c.id);
      if (res.ok === false) {
        const inside = res.objections;
        setRefusedCategory((r) => ({ ...r, [c.id]: inside }));
        return;
      }
      setRefusedCategory((r) => omit(r, c.id));
      toast({
        message: `“${c.name}” deleted.`,
        tone: 'success',
        action: { label: 'Undo', onClick: () => void restoreCategory(c) },
      });
    } catch (err) {
      toast({ message: `Couldn’t delete it — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function restoreCategory(c: AdminObjectionCategory) {
    if (!canWrite) return;
    setBusyId(c.id);
    try {
      await api.restoreCategory(c.id);
      toast({ message: `“${c.name}” restored.`, tone: 'success' });
    } catch (err) {
      toast({ message: `Couldn’t restore it — ${err instanceof Error ? err.message : 'unknown error'}`, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const deletedCount = api.deleted.length + api.deletedCategories.length;
  const loadingFirst = !api.loaded && api.loading;

  return (
    <>
      <ContextBar
        title="Categories"
        subtitle="The subjects your team trains on — the objections in each, and what the AI reads."
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        <ReadOnlyBanner permission="scenarios.write">
          You can see every category here, but adding or changing them needs the{' '}
          <code style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 700 }}>scenarios.write</code> permission.
        </ReadOnlyBanner>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, flex: '1 1 320px', fontSize: 14.5, lineHeight: 1.6, color: COLOR.inkSoft, maxWidth: 720 }}>
            Categories are the subjects your team trains on — Probiotics, say. Each one holds the
            objections owners raise about it, for dogs, cats or both, and the knowledge its
            scenarios read. A scenario reads its category’s knowledge unless it picks its own.
          </p>
          {canWrite && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                tone="primary"
                onClick={() => setCategoryEditor({ category: null })}
                disabled={!canAdd}
                title={api.missingTable ? 'Needs a database update first' : undefined}
              >
                + New category
              </Button>
            </div>
          )}
        </div>

        {api.missingTable && (
          <InlineAlert tone="info" title="Your own categories and objections need a database update">
            Until it’s applied, only the built-in categories and objections below are available, and
            they can’t be changed. Nothing else is affected — scenarios and the trainee app keep working.
          </InlineAlert>
        )}
        {api.error && (
          <InlineAlert tone="error" title="The categories didn’t load">
            {api.error}{' '}
            <Button size="sm" tone="secondary" onClick={api.refetch} style={{ marginLeft: 6 }}>
              Try again
            </Button>
          </InlineAlert>
        )}

        {loadingFirst ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <LoadingShimmer height={180} />
            <LoadingShimmer height={180} />
          </div>
        ) : groups.length === 0 && orphans.length === 0 ? (
          <div style={emptyBox}>
            {query.trim() ? `No category or objection matches “${query.trim()}”.` : 'No categories yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {groups.map((g) => (
              <CategoryCard
                key={g.category.id}
                category={g.category}
                builtIn={g.builtIn}
                team={g.team}
                total={g.total}
                allTeam={api.objections}
                canWrite={canWrite}
                canAdd={canAdd}
                busyId={busyId}
                refusal={refusedCategory[g.category.id] ?? null}
                onDismissRefusal={() => setRefusedCategory((r) => omit(r, g.category.id))}
                onEdit={() => setCategoryEditor({ category: g.category })}
                onDelete={() => void removeCategory(g.category)}
                onAddObjection={() => setObjectionEditor({ objection: null, categoryId: g.category.id })}
                renderTeamRow={(o) => (
                  <TeamRow
                    key={o.id}
                    objection={o}
                    canWrite={canWrite}
                    busy={busyId === o.id}
                    usedBy={scenariosUsing(o.id)}
                    refused={refused[o.id] ?? null}
                    titleOf={(id) => scenarioTitles.get(id) ?? null}
                    onEdit={() => setObjectionEditor({ objection: o, categoryId: o.categoryId })}
                    onAddConcerns={() => setObjectionEditor({ objection: o, categoryId: o.categoryId, focus: 'coaching' })}
                    onRetire={() => void setActive(o, !o.visible)}
                    onDelete={() => void removeObjection(o)}
                    onDismissRefusal={() => setRefused((r) => omit(r, o.id))}
                  />
                )}
              />
            ))}
            {orphans.length > 0 && (
              <section aria-labelledby="cat-orphans" style={cardBox}>
                <h2 id="cat-orphans" style={cardTitle}>
                  Not in a category
                </h2>
                <div style={{ fontSize: 13, color: COLOR.inkSoft }}>
                  These objections point at a category that no longer exists. Edit each one and choose a
                  category.
                </div>
                <ul aria-label="Objections not in a category" style={listReset}>
                  {orphans.map((o) => (
                    <TeamRow
                      key={o.id}
                      objection={o}
                      canWrite={canWrite}
                      busy={busyId === o.id}
                      usedBy={scenariosUsing(o.id)}
                      refused={refused[o.id] ?? null}
                      titleOf={(id) => scenarioTitles.get(id) ?? null}
                      onEdit={() => setObjectionEditor({ objection: o, categoryId: null })}
                      onAddConcerns={() => setObjectionEditor({ objection: o, categoryId: null, focus: 'coaching' })}
                      onRetire={() => void setActive(o, !o.visible)}
                      onDelete={() => void removeObjection(o)}
                      onDismissRefusal={() => setRefused((r) => omit(r, o.id))}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {deletedCount > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <button
                type="button"
                className="pbt-focusable"
                aria-expanded={showDeleted}
                onClick={() => setShowDeleted((v) => !v)}
                style={linkStyle}
              >
                {showDeleted ? '▾' : '▸'} Recently deleted ({deletedCount})
              </button>
            </div>
            {showDeleted && (
              <div style={{ display: 'grid', gap: 12 }}>
                {api.deletedCategories.length > 0 && (
                  <DeletedList heading="Categories" label="Recently deleted categories">
                    {api.deletedCategories.map((c) => (
                      <DeletedRow
                        key={c.id}
                        title={c.name}
                        meta={`Category${deletedWhen(c.deletedAt)}`}
                        canWrite={canWrite}
                        busy={busyId === c.id}
                        disabled={busyId !== null}
                        onRestore={() => void restoreCategory(c)}
                      />
                    ))}
                  </DeletedList>
                )}
                {api.deleted.length > 0 && (
                  <DeletedList heading="Objections" label="Recently deleted objections">
                    {api.deleted.map((o) => (
                      <DeletedRow
                        key={o.id}
                        title={o.title}
                        meta={`${animalsLabel(o.species)} · in ${categoryLabel(o.categoryId, [
                          ...api.categories,
                          ...api.deletedCategories,
                        ])}${deletedWhen(o.deletedAt)}`}
                        canWrite={canWrite}
                        busy={busyId === o.id}
                        disabled={busyId !== null}
                        onRestore={() => void restoreObjection(o)}
                      />
                    ))}
                  </DeletedList>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 16,
            border: `1px dashed rgba(60,20,15,0.16)`,
            background: 'rgba(255,255,255,0.45)',
            fontSize: 13,
            lineHeight: 1.6,
            color: COLOR.inkSoft,
          }}
        >
          <strong style={{ color: COLOR.ink }}>“Other pushback” isn’t in a category.</strong> It’s the
          “Something else” choice when building a scenario: the scenario describes the objection in its
          own words, and reads the whole knowledge library unless it picks its own documents or topic.
        </div>
      </ScreenShell>

      <ObjectionEditor
        open={objectionEditor !== null}
        objection={objectionEditor?.objection ?? null}
        defaultCategoryId={objectionEditor?.categoryId ?? null}
        focus={objectionEditor?.focus}
        canWrite={canWrite}
        knowledge={knowledge}
        onClose={() => setObjectionEditor(null)}
      />
      <CategoryEditor
        open={categoryEditor !== null}
        category={categoryEditor?.category ?? null}
        canWrite={canWrite && api.available}
        knowledge={knowledge}
        onClose={() => setCategoryEditor(null)}
      />
    </>
  );
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function deletedWhen(iso: string | null): string {
  return iso && Number.isFinite(Date.parse(iso)) ? ` · Deleted ${relativeTime(Date.parse(iso))}` : '';
}

// ─────────────────────────────────────────────────────────────
// One category
// ─────────────────────────────────────────────────────────────

function CategoryCard({
  category: c,
  builtIn,
  team,
  total,
  allTeam,
  canWrite,
  canAdd,
  busyId,
  refusal,
  onDismissRefusal,
  onEdit,
  onDelete,
  onAddObjection,
  renderTeamRow,
}: {
  category: AdminObjectionCategory;
  /** Built-in objections shown (search applied). */
  builtIn: CatalogObjection[];
  /** Team objections shown (search applied). */
  team: AdminObjection[];
  /** Every objection in it, search ignored. */
  total: number;
  allTeam: readonly AdminObjection[];
  canWrite: boolean;
  canAdd: boolean;
  busyId: string | null;
  refusal: Array<{ id: string; title: string }> | null;
  onDismissRefusal: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddObjection: () => void;
  renderTeamRow: (o: AdminObjection) => ReactNode;
}) {
  const headingId = `cat-${c.id.replace(/[^a-z0-9-]/gi, '-')}`;
  const animals = categoryAnimals(c.id, allTeam);
  const teamCount = teamObjectionsIn(c.id, allTeam).length;
  const objectionCount = builtInObjectionsIn(c.id).length + teamCount;
  const deletable = canDeleteCategory(c);
  const knowledge = hasCategoryKnowledge(c);
  return (
    <section aria-labelledby={headingId} style={cardBox}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h2 id={headingId} style={cardTitle}>
              {c.name}
            </h2>
            {c.builtIn && <span style={chip}>Built in</span>}
            {c.nameFr && (
              <span lang="fr-CA" style={{ fontSize: 12.5, color: COLOR.inkMute }}>
                French: {c.nameFr}
              </span>
            )}
          </div>
          {c.description && (
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: COLOR.inkSoft, overflowWrap: 'anywhere' }}>
              {c.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" tone="secondary" onClick={onEdit} aria-label={`${canWrite ? 'Edit' : 'View'} the category “${c.name}”`}>
            <Pencil aria-hidden size={13} style={{ marginRight: 6, verticalAlign: '-1px' }} />
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {canWrite && deletable && (
            <Button
              size="sm"
              tone="ghost"
              disabled={busyId !== null}
              busy={busyId === c.id}
              onClick={onDelete}
              aria-label={`Delete the category “${c.name}”`}
            >
              <span style={{ color: COLOR.danger }}>Delete</span>
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={metaLabel}>Animals</span>
          {animals.length === 0 ? (
            <span style={{ fontSize: 13, color: COLOR.inkMute }}>None yet — add an objection</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {animals.map((s) => (
                <PetBadge key={s} species={s} size={22} />
              ))}
              <span style={{ fontSize: 13, fontWeight: 650, color: COLOR.ink }}>{animalsLabel(animals)}</span>
            </span>
          )}
          <span style={{ fontSize: 12.5, color: COLOR.inkMute }}>
            · {categoryUsageLabel(objectionCount, c.usage.scenarios)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <span style={metaLabel}>Knowledge</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: knowledge ? 650 : 500,
              color: knowledge ? COLOR.ink : COLOR.inkMute,
              minWidth: 0,
              flex: '1 1 220px',
            }}
          >
            <Library aria-hidden size={15} style={{ flexShrink: 0, color: knowledge ? COLOR.brand : COLOR.inkMute }} />
            <span style={{ overflowWrap: 'anywhere' }}>{categoryKnowledgeLine(c)}</span>
          </span>
        </div>
      </div>

      {refusal && (
        <InlineAlert tone="warn" title="Can’t delete it — objections still live in it">
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
            {refusal.map((o) => (
              <li key={o.id || o.title}>{o.title}</li>
            ))}
          </ul>
          <div style={{ marginTop: 8 }}>
            Move {refusal.length === 1 ? 'it' : 'them'} to another category (Edit → Category), or
            delete {refusal.length === 1 ? 'it' : 'them'} first.
          </div>
          <div style={{ marginTop: 8 }}>
            <Button size="sm" tone="ghost" onClick={onDismissRefusal}>
              OK
            </Button>
          </div>
        </InlineAlert>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {builtIn.length + team.length > 0 ? (
          <ul aria-label={`Objections in ${c.name}`} style={listReset}>
            {builtIn.map((o) => (
              <BuiltInRow key={o.id} objection={o} />
            ))}
            {team.map((o) => renderTeamRow(o))}
          </ul>
        ) : (
          <div style={{ ...emptyBox, padding: '14px 16px', textAlign: 'left' }}>
            {total > 0 ? 'No objection here matches the search.' : 'No objections in this category yet.'}
          </div>
        )}
        {canWrite && (
          <div>
            <Button
              size="sm"
              tone="secondary"
              onClick={onAddObjection}
              disabled={!canAdd}
              title={canAdd ? undefined : 'Needs a database update first'}
              aria-label={`Add an objection to ${c.name}`}
            >
              <Plus aria-hidden size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              Add objection
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function BuiltInRow({ objection: o }: { objection: CatalogObjection }) {
  return (
    <li style={rowBox}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{o.title}</div>
        <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 3, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
          {o.example}
        </div>
      </div>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={chip}>Built in · read-only</span>
        <span style={chip}>{animalsLabel(o.species)}</span>
      </span>
    </li>
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
  onAddConcerns,
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
  /** Edit, opened on Coaching with the hidden-concerns box focused. */
  onAddConcerns: () => void;
  onRetire: () => void;
  onDelete: () => void;
  onDismissRefusal: () => void;
}) {
  const [showUsers, setShowUsers] = useState(false);
  return (
    <li style={{ ...rowBox, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 750, color: COLOR.ink, overflowWrap: 'anywhere' }}>{o.title}</span>
            <StatusDot tone={o.visible ? 'success' : 'neutral'}>{o.visible ? 'Active' : 'Retired'}</StatusDot>
          </div>
          {o.example && (
            <div style={{ fontSize: 12.5, color: COLOR.inkSoft, marginTop: 4, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
              {o.example}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ ...chip, gap: 4 }}>
              {o.species.map((s) => (
                <PetBadge key={s} species={s} size={16} />
              ))}
              <span style={{ marginLeft: 2 }}>{animalsLabel(o.species)}</span>
            </span>
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
          {lacksHiddenConcerns(o) && (
            <div style={concernsWarning}>
              <TriangleAlert aria-hidden size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>{NO_HIDDEN_CONCERNS}</span>
              {canWrite && (
                <button
                  type="button"
                  className="pbt-focusable"
                  onClick={onAddConcerns}
                  aria-label={`Add hidden concerns to “${o.title}”`}
                  style={{ ...linkStyle, fontSize: 12.5 }}
                >
                  Add them
                </button>
              )}
            </div>
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

function DeletedList({ heading, label, children }: { heading: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 750, color: COLOR.inkMute }}>{heading}</div>
      <ul aria-label={label} style={listReset}>
        {children}
      </ul>
    </div>
  );
}

function DeletedRow({
  title,
  meta,
  canWrite,
  busy,
  disabled,
  onRestore,
}: {
  title: string;
  meta: string;
  canWrite: boolean;
  busy: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  return (
    <li style={{ ...rowBox, opacity: 0.92 }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink, overflowWrap: 'anywhere' }}>{title}</div>
        <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 2 }}>{meta}</div>
      </div>
      {canWrite && (
        <Button size="sm" tone="secondary" busy={busy} disabled={disabled} onClick={onRestore} aria-label={`Restore “${title}”`}>
          Restore
        </Button>
      )}
    </li>
  );
}

/** The server names an untitled scenario by its id; never show a raw id. */
function readableTitle(title: string): string {
  return /^(admin|seed|user):/.test(title) ? 'Untitled scenario' : title;
}

const cardBox: CSSProperties = {
  display: 'grid',
  gap: 14,
  padding: 'clamp(14px, 3vw, 20px)',
  borderRadius: 20,
  background: 'rgba(255,255,255,0.62)',
  border: '1px solid rgba(255,255,255,0.95)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 12px 30px -22px rgba(60,20,15,0.3)',
  minWidth: 0,
};

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 19,
  fontWeight: 750,
  color: COLOR.ink,
  letterSpacing: '-0.02em',
  overflowWrap: 'anywhere',
};

const metaLabel: CSSProperties = {
  fontFamily: 'var(--pbt-mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: COLOR.inkMute,
  minWidth: 84,
};

const listReset: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 };

const rowBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '12px 14px',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.75)',
  border: `1px solid ${COLOR.border}`,
  minWidth: 0,
};

const chip: CSSProperties = {
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

const emptyBox: CSSProperties = {
  padding: '22px 18px',
  borderRadius: 16,
  border: '1px dashed rgba(60,20,15,0.16)',
  background: 'rgba(255,255,255,0.45)',
  fontSize: 13.5,
  color: COLOR.inkMute,
  textAlign: 'center',
};

const linkStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 750,
  color: COLOR.brand,
  cursor: 'pointer',
};

/** The "no hidden concerns" line on an objection row — the warn tone of `InlineAlert`, one line tall. */
const concernsWarning: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 8,
  padding: '6px 10px',
  borderRadius: 10,
  background: COLOR.warnSoft,
  border: '1px solid color-mix(in oklab, oklch(0.62 0.18 70) 26%, transparent)',
  color: 'oklch(0.42 0.14 70)',
  fontSize: 12.5,
  fontWeight: 650,
  lineHeight: 1.45,
};
