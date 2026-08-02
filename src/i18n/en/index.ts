import { actGuide } from './actGuide';
import { analyzer } from './analyzer';
import { auth } from './auth';
import { chat } from './chat';
import { chrome } from './chrome';
import { create } from './create';
import { feedback } from './feedback';
import { history } from './history';
import { home } from './home';
import { onboarding } from './onboarding';
import { quiz } from './quiz';
import { report } from './report';
import { resources } from './resources';
import { result } from './result';
import { scorecard } from './scorecard';
import { settings } from './settings';
import { stats } from './stats';
import { terms } from './terms';

/**
 * The English catalog is the source of truth: its keys define `CatalogKey`,
 * and every other locale must cover exactly this key set. Namespace files
 * are spread-merged here; a duplicate key across namespaces is caught by
 * `src/i18n/__tests__/catalog.test.ts`.
 */
export const en = {
  ...chrome,
  ...chat,
  ...home,
  ...create,
  ...settings,
  ...analyzer,
  ...onboarding,
  ...terms,
  ...quiz,
  ...result,
  ...stats,
  ...scorecard,
  ...feedback,
  ...history,
  ...resources,
  ...actGuide,
  ...auth,
  ...report,
} as const;
