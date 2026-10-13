/**
 * The team's categories and objections, handed down the Studio tree.
 *
 * The screens own the fetching (`useObjections`) and provide it here; steps,
 * the card preview, the Test drive and the assistant read it with
 * `useObjectionsContext()`. Outside a provider (a step rendered on its own in
 * a test) the value is an empty, unavailable list: only the built-in
 * objections are offered and nothing tries to write.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { ObjectionsApi } from './useObjections';
import { builtInAdminCategories } from './categoriesModel';

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Objections aren’t available here.'));
}

export const NO_OBJECTIONS: ObjectionsApi = {
  status: 'idle',
  objections: [],
  deleted: [],
  // The built-ins are always there, so a step rendered on its own still
  // groups the built-in objections by category.
  categories: builtInAdminCategories(),
  deletedCategories: [],
  error: null,
  missingTable: false,
  loadedAt: null,
  loaded: false,
  loading: false,
  available: false,
  refetch: () => {},
  save: unavailable,
  remove: unavailable,
  restore: unavailable,
  saveCategory: unavailable,
  removeCategory: unavailable,
  restoreCategory: unavailable,
};

const ObjectionsContext = createContext<ObjectionsApi>(NO_OBJECTIONS);

export function ObjectionsProvider({ value, children }: { value: ObjectionsApi; children: ReactNode }) {
  return <ObjectionsContext.Provider value={value}>{children}</ObjectionsContext.Provider>;
}

export function useObjectionsContext(): ObjectionsApi {
  return useContext(ObjectionsContext);
}
