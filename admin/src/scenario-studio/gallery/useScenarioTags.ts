/**
 * The team's tag library for the Studio gallery, kept in one place.
 *
 * Loads `admin-scenario-tags` once, then every change is OPTIMISTIC: the
 * gallery updates at once, the request goes out, and a failure rolls the
 * change back and rethrows (the caller toasts). Before the migration has run
 * the endpoint answers `_notice: 'tags_table_missing'` — `available` is then
 * false and the gallery shows no tag UI at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TAGS_TABLE_MISSING,
  isTagColor,
  nextTagColor,
  normalizeTagName,
  rowToScenarioTag,
  sortTags,
  type AdminScenarioTag,
  type ScenarioTagWriteRequest,
  type TagColor,
} from '../../../../src/shared/scenarios/tags';
import { fetchScenarioTags, postScenarioTagOp } from '../api';
import type { GalleryTagIndex } from '../studioModel';

export interface ScenarioTagsApi {
  /** Still loading the first answer. */
  loading: boolean;
  /** The tables exist and the read worked — show the tag UI. */
  available: boolean;
  error: string | null;
  tags: AdminScenarioTag[];
  /** For `galleryFacets` / `entryTags`. */
  index: GalleryTagIndex;
  /** Replace a scenario's tags. Optimistic; rejects (after rolling back) on failure. */
  setScenarioTags: (scenarioId: string, tagIds: string[]) => Promise<void>;
  /** Create a tag (next unused colour unless given). Resolves to the new tag. */
  createTag: (name: string, color?: TagColor) => Promise<AdminScenarioTag>;
  /** Rename / recolour. Optimistic. */
  updateTag: (id: string, patch: { name?: string; color?: TagColor }) => Promise<void>;
  /** Soft delete + removed from every scenario. Optimistic. */
  deleteTag: (id: string) => Promise<void>;
  refetch: () => void;
}

type Assignments = Map<string, string[]>;

function toMap(rows: ReadonlyArray<{ scenarioId: string; tagId: string }>): Assignments {
  const map: Assignments = new Map();
  for (const a of rows) map.set(a.scenarioId, [...(map.get(a.scenarioId) ?? []), a.tagId]);
  return map;
}

function usageOf(map: Assignments): Map<string, number> {
  const usage = new Map<string, number>();
  for (const ids of map.values()) for (const id of ids) usage.set(id, (usage.get(id) ?? 0) + 1);
  return usage;
}

export function useScenarioTags(enabled = true): ScenarioTagsApi {
  const [loading, setLoading] = useState(enabled);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<AdminScenarioTag[]>([]);
  const [assigned, setAssigned] = useState<Assignments>(new Map());
  const [nonce, setNonce] = useState(0);
  // Live copies for the async writers (never a stale render closure).
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const assignedRef = useRef(assigned);
  assignedRef.current = assigned;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchScenarioTags()
      .then((res) => {
        if (cancelled) return;
        if (res._notice === TAGS_TABLE_MISSING) {
          setAvailable(false);
          setTags([]);
          setAssigned(new Map());
        } else {
          const list = (Array.isArray(res.tags) ? res.tags : [])
            .map((t) => {
              const tag = rowToScenarioTag({ ...t, updated_at: (t as { updatedAt?: unknown }).updatedAt });
              return tag ? { ...tag, usage: typeof t.usage === 'number' ? t.usage : 0 } : null;
            })
            .filter((t): t is AdminScenarioTag => t !== null);
          setTags(sortTags(list));
          setAssigned(toMap(Array.isArray(res.assignments) ? res.assignments : []));
          setAvailable(true);
        }
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAvailable(false);
        setError(err instanceof Error ? err.message : 'Couldn’t load tags');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  // Usage follows the assignments as they change optimistically.
  const withUsage = useMemo(() => {
    const usage = usageOf(assigned);
    return tags.map((t) => ({ ...t, usage: usage.get(t.id) ?? 0 }));
  }, [tags, assigned]);

  const index = useMemo<GalleryTagIndex>(() => {
    const live = new Set(tags.map((t) => t.id));
    const byScenario = new Map<string, string[]>();
    for (const [sid, ids] of assigned) {
      const kept = ids.filter((id) => live.has(id));
      if (kept.length) byScenario.set(sid, kept);
    }
    return { tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })), byScenario };
  }, [tags, assigned]);

  const post = useCallback((body: ScenarioTagWriteRequest) => postScenarioTagOp(body), []);

  const setScenarioTags = useCallback(
    async (scenarioId: string, tagIds: string[]) => {
      const before = assignedRef.current;
      const next = new Map(before);
      if (tagIds.length) next.set(scenarioId, [...tagIds]);
      else next.delete(scenarioId);
      setAssigned(next);
      try {
        const res = await post({ op: 'set-tags', scenarioId, tagIds });
        const kept = Array.isArray(res.tagIds) ? (res.tagIds as string[]) : tagIds;
        setAssigned((cur) => {
          const m = new Map(cur);
          if (kept.length) m.set(scenarioId, kept);
          else m.delete(scenarioId);
          return m;
        });
      } catch (err) {
        setAssigned(before);
        throw err;
      }
    },
    [post],
  );

  const createTag = useCallback(
    async (name: string, color?: TagColor) => {
      const chosen = color ?? nextTagColor(tagsRef.current.map((t) => t.color));
      const res = await post({ op: 'upsert-tag', tag: { name: normalizeTagName(name), color: chosen } });
      const raw = (res.tag ?? {}) as Record<string, unknown>;
      const tag = rowToScenarioTag({ ...raw, updated_at: raw.updatedAt });
      if (!tag) throw new Error('The tag was not saved');
      const created: AdminScenarioTag = { ...tag, usage: 0 };
      setTags((cur) => sortTags([...cur.filter((t) => t.id !== created.id), created]));
      return created;
    },
    [post],
  );

  const updateTag = useCallback(
    async (id: string, patch: { name?: string; color?: TagColor }) => {
      const before = tagsRef.current;
      const current = before.find((t) => t.id === id);
      if (!current) return;
      const name = patch.name !== undefined ? normalizeTagName(patch.name) : current.name;
      const color = patch.color && isTagColor(patch.color) ? patch.color : current.color;
      setTags(sortTags(before.map((t) => (t.id === id ? { ...t, name, color } : t))));
      try {
        const res = await post({ op: 'upsert-tag', tag: { id, name, color }, baseUpdatedAt: current.updatedAt });
        const raw = (res.tag ?? {}) as Record<string, unknown>;
        const saved = rowToScenarioTag({ ...raw, updated_at: raw.updatedAt });
        if (saved) setTags((cur) => sortTags(cur.map((t) => (t.id === id ? { ...t, ...saved } : t))));
      } catch (err) {
        setTags(before);
        throw err;
      }
    },
    [post],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      const beforeTags = tagsRef.current;
      const beforeAssigned = assignedRef.current;
      setTags(beforeTags.filter((t) => t.id !== id));
      const next: Assignments = new Map();
      for (const [sid, ids] of beforeAssigned) {
        const kept = ids.filter((t) => t !== id);
        if (kept.length) next.set(sid, kept);
      }
      setAssigned(next);
      try {
        await post({ op: 'delete-tag', id });
      } catch (err) {
        setTags(beforeTags);
        setAssigned(beforeAssigned);
        throw err;
      }
    },
    [post],
  );

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return {
    loading,
    available,
    error,
    tags: withUsage,
    index,
    setScenarioTags,
    createTag,
    updateTag,
    deleteTag,
    refetch,
  };
}
