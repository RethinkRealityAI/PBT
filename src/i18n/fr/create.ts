/**
 * Créateur de scénarios — français canadien (fr-CA), vouvoiement, registre
 * chaleureux-professionnel de clinique.
 *
 * Décisions de terminologie :
 * - « pushback » → « objection » (le mot qu'une équipe de clinique emploie),
 *   jamais « recul » ni « résistance ».
 * - « ECHO driver » → « moteur ECHO » : « ECHO » et les noms des moteurs
 *   (Activator, Energizer, Analyzer, Harmonizer) ne se traduisent jamais.
 * - ACT : « Reconnaître / Clarifier / Transformer » (glossaire).
 * - « kg » et « Rx » restent tels quels.
 * - Ponctuation double précédée d'une espace ordinaire, comme les autres
 *   catalogues fr du dépôt (les pourcentages passent par i18n/format.ts, qui
 *   pose lui-même l'espace fine insécable).
 */
import type { create as en } from '../en/create';

export const create: Record<keyof typeof en, string> = {
  // ── Chrome de l'écran / onglets ───────────────────────────
  'create.title': 'Créer un scénario',
  'create.tabsAria': 'Onglets de scénario',
  'create.tab.build': 'Créer',
  'create.tab.library': 'Bibliothèque',

  // ── Onglet Bibliothèque ───────────────────────────────────
  'create.library.start': 'Lancer',

  // ── Titres de section ─────────────────────────────────────
  'create.section.breed': 'Race',
  'create.section.lifeStage': 'Stade de vie',
  'create.section.pushback': "L'objection",
  'create.section.persona': 'Profil du propriétaire',
  'create.section.driver': 'Moteur ECHO',
  'create.section.difficulty': 'Difficulté',
  'create.section.details': 'Détails supplémentaires',

  // ── Race et poids ─────────────────────────────────────────
  'create.breed.placeholder': 'Rechercher une race',
  'create.breed.error': 'Choisissez une race ou saisissez-en une.',
  'create.savedPets.eyebrow': 'Fiches enregistrées',
  'create.weight.unit': 'kg',
  'create.weight.label': 'Poids du chien (facultatif)',

  // ── Sélecteur d'objection ─────────────────────────────────
  'create.pushback.selectAria': "Choisir un type d'objection",
  'create.pushback.placeholder': "Choisissez un type d'objection…",
  'create.pushback.notesOptional': "Qu'ont-ils dit exactement ? · facultatif",
  'create.pushback.notesOptionalPlaceholder':
    "Ajoutez leurs mots exacts ou la nuance — l'IA restera plus précise.",
  'create.pushback.or': 'ou',
  'create.pushback.otherTitle': 'Autre objection',
  'create.pushback.otherSub': 'Décrivez n’importe quelle objection dans vos mots',
  'create.pushback.notesRequired': "Sur quoi ont-ils émis une objection ? · obligatoire",
  'create.pushback.notesRequiredPlaceholder':
    'ex. « Ils insistaient : la nourriture senior d’épicerie est identique à la Rx… »',
  'create.pushback.error': 'Décrivez ce que le client a contesté.',

  // ── Difficulté et détails ─────────────────────────────────
  'create.difficulty.aria': 'Difficulté',
  'create.details.placeholder':
    'Précisez — ce qui a été dit, ce qui a bloqué la conversation…',

  // ── Soumission ────────────────────────────────────────────
  'create.submit': 'Lancer le scénario',

  // ── Repères ACT avant la séance (ScenarioHints) ───────────
  'create.hints.eyebrow': 'Ce qui rapporte des points',
  'create.hints.acknowledge': 'Reconnaître',
  'create.hints.clarify': 'Clarifier',
  'create.hints.takeAction': 'Passer à l’action',
};
