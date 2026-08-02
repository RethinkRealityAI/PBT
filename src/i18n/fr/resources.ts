/**
 * fr-CA — Bibliothèque / référence clinique.
 *
 * Registre : vouvoiement, ton clinique concis.
 * Décisions de terminologie :
 * - « BCS » et « MCS » restent tels quels (initialismes cliniques du
 *   glossaire) ; on développe « cote d'état corporel (BCS) » là où l'anglais
 *   développe aussi.
 * - « WSAVA », « NRC », « DMER », « Tufts University » : noms propres.
 * - Espace fine insécable (U+202F) devant « % » et « : », typographie
 *   française.
 */
import type { resources as en } from '../en/resources';

export const resources: Record<keyof typeof en, string> = {
  'resources.title': 'Bibliothèque',
  'resources.headline': 'La référence clinique,\nau rythme de la conversation.',

  // ── Évaluation nutritionnelle ─────────────────────────────
  'resources.nutrition.eyebrow': 'Évaluation nutritionnelle',
  'resources.nutrition.title':
    'Un dépistage en six questions qui entre dans toute consultation.',
  'resources.nutrition.summary':
    "Le dépistage du WSAVA Global Nutrition Toolkit couvre l'histoire alimentaire, l'état corporel, l'état musculaire, les besoins liés au stade de vie, l'environnement et le format du produit.",
  'resources.nutrition.topic1.title': 'Le dépistage de 5 secondes',
  'resources.nutrition.topic1.body':
    "BCS + MCS + histoire alimentaire. Tout écart par rapport à la normale déclenche une évaluation complète.",
  'resources.nutrition.topic2.title': 'Pourquoi se fier au BCS',
  'resources.nutrition.topic2.body':
    "La cote d'état corporel est plus fiable que le poids seul — même race, gabarits différents, poids idéaux très différents.",
  'resources.nutrition.topic3.title': "Signaux d'alarme dans l'histoire alimentaire",
  'resources.nutrition.topic3.body':
    "Plusieurs marques alternées chaque semaine, cru sans supplémentation, ou sans grains depuis plus de 12 mois sans antécédent gastro-intestinal.",

  // ── État corporel (BCS) ───────────────────────────────────
  'resources.bcs.eyebrow': "État corporel (BCS)",
  'resources.bcs.title': 'Cote de 1 à 9 : côtes, taille, repli abdominal.',
  'resources.bcs.summary':
    "Un système visuel et palpatoire. De 4 à 5, c'est l'idéal pour la plupart des chiens adultes. Chaque point au-dessus de 5 ≈ 10 à 15 % au-dessus du poids idéal.",
  'resources.bcs.topic1.title': 'Comment palper',
  'resources.bcs.topic1.body':
    "Pression légère sur les côtes. Faciles à sentir, avec une mince couche de gras = idéal. Difficiles à sentir = surpoids.",
  'resources.bcs.topic2.title': 'Repères visuels',
  'resources.bcs.topic2.body':
    "Abdomen relevé et taille visible du dessus = santé. Ni repli ni taille = BCS élevé.",

  // ── État musculaire (MCS) ─────────────────────────────────
  'resources.mcs.eyebrow': 'État musculaire (MCS)',
  'resources.mcs.title':
    'Indépendant du BCS — coté sur quatre repères osseux.',
  'resources.mcs.summary':
    "Colonne, scapulas, crâne, ailes iliaques. Catégories : normal, léger, modéré, sévère. Fréquent chez les aînés et en maladie chronique.",
  'resources.mcs.topic1.title': 'Pourquoi le MCS compte à part',
  'resources.mcs.topic1.body':
    "Un chien peut être à la fois en surpoids (BCS 7 et plus) et en fonte musculaire (MCS modéré). Les calories seules ne corrigent pas la perte de muscle.",
  'resources.mcs.topic2.title': 'Quand le signaler',
  'resources.mcs.topic2.body':
    "Tout MCS anormal justifie un dépistage de maladie chronique et un plan nutritionnel axé sur les protéines.",

  // ── Cibles caloriques ─────────────────────────────────────
  'resources.calories.eyebrow': 'Cibles caloriques',
  'resources.calories.title':
    '130 × kg^0,75 actif · 95 × kg^0,75 inactif.',
  'resources.calories.summary':
    "Besoin énergétique d'entretien quotidien (DMER) selon le NRC 2006. Pour une perte de poids, visez 80 % du DMER calculé sur le poids idéal — pas le poids actuel.",
  'resources.calories.topic1.title': "Erreurs d'alimentation courantes",
  'resources.calories.topic1.body':
    "Les gâteries représentent en moyenne de 10 à 15 % de l'apport quotidien — souvent non comptabilisées. L'alimentation à volonté amplifie la dérive du BCS.",
  'resources.calories.topic2.title': 'Calcul pratique',
  'resources.calories.topic2.body':
    "Un Lab de 30 kg au niveau actif = 130 × 30^0,75 ≈ 1665 kcal/jour. Comparez au guide d'alimentation du sac actuel.",

  // ── Pied de page : sources ────────────────────────────────
  'resources.sources.label': 'Sources',
  'resources.sources.body':
    'WSAVA Global Nutrition Toolkit · Chartes de cotation corporelle et musculaire (2020) · Charte MCS de Tufts University (2013) · DMER du NRC 2006',
};
