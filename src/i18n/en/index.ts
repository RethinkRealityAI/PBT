import { chat } from './chat';
import { chrome } from './chrome';

/**
 * The English catalog is the source of truth: its keys define `CatalogKey`,
 * and every other locale must cover exactly this key set. Namespace files
 * are spread-merged here; a duplicate key across namespaces is caught by
 * `src/i18n/__tests__/catalog.test.ts`.
 */
export const en = {
  ...chrome,
  ...chat,
} as const;
