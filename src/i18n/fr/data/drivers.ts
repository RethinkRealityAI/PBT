import type { DriverOverlay } from '../../dataL10n/drivers';

/**
 * Canadian-French overlay for the ECHO driver cards
 * (`src/data/echoDrivers.ts`). Display text only.
 *
 * Driver names — Activator · Energizer · Analyzer · Harmonizer — are product
 * proper nouns and persisted `profiles` values: they stay in English, and the
 * overlay carries no `name` field so it cannot accidentally localize them.
 */
export const drivers: DriverOverlay = {
  Activator: {
    tagline: 'Des attentes claires, une action rapide',
    blurb:
      'Vous faites avancer les conversations avec aplomb. Les propriétaires savent exactement quoi faire ensuite, et votre certitude leur inspire confiance.',
    traits: [
      {
        name: 'Maître de la délégation',
        description:
          'Vous confiez les prochaines étapes clairement — sans détour, sans tourner autour du pot. Le client repart avec un plan.',
      },
      {
        name: 'Gardien de la progression',
        description:
          'Vous suivez l’exécution de près et intervenez rapidement pour garder les soins sur la bonne voie.',
      },
      {
        name: 'Autorité décisive',
        description:
          'Vous êtes à l’aise de faire des recommandations difficiles : les soins passent avant la popularité.',
      },
      {
        name: 'Maîtrise inébranlable',
        description:
          'Vous répondez rapidement aux objections à vos conseils et gardez la conversation bien centrée.',
      },
      {
        name: 'La clarté avant tout',
        description:
          'Votre communication directe fait que chaque propriétaire repart avec le même message.',
      },
    ],
    growth:
      'À surveiller : la vitesse au détriment de la chaleur. Ralentissez vos 30 premières secondes et nommez l’inquiétude avant de nommer le plan.',
  },
  Energizer: {
    tagline: 'La motivation par le positif',
    blurb:
      'Vous amenez de la chaleur et de l’élan dans chaque échange. Les propriétaires se sentent assez en confiance pour poser la question gênante.',
    traits: [
      {
        name: 'Champion de l’esprit d’équipe',
        description:
          'Vous créez un climat positif dès les dix premières secondes d’une conversation.',
      },
      {
        name: 'Motivateur naturel',
        description:
          'L’humour est votre superpouvoir : les propriétaires repartent portés, jamais sermonnés.',
      },
      {
        name: 'Bâtisseur de relations',
        description:
          'Des liens solides avec la clientèle sont au cœur de votre pratique.',
      },
      {
        name: 'Désamorceur de conflits',
        description:
          'Vous utilisez habilement l’humour pour faire baisser la tension quand les objections se durcissent.',
      },
      {
        name: 'Multiplicateur d’enthousiasme',
        description:
          'Votre énergie positive donne aux propriétaires le goût de suivre le plan jusqu’au bout.',
      },
    ],
    growth:
      'À surveiller : passer par-dessus les vraies inquiétudes pour garder l’ambiance légère. Ralentissez et nommez l’inquiétude à voix haute.',
  },
  Analyzer: {
    tagline: 'La qualité d’abord, à l’aise dans les détails',
    blurb:
      'Vous appuyez chaque recommandation sur des données probantes. Les propriétaires sceptiques repartent convaincus, parce que les chiffres sont là, devant eux.',
    traits: [
      {
        name: 'Défenseur de l’excellence',
        description:
          'Vous privilégiez le travail minutieux et invitez les propriétaires à poser la question de fond.',
      },
      {
        name: 'La qualité avant la vitesse',
        description:
          'Vous préférez une conversation de 4 minutes qui porte à une de 90 secondes qui tombe à plat.',
      },
      {
        name: 'Accompagnement constructif',
        description:
          'Vous donnez une rétroaction réfléchie, axée sur les solutions plutôt que sur la confrontation.',
      },
      {
        name: 'La logique règne',
        description:
          'Quand les émotions montent, vous ramenez la conversation aux données.',
      },
      {
        name: 'Responsabiliser par la confiance',
        description:
          'Vous reconnaissez les propriétaires qui partagent votre souci de la qualité et vous leur donnez les moyens d’agir.',
      },
    ],
    growth:
      'À surveiller : trop de détails, trop tôt. Commencez par l’essentiel et gardez les preuves pour le moment où on vous les demande.',
  },
  Harmonizer: {
    tagline: 'Bâtir la confiance pour des soins optimaux',
    blurb:
      'Vous rejoignez les propriétaires là où ils sont. Ils se sentent écoutés avant de sentir qu’on leur vend quelque chose — c’est pour ça qu’ils vous écoutent.',
    traits: [
      {
        name: 'Défenseur de l’équipe',
        description:
          'Vous défendez le bien-être de chaque animal et de chaque propriétaire devant vous.',
      },
      {
        name: 'Bâtisseur de relations',
        description:
          'Vos appels de suivi portent parce que la relation est déjà bien réelle.',
      },
      {
        name: 'Champion de l’équité',
        description:
          'Vous veillez à ce que les clients se sentent traités équitablement, jamais poussés à décider.',
      },
      {
        name: 'Coup de pouce motivant',
        description:
          'En nourrissant la confiance du propriétaire en lui-même, vous l’amenez à passer à l’action.',
      },
      {
        name: 'La force de la collaboration',
        description:
          'Vous invitez les propriétaires à participer au plan au lieu de le leur imposer.',
      },
    ],
    growth:
      'À surveiller : ne pas insister assez quand un propriétaire a besoin d’une recommandation claire et ferme. Exercez-vous à faire la demande ferme.',
  },
};
