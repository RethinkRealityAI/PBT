/**
 * fr-CA — habillage du questionnaire ECHO (les questions et les réponses
 * viennent du module de données, pas d'ici).
 *
 * Terminologie : « ECHO » reste tel quel; le concept de « driver » est rendu
 * par « profil » (anglicisme évité, registre québécois).
 */
import type { quiz as en } from '../en/quiz';

export const quiz: Record<keyof typeof en, string> = {
  'quiz.title': 'Questionnaire des profils ECHO',
  'quiz.back.aria': 'Retour',
  'quiz.theme.toLight.aria': 'Passer au mode clair',
  'quiz.theme.toDark.aria': 'Passer au mode sombre',
  'quiz.part': 'Partie {part} · {label}',
  'quiz.tieBreaker.label': "Bris d'égalité",
  'quiz.tieBreaker.heading': 'Dernière question · choisissez ce qui vous ressemble le plus',
};
