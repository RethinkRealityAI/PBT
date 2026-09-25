/**
 * A2UI v0.9.1 core — ported from PhotoBoothAR's src/lib/a2ui.test.ts.
 *
 * The reducer, the RFC 6901 JSON-Pointer data model and binding resolution
 * are what every Studio assistant card is built on. Card data is two-way
 * bound and (in PhotoBoothAR's case) agent-authored, so the prototype-chain
 * guards are pinned here too.
 */
import { describe, it, expect } from 'vitest';
import {
  A2UI_VERSION,
  PBT_STUDIO_CATALOG_ID,
  applySurfaceMessages,
  getPath,
  parsePointer,
  resolveBindingPath,
  resolveContext,
  resolveDynamic,
  setPath,
  type A2uiMessage,
  type SurfaceState,
} from '../a2ui';

describe('JSON Pointer', () => {
  const model = { plan: { name: 'Gala', tags: ['gold', 'noir'] }, 'a/b': { '~': 1 } };

  it('parses tokens with ~0/~1 unescaping and handles empty pointers', () => {
    expect(parsePointer('')).toEqual([]);
    expect(parsePointer('/')).toEqual([]);
    expect(parsePointer('/a~1b/~0')).toEqual(['a/b', '~']);
    // ~01 is "~1" literally (unescape ~1 first, then ~0) per RFC 6901.
    expect(parsePointer('/~01')).toEqual(['~1']);
  });

  it('gets nested values, array indices, and misses safely', () => {
    expect(getPath(model, '/plan/name')).toBe('Gala');
    expect(getPath(model, '/plan/tags/1')).toBe('noir');
    expect(getPath(model, '/a~1b/~0')).toBe(1);
    expect(getPath(model, '/plan/missing/deep')).toBeUndefined();
    expect(getPath(model, '/plan/name/length')).toBeUndefined(); // no walking into primitives
    expect(getPath(null, '/x')).toBeUndefined();
    expect(getPath(model, '/')).toBe(model);
  });

  it('blocks prototype-chain tokens (card data is untrusted)', () => {
    expect(getPath(model, '/__proto__/polluted')).toBeUndefined();
    expect(getPath(model, '/plan/constructor')).toBeUndefined();
    expect(getPath({}, '/constructor/prototype')).toBeUndefined();

    const out = setPath({}, '/__proto__/polluted', true) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(out).toEqual({});

    const root = { a: 1 };
    expect(setPath(root, '/a/prototype/x', 1)).toBe(root); // refused, untouched
    expect(setPath(root, '/constructor', 1)).toBe(root);
  });

  it('sets immutably, creating intermediate objects/arrays', () => {
    const next = setPath(model, '/plan/date', '2026-09-12') as typeof model;
    expect(getPath(next, '/plan/date')).toBe('2026-09-12');
    expect(getPath(model, '/plan/date')).toBeUndefined(); // original untouched
    expect(next['a/b']).toBe(model['a/b']); // unrelated branch shared
    expect(next.plan).not.toBe(model.plan); // the touched branch is fresh

    const arr = setPath({}, '/list/0/label', 'A') as Record<string, unknown>;
    expect(Array.isArray(arr.list)).toBe(true);
    expect(getPath(arr, '/list/0/label')).toBe('A');
  });

  it('writes array slots immutably and ignores non-index tokens on arrays', () => {
    const root = { picked: [true, true, false] };
    const next = setPath(root, '/picked/1', false) as typeof root;
    expect(next.picked).toEqual([true, false, false]);
    expect(root.picked).toEqual([true, true, false]);
    expect(setPath(root, '/picked/-1', true)).toEqual(root);
    expect((setPath(root, '/picked/x', true) as typeof root).picked).toBe(root.picked);
  });

  it('deletes with undefined value and replaces root at "/"', () => {
    const next = setPath(model, '/plan/name', undefined);
    expect(getPath(next, '/plan/name')).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(getPath(next, '/plan'), 'name')).toBe(false);
    expect(setPath(model, '/', { fresh: true })).toEqual({ fresh: true });
    expect(setPath(model, '/', undefined)).toEqual({});
    expect((setPath({ list: [1, 2, 3] }, '/list/1', undefined) as { list: number[] }).list).toEqual([1, 3]);
  });
});

describe('applySurfaceMessages', () => {
  const create: A2uiMessage = {
    createSurface: { surfaceId: 's1', catalogId: PBT_STUDIO_CATALOG_ID },
  };
  const components: A2uiMessage = {
    updateComponents: {
      surfaceId: 's1',
      components: [
        { id: 'root', component: 'Card', child: 'col' },
        { id: 'col', component: 'Column', children: ['t'] },
        { id: 't', component: 'Text', text: { path: '/plan/name' } },
      ],
    },
  };
  const data: A2uiMessage = {
    updateDataModel: { surfaceId: 's1', path: '/', value: { plan: { name: 'Gala' } } },
  };

  it('builds a surface from a message stream', () => {
    const s = applySurfaceMessages({}, [create, components, data]);
    expect(s.s1.catalogId).toBe(PBT_STUDIO_CATALOG_ID);
    expect(Object.keys(s.s1.components)).toEqual(['root', 'col', 't']);
    expect(getPath(s.s1.dataModel, '/plan/name')).toBe('Gala');
  });

  it('merges component updates by id and patches the data model at a path', () => {
    const s1 = applySurfaceMessages({}, [create, components, data]);
    const s2 = applySurfaceMessages(s1, [
      { updateComponents: { surfaceId: 's1', components: [{ id: 't', component: 'Text', text: 'fixed' }] } },
      { updateDataModel: { surfaceId: 's1', path: '/plan/date', value: '2026-09-12' } },
    ]);
    expect(s2.s1.components.t.text).toBe('fixed');
    expect(s2.s1.components.root.component).toBe('Card');
    expect(getPath(s2.s1.dataModel, '/plan/date')).toBe('2026-09-12');
    expect(s1.s1.components.t.text).toEqual({ path: '/plan/name' }); // immutability
  });

  it('leaves untouched surfaces with the same identity (memoised cards stay put)', () => {
    const both = applySurfaceMessages({}, [
      create,
      { createSurface: { surfaceId: 's2' } },
    ]);
    const next = applySurfaceMessages(both, [
      { updateDataModel: { surfaceId: 's1', path: '/x', value: 1 } },
    ]);
    expect(next.s2).toBe(both.s2);
    expect(next.s1).not.toBe(both.s1);
  });

  it('a repeated createSurface resets the surface', () => {
    const s1 = applySurfaceMessages({}, [create, components, data]);
    const reset = applySurfaceMessages(s1, [create]);
    expect(reset.s1.components).toEqual({});
    expect(reset.s1.dataModel).toEqual({});
  });

  it('deletes surfaces, tolerates out-of-order and malformed messages', () => {
    const s = applySurfaceMessages({}, [
      { updateDataModel: { surfaceId: 'ghost', path: '/x', value: 1 } }, // before create → implicit
      { updateComponents: { surfaceId: 'ghost', components: [{ id: 'root', component: 'Text', text: 'hi' }] } },
      { updateComponents: { surfaceId: 'ghost', components: [{ id: '', component: '' } as never] } },
      { updateComponents: { surfaceId: 'ghost', components: 'nope' as never } },
      {} as A2uiMessage,
    ]);
    expect(s.ghost.catalogId).toBeNull();
    expect(getPath(s.ghost.dataModel, '/x')).toBe(1);
    expect(Object.keys(s.ghost.components)).toEqual(['root']);
    const gone = applySurfaceMessages(s, [{ deleteSurface: { surfaceId: 'ghost' } }]);
    expect(gone.ghost).toBeUndefined();
  });

  it('keeps the data model an object even when "/" is replaced by a non-object', () => {
    const s = applySurfaceMessages({}, [
      create,
      { updateDataModel: { surfaceId: 's1', path: '/', value: ['not', 'an', 'object'] } },
    ]);
    expect(s.s1.dataModel).toEqual({});
  });
});

describe('bindings', () => {
  const model = { plan: { name: 'Gala', remote: true }, items: [{ label: 'A' }] };

  it('resolves literals, paths, literalString, and relative scope', () => {
    expect(resolveDynamic('plain', model)).toBe('plain');
    expect(resolveDynamic(7, model)).toBe(7);
    expect(resolveDynamic(null, model)).toBeNull();
    expect(resolveDynamic({ path: '/plan/name' }, model)).toBe('Gala');
    expect(resolveDynamic({ literalString: 'as-is' }, model)).toBe('as-is');
    expect(resolveDynamic({ path: 'label' }, model, '/items/0')).toBe('A');
    expect(resolveDynamic({ call: 'formatDate', args: {} }, model)).toBeNull();
  });

  it('joins relative binding paths onto the template scope', () => {
    expect(resolveBindingPath('/abs', '/items/3')).toBe('/abs');
    expect(resolveBindingPath('label', '/items/3')).toBe('/items/3/label');
  });

  it('resolves action context maps deeply at trigger time', () => {
    const ctx = resolveContext(
      { plan: { path: '/plan' }, note: 'confirm', nested: { remote: { path: '/plan/remote' } } },
      model,
    );
    expect(ctx).toEqual({
      plan: { name: 'Gala', remote: true },
      note: 'confirm',
      nested: { remote: true },
    });
    expect(resolveContext(undefined, model)).toEqual({});
  });

  it('exposes the protocol version the Studio speaks', () => {
    expect(A2UI_VERSION).toBe('v0.9.1');
  });
});

// Type-only sanity: SurfaceState shape is what the renderer consumes.
const _typecheck: SurfaceState = { surfaceId: 'x', catalogId: null, components: {}, dataModel: {} };
void _typecheck;
