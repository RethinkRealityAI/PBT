import type { Catalog } from '../catalog';
import { chat } from './chat';
import { chrome } from './chrome';

/**
 * Canadian-French catalog. Typed as `Catalog` so any key missing relative to
 * the English source-of-truth fails `tsc`. Loaded lazily (dynamic import in
 * translate.ts) so French text never weighs down the default bundle.
 */
export const fr: Catalog = {
  ...chrome,
  ...chat,
};
