import { en } from './en';

/** Key union derived from the English catalog — the canonical key set. */
export type CatalogKey = keyof typeof en;

/**
 * Every non-English locale exports a `Catalog`: typing it this way makes a
 * MISSING key a compile error. (Extra keys are caught by the parity test.)
 */
export type Catalog = Record<CatalogKey, string>;
