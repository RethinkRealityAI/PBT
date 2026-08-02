/**
 * fr-CA — habillage de l'écran de résultat du questionnaire.
 *
 * Terminologie : « ECHO » reste tel quel, les noms des profils (Activator,
 * Energizer, Analyzer, Harmonizer) ne sont jamais traduits, et le concept de
 * « driver » est rendu par « profil ». `{pct}` arrive déjà formaté (espace
 * fine insécable avant le %).
 */
import type { result as en } from '../en/result';

export const result: Record<keyof typeof en, string> = {
  'result.intro.phase1': 'Recherche de votre profil de personnalité ECHO',
  'result.intro.phase2': 'Analyse des questions et des réponses',
  'result.intro.phase3': 'Configuration de votre profil',
  'result.intro.primaryLabel': 'Votre profil ECHO principal',
  'result.intro.secondaryLabel': 'Votre profil de soutien',

  'result.primary.badge': 'Profil principal · {pct} de correspondance',
  'result.support.label': 'Profil de soutien',
  'result.mix.title': 'Répartition des profils · {count} réponses',
  'result.inPractice': '{driver} · en pratique',
  'result.growthEdge': 'Piste de progression',
  'result.cta.startTraining': "Commencer l'entraînement",
};
