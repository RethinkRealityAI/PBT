/**
 * The team's categories and objections, loaded once per Studio session.
 *
 * One module-level store behind `useObjections()`: the Studio tab, the
 * Categories tab and every editor read the same lists, so a category or an
 * objection saved in one is already in the others (switching tabs unmounts
 * the screens, the lists survive). The Studio loads them on first use; the
 * Categories tab asks for a fresh copy when it opens, because its "Used by N
 * scenarios" counts move whenever a scenario is saved.
 *
 * Categories always include the three built-ins (even before anything loads,
 * or when the database update is still pending), so every built-in objection
 * has a home in every picker.
 *
 * Writes go through the same store and patch it in place from the server's
 * answer — the server is the authority (it validates, allocates ids, stamps
 * `updatedAt`), so nothing is shown as saved before it says so.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ApiError } from '../../lib/api';
import { fetchObjections, postObjectionOp } from '../api';
import type { AdminObjection } from '../../../../src/shared/scenarios/objections';
import type { AdminObjectionCategory } from '../../../../src/shared/scenarios/objectionCategories';
import { splitObjections, toAdminObjection } from './objectionsModel';
import { builtInAdminCategories, splitCategories, toAdminCategory } from './categoriesModel';

export interface ObjectionsSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Active and retired, in display order. Never includes deleted ones. */
  objections: AdminObjection[];
  /** Soft-deleted (restorable), most recent first. */
  deleted: AdminObjection[];
  /** Built-ins (always) + the team's own, in display order. Never deleted ones. */
  categories: AdminObjectionCategory[];
  /** Soft-deleted team categories (restorable), most recent first. */
  deletedCategories: AdminObjectionCategory[];
  error: string | null;
  /** The database update that adds objections hasn't been applied yet. */
  missingTable: boolean;
  /** When the list was last fetched successfully (ms), null = never. */
  loadedAt: number | null;
}

/** A delete the server refused because scenarios still use the objection. */
export interface InUseRefusal {
  ok: false;
  scenarios: Array<{ scenario_id: string; title: string }>;
}

/** A category delete the server refused because objections still live in it. */
export interface CategoryInUseRefusal {
  ok: false;
  objections: Array<{ id: string; title: string }>;
}

/** A saved category, plus any attached document ids the server left out (no such document). */
export interface SavedCategory {
  category: AdminObjectionCategory;
  dropped: string[];
}

export interface ObjectionsApi extends ObjectionsSnapshot {
  /** The list has been fetched successfully at least once. */
  loaded: boolean;
  loading: boolean;
  /** Objections can be read and written here (loaded, and the table exists). */
  available: boolean;
  refetch: () => void;
  /**
   * Create (no `id` in `objection`) or update one. Resolves with the saved
   * objection; throws an `ApiError` the editor turns into words (409 `stale`
   * means someone else saved it meanwhile — the list has been reloaded).
   */
  save: (objection: Record<string, unknown>, baseUpdatedAt?: string | null) => Promise<AdminObjection>;
  /** Soft-delete, or the scenarios that still use it. */
  remove: (id: string) => Promise<{ ok: true } | InUseRefusal>;
  restore: (id: string) => Promise<void>;
  /**
   * Create (no `id`) or update a category — built-ins included (name, French
   * name, description, knowledge). Throws an `ApiError` like `save` does
   * (409 `stale` reloads the lists; 409 `limit`; 400 with a sentence).
   */
  saveCategory: (category: Record<string, unknown>, baseUpdatedAt?: string | null) => Promise<SavedCategory>;
  /** Soft-delete a team category, or the objections that still live in it. */
  removeCategory: (id: string) => Promise<{ ok: true } | CategoryInUseRefusal>;
  restoreCategory: (id: string) => Promise<void>;
}

const INITIAL: ObjectionsSnapshot = {
  status: 'idle',
  objections: [],
  deleted: [],
  categories: builtInAdminCategories(),
  deletedCategories: [],
  error: null,
  missingTable: false,
  loadedAt: null,
};

let state: ObjectionsSnapshot = INITIAL;
const listeners = new Set<() => void>();
let ticket = 0;
let inflight: Promise<void> | null = null;

function setState(next: ObjectionsSnapshot) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ObjectionsSnapshot {
  return state;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Fetch the list. Without `force`, a list that is loaded (or loading) is
 * kept. The previous list stays on screen while a refresh runs; a reply
 * overtaken by a newer request is dropped.
 */
export function loadObjections(force = false): Promise<void> {
  if (!force) {
    if (state.status === 'loading' && inflight) return inflight;
    if (state.status === 'ready') return Promise.resolve();
  }
  const mine = ++ticket;
  setState({ ...state, status: 'loading', error: null });
  const run = fetchObjections().then(
    (res) => {
      if (mine !== ticket) return;
      const { active, deleted } = splitObjections(res?.objections);
      const cats = splitCategories(res?.categories);
      setState({
        status: 'ready',
        objections: active,
        deleted,
        categories: cats.active,
        deletedCategories: cats.deleted,
        error: null,
        missingTable: res?._notice === 'objections_table_missing',
        loadedAt: Date.now(),
      });
    },
    (err: unknown) => {
      if (mine !== ticket) return;
      // 503 = the migration hasn't been applied: not an error to retry, a
      // state to explain. Built-in objections keep working.
      if (err instanceof ApiError && err.status === 503) {
        setState({
          status: 'ready',
          objections: [],
          deleted: [],
          categories: builtInAdminCategories(),
          deletedCategories: [],
          error: null,
          missingTable: true,
          loadedAt: Date.now(),
        });
        return;
      }
      setState({ ...state, status: 'error', error: errorText(err, 'The objections didn’t load.') });
    },
  );
  inflight = run.finally(() => {
    if (mine === ticket) inflight = null;
  });
  return inflight;
}

function replaceLocal(saved: AdminObjection) {
  const prev = state.objections.find((o) => o.id === saved.id) ?? state.deleted.find((o) => o.id === saved.id);
  // The write answer may not carry usage counts; keep the ones we had.
  const merged: AdminObjection =
    prev && saved.usage.scenarios === 0 && prev.usage.scenarios > 0 ? { ...saved, usage: prev.usage } : saved;
  const others = state.objections.filter((o) => o.id !== saved.id);
  const { active } = splitObjections([...others, merged]);
  setState({
    ...state,
    objections: active,
    deleted: state.deleted.filter((o) => o.id !== saved.id),
  });
}

export async function saveObjection(
  objection: Record<string, unknown>,
  baseUpdatedAt?: string | null,
): Promise<AdminObjection> {
  try {
    const res = await postObjectionOp({
      op: 'upsert',
      objection,
      ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}),
    });
    const saved = toAdminObjection(res?.objection);
    if (!saved) throw new Error('The server saved it but answered with something unexpected — reload to see it.');
    replaceLocal(saved);
    return saved;
  } catch (err) {
    // Someone else saved meanwhile: show the version that won.
    if (err instanceof ApiError && err.code === 'stale') void loadObjections(true);
    if (err instanceof ApiError && err.status === 503) {
      setState({ ...state, status: 'ready', missingTable: true });
    }
    throw err;
  }
}

export async function removeObjection(id: string): Promise<{ ok: true } | InUseRefusal> {
  try {
    await postObjectionOp({ op: 'delete', id });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'in_use') {
      const raw = Array.isArray(err.body.scenarios) ? err.body.scenarios : [];
      const scenarios = raw
        .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object')
        .map((s) => ({
          scenario_id: typeof s.scenario_id === 'string' ? s.scenario_id : '',
          title: typeof s.title === 'string' && s.title.trim() ? s.title.trim() : 'Untitled scenario',
        }));
      return { ok: false, scenarios };
    }
    throw err;
  }
  const gone = state.objections.find((o) => o.id === id);
  if (gone) {
    setState({
      ...state,
      objections: state.objections.filter((o) => o.id !== id),
      deleted: [{ ...gone, deletedAt: new Date().toISOString() }, ...state.deleted],
    });
  }
  void loadObjections(true);
  return { ok: true };
}

export async function restoreObjection(id: string): Promise<void> {
  const res = await postObjectionOp({ op: 'restore', id });
  const restored = toAdminObjection(res?.objection);
  if (restored && !restored.deletedAt) replaceLocal(restored);
  void loadObjections(true);
}

function replaceLocalCategory(saved: AdminObjectionCategory) {
  const prev =
    state.categories.find((c) => c.id === saved.id) ?? state.deletedCategories.find((c) => c.id === saved.id);
  // The write answer may not carry usage counts; keep the ones we had.
  const merged: AdminObjectionCategory =
    prev && saved.usage.objections === 0 && saved.usage.scenarios === 0 ? { ...saved, usage: prev.usage } : saved;
  const others = state.categories.filter((c) => c.id !== saved.id);
  const { active } = splitCategories([...others, merged]);
  setState({
    ...state,
    categories: active,
    deletedCategories: state.deletedCategories.filter((c) => c.id !== saved.id),
  });
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

export async function saveCategory(
  category: Record<string, unknown>,
  baseUpdatedAt?: string | null,
): Promise<SavedCategory> {
  try {
    const res = await postObjectionOp({
      op: 'upsert-category',
      category,
      ...(baseUpdatedAt !== undefined ? { baseUpdatedAt } : {}),
    });
    const saved = toAdminCategory(res?.category);
    if (!saved) throw new Error('The server saved it but answered with something unexpected — reload to see it.');
    replaceLocalCategory(saved);
    return { category: saved, dropped: stringList(res?._dropped) };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'stale') void loadObjections(true);
    if (err instanceof ApiError && err.status === 503) {
      setState({ ...state, status: 'ready', missingTable: true });
    }
    throw err;
  }
}

export async function removeCategory(id: string): Promise<{ ok: true } | CategoryInUseRefusal> {
  try {
    await postObjectionOp({ op: 'delete-category', id });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'in_use') {
      const raw = Array.isArray(err.body.objections) ? err.body.objections : [];
      const objections = raw
        .filter((o): o is Record<string, unknown> => o !== null && typeof o === 'object')
        .map((o) => ({
          id: typeof o.id === 'string' ? o.id : '',
          title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Untitled objection',
        }));
      return { ok: false, objections };
    }
    throw err;
  }
  const gone = state.categories.find((c) => c.id === id);
  if (gone) {
    setState({
      ...state,
      categories: state.categories.filter((c) => c.id !== id),
      deletedCategories: [{ ...gone, deletedAt: new Date().toISOString() }, ...state.deletedCategories],
    });
  }
  void loadObjections(true);
  return { ok: true };
}

export async function restoreCategory(id: string): Promise<void> {
  const res = await postObjectionOp({ op: 'restore-category', id });
  const restored = toAdminCategory(res?.category);
  if (restored && !restored.deletedAt) replaceLocalCategory(restored);
  void loadObjections(true);
}

function refetch() {
  void loadObjections(true);
}

/**
 * The team's categories and objections. Loads them on first use;
 * `refreshOnMount` asks for a fresh copy (the Categories tab — usage counts).
 */
export function useObjections(opts: { refreshOnMount?: boolean } = {}): ObjectionsApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh = Boolean(opts.refreshOnMount);
  useEffect(() => {
    void loadObjections(refresh);
  }, [refresh]);
  return useMemo(() => {
    // "Loaded" survives a refresh: the previous list is still on screen.
    const loaded = snap.status === 'ready' || (snap.status === 'loading' && snap.loadedAt !== null);
    return {
      ...snap,
      loaded,
      loading: snap.status === 'loading',
      available: loaded && !snap.missingTable,
      refetch,
      save: saveObjection,
      remove: removeObjection,
      restore: restoreObjection,
      saveCategory,
      removeCategory,
      restoreCategory,
    };
  }, [snap]);
}

/** Tests only: forget the list (and any request in flight). */
export function resetObjectionsStore(next: Partial<ObjectionsSnapshot> = {}): void {
  ticket += 1;
  inflight = null;
  state = { ...INITIAL, ...(next.status === 'ready' ? { loadedAt: Date.now() } : {}), ...next };
  for (const l of listeners) l();
}
