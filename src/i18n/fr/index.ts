import type { Catalog } from '../catalog';
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
import { actGuide as actGuideData } from './data/actGuide';
import { clinical } from './data/clinical';
import { drivers as driversData } from './data/drivers';
import { pushbacks } from './data/pushbacks';
import { quiz as quizData } from './data/quiz';
import { rubric } from './data/rubric';
import { scenarios } from './data/scenarios';

/**
 * Canadian-French catalog. Typed as `Catalog` so any key missing relative to
 * the English source-of-truth fails `tsc`. Loaded lazily (dynamic import in
 * translate.ts) so French text never weighs down the default bundle.
 */
export const fr: Catalog = {
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
};

/**
 * Structured authored-data overlays (quiz/driver/scenario/clinical text),
 * registered by loadCatalog into src/i18n/dataRegistry.ts. Domains are added
 * by the data-l10n batches as `./data/<domain>.ts` files and spread here.
 */
export const frData: Record<string, unknown> = {
  quiz: quizData,
  drivers: driversData,
  clinical,
  actGuide: actGuideData,
  scenarios,
  pushbacks,
  rubric,
};
