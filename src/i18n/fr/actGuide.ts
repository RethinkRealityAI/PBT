/**
 * fr-CA — Guide ACT (chrome de l'écran seulement).
 *
 * Décisions de glossaire :
 * - « ACT » reste ACT ; les trois étapes développées deviennent
 *   Reconnaître / Clarifier / Transformer.
 * - Les noms de moteurs ECHO (Activator, Energizer, Analyzer, Harmonizer) et
 *   les produits Royal Canin (Satiety Support) ne se traduisent jamais.
 * - Les noms de chiens dans les exemples (Bella, Max) restent tels quels.
 * - Espace fine insécable (U+202F) devant « % », « ? » et « : ».
 * - Registre : vouvoiement (l'app s'adresse à la personne en formation) ;
 *   les répliques de client peuvent tutoyer le chien, jamais le client.
 */
import type { actGuide as en } from '../en/actGuide';

export const actGuide: Record<keyof typeof en, string> = {
  'actGuide.title': 'Guide ACT',
  'actGuide.framework': 'Méthode',
  'actGuide.subtitle': 'Reconnaître · Clarifier · Transformer',
  'actGuide.intro':
    "Une méthode éprouvée en 3 étapes pour transformer les objections des clients en vraies conversations.",
  'actGuide.threeSteps': 'Les trois étapes',

  'actGuide.step.acknowledge.label': 'RECONNAÎTRE',
  'actGuide.step.clarify.label': 'CLARIFIER',
  'actGuide.step.takeAction.label': 'TRANSFORMER',

  'actGuide.step.acknowledge.description':
    "Ne vous excusez pas — montrez de l'empathie, pas de la faiblesse. Validez l'émotion avant toute chose.",
  'actGuide.step.clarify.description':
    "Posez une seule question ouverte à la fois. Laissez la personne parler. Écoutez la vraie préoccupation sous l'objection.",
  'actGuide.step.takeAction.description':
    "Ramenez la conversation sur la valeur. Partez du résultat, rattachez-le à un bénéfice précis du produit et fixez une prochaine étape claire.",

  'actGuide.step.acknowledge.phrase':
    '« Je vous entends — Bella compte énormément pour vous, ça se voit. »',
  'actGuide.step.clarify.phrase':
    '« Décrivez-moi une journée type — combien d’exercice fait-elle ? »',
  'actGuide.step.takeAction.phrase':
    '« Faisons un essai de 4 semaines. 97 % des chiens ont perdu du poids en 12 semaines — je vous rappelle à la deuxième semaine. »',

  'actGuide.stepIndex': 'Étape {index} · {label}',
  'actGuide.examplePhrase': 'Exemple de formulation',

  // ── Votre moteur × ACT ────────────────────────────────────
  'actGuide.driverSection': 'Votre moteur et ACT',
  'actGuide.driverLabel': 'Votre moteur · {driver}',
  'actGuide.driverTip.Activator':
    "Votre énergie est votre superpouvoir dans ACT. Ouvrez par une reconnaissance directe et assurée — le client sent votre conviction. À l'étape Clarifier, posez des questions franches qui vont vite au vrai enjeu. À l'étape Transformer, peignez un portrait vivant du résultat pour donner envie d'agir.",
  'actGuide.driverTip.Energizer':
    "Votre enthousiasme naturel rend l'étape Reconnaître chaleureuse et sincère — les clients s'ouvrent à vous. Servez-vous de Clarifier pour approfondir ce lien avec des questions curieuses et ouvertes. À l'étape Transformer, misez sur votre talent de conteur : un exemple concret fait atterrir la proposition de valeur sur le plan émotionnel.",
  'actGuide.driverTip.Analyzer':
    "La précision est votre force dans ACT. Votre reconnaissance doit être mesurée et précise — reprenez leurs mots exacts. Clarifiez avec des questions orientées données pour découvrir la préoccupation de fond. À l'étape Transformer, appuyez-vous sur les preuves : faits, études de cas et rendement clair rendent votre proposition irrésistible.",
  'actGuide.driverTip.Harmonizer':
    "L'empathie est déjà inscrite dans votre façon de reconnaître — le client se sent vraiment entendu. Clarifiez en douceur, en vous concentrant sur ce qui compte le plus pour la relation. À l'étape Transformer, formulez la valeur en termes de partenariat et de résultats à long terme ; les Harmonizer concluent avec attention, pas avec pression.",
  'actGuide.practiceCta': 'Pratiquer dans le simulateur',

  // ── Exemple concret ───────────────────────────────────────
  'actGuide.exampleSection': 'Un exemple en pratique',
  'actGuide.example.objectionLabel': 'Objection du client',
  'actGuide.example.objection':
    '« Vos prix sont trop élevés — je trouve une nourriture semblable au supermarché pour la moitié du prix ! »',
  'actGuide.example.acknowledge':
    '« Je comprends tout à fait — le budget est un vrai facteur, et vous voulez visiblement ce qu’il y a de mieux pour Max. »',
  'actGuide.example.clarify':
    '« Qu’est-ce qui vous convaincrait qu’un changement d’alimentation en vaut la peine pour lui ? »',
  'actGuide.example.takeAction':
    '« D’après ce que vous me dites, Satiety Support est conçu exactement pour ça — 97 % des chiens ont perdu du poids en 12 semaines. Faisons un essai de 4 semaines. »',
};
