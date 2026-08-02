import type { ClinicalOverlay } from '../../dataL10n/clinical';

/**
 * Échelles cliniques — français canadien (fr-CA), registre clinique
 * chaleureux-professionnel.
 *
 * Décisions de terminologie :
 * - « BCS » et « MCS » restent tels quels (initialismes du glossaire). Là où
 *   l'anglais les développe, on écrit « cote d'état corporel (BCS) » et
 *   « cote de condition musculaire (MCS) ».
 * - « body fat » → « gras », le mot qu'une équipe de clinique emploie
 *   réellement au Québec (plutôt que « tissu adipeux », trop savant pour une
 *   fiche que le client peut lire par-dessus l'épaule).
 * - « abdominal tuck » → « rétraction abdominale » (terme WSAVA français).
 * - « muscle wasting » → « fonte musculaire ».
 * - Les valeurs numériques, les clés et les couleurs ne sont pas traduites :
 *   seuls `label` et `description` sont recouverts.
 */
export const clinical: ClinicalOverlay = {
  bcs: {
    1: {
      label: 'Émaciation sévère',
      description:
        'Côtes, vertèbres lombaires, os du bassin et toutes les saillies osseuses visibles à distance. Aucun gras corporel décelable. Perte de masse musculaire évidente.',
    },
    2: {
      label: 'Trop maigre',
      description:
        'Côtes, vertèbres lombaires et os du bassin facilement visibles. Aucun gras palpable. Quelques autres saillies osseuses apparentes. Perte de masse musculaire minime.',
    },
    3: {
      label: 'Maigre',
      description:
        'Côtes faciles à palper, parfois visibles, sans gras palpable. Sommet des vertèbres lombaires visible. Os du bassin de plus en plus saillants. Taille et rétraction abdominale marquées.',
    },
    4: {
      label: 'Mince, dans l’idéal',
      description:
        'Côtes faciles à palper sous une mince couche de gras. Taille bien visible vue de dessus. Rétraction abdominale évidente.',
    },
    5: {
      label: 'Idéal',
      description:
        'Côtes palpables sans excès de gras. Taille perceptible derrière les côtes vue de dessus. Abdomen relevé vu de profil.',
    },
    6: {
      label: 'Au-dessus de l’idéal',
      description:
        'Côtes palpables sous un léger excès de gras. Taille perceptible vue de dessus, mais peu marquée. Rétraction abdominale encore apparente.',
    },
    7: {
      label: 'Embonpoint',
      description:
        'Côtes difficiles à palper sous une épaisse couche de gras. Dépôts de gras notables dans la région lombaire et à la base de la queue. Taille absente ou à peine visible. Rétraction abdominale parfois présente.',
    },
    8: {
      label: 'Obésité',
      description:
        'Côtes non palpables sous une très épaisse couche de gras, ou palpables seulement avec une forte pression. Dépôts de gras importants dans la région lombaire et à la base de la queue. Aucune taille. Aucune rétraction abdominale.',
    },
    9: {
      label: 'Obésité sévère',
      description:
        'Dépôts de gras massifs sur le thorax, la colonne et la base de la queue. Taille et rétraction abdominale absentes. Dépôts de gras au cou et aux membres. Distension abdominale évidente.',
    },
  },
  mcs: {
    normal: {
      label: 'Masse musculaire normale',
      description:
        'Aucune fonte décelable à la palpation de la colonne, des scapulas, du crâne ou des ailes de l’ilium.',
    },
    mild: {
      label: 'Perte légère',
      description:
        'Légère diminution des muscles épaxiaux le long de la colonne. Souvent manquée sans palpation.',
    },
    moderate: {
      label: 'Perte modérée',
      description:
        'Diminution nette à la colonne et aux sites secondaires. Visible à l’œil exercé.',
    },
    severe: {
      label: 'Perte sévère',
      description:
        'Fonte musculaire profonde à plusieurs sites. Préoccupation clinique importante.',
    },
  },
};
