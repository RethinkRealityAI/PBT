import type { FecalChartsOverlay } from '../../dataL10n/fecalCharts';

/**
 * Chartes de cotation fécale Royal Canin — français canadien (fr-CA).
 *
 * Décisions de terminologie :
 * - Le texte de la charte CHIOTS est repris VERBATIM de l'édition française
 *   de la charte (VGI/066/0324) : titres de cotes, descriptions, sous-titre
 *   et consignes d'utilisation (dont « score le plus élevé », tel quel sur
 *   la charte). Ne pas le reformuler.
 * - Les chartes CHIENS et CHATS n'existent qu'en anglais dans la source
 *   fournie ; elles sont traduites dans le même registre que la charte des
 *   chiots (« selles », « craquelures », « aucune consistance »).
 * - Les cotes, les catégories (bandes) et les chemins d'images ne sont pas
 *   traduits : seuls `label` et `description` sont recouverts.
 */

const DIRECTIVES =
  'Veuillez noter les selles individuellement de 1 (formées et sèches) à 5 ' +
  "(liquides). Si la consistance des selles n'est pas homogène, choisissez le " +
  'score le plus élevé.';

export const fecalCharts: FecalChartsOverlay = {
  dog: {
    title: 'Système de cotation fécale pour chiens',
    directions: DIRECTIVES,
    entries: {
      '1': {
        label: 'SELLES DURES, SÈCHES ET FRIABLES',
        description:
          "Elles ont tendance à se fragmenter plutôt qu'à s'écraser. Difficiles à éliminer pour les chiens.",
      },
      '2': {
        label: 'SELLES SÈCHES, AUX CRAQUELURES TRÈS NETTES',
        description:
          "L'extérieur est très sec et l'intérieur est presque sec. Ne laissent aucun résidu au sol au ramassage.",
      },
      '2.5': {
        label: 'FORME BIEN DÉFINIE AVEC CRAQUELURES VISIBLES',
        description: 'Elles laissent très peu de résidu au sol au ramassage.',
      },
      '3': {
        label: 'SELLES HUMIDES COMMENÇANT À PERDRE LEUR FORME ET LEURS CRAQUELURES',
        description:
          'Les « composantes » de ces selles sont moins distinctes et les craquelures restent visibles.',
      },
      '3.5': {
        label: 'SELLES HUMIDES SANS CRAQUELURES',
        description:
          'Les selles ont une forme distincte. Leurs différentes « composantes » adhèrent les unes aux autres.',
      },
      '4': {
        label: 'SELLES HUMIDES, PEU CONSISTANTES ET SANS FORME RÉELLE',
        description: "Elles retiennent l'eau, sans liquide visible.",
      },
      '4.5': {
        label: 'SELLES LIQUIDES À CONSISTANCE MINIMALE',
        description: '',
      },
      '5': {
        label: 'SELLES ENTIÈREMENT LIQUIDES',
        description: 'Aucune consistance.',
      },
    },
  },

  cat: {
    title: 'Système de cotation fécale pour chats',
    directions: DIRECTIVES,
    entries: {
      '1': {
        label: 'SELLES DURES, SÈCHES ET FRIABLES',
        description:
          "Elles ont tendance à se briser plutôt qu'à s'écraser. Difficiles à éliminer pour les chats.",
      },
      '2': {
        label: 'SELLES BIEN FORMÉES ET DURES',
        description:
          "Ces selles présentent des craquelures très nettes. L'extérieur est très sec et l'intérieur est presque sec.",
      },
      '2.5': {
        label: 'SELLES BIEN FORMÉES ET FERMES',
        description:
          'Ces selles ont une forme bien définie avec des craquelures visibles. Leur surface peut être légèrement humide, mais elles restent bien formées.',
      },
      '3': {
        label: 'SELLES INFORMES, MOLLES MAIS CONSERVANT UNE CERTAINE FORME',
        description:
          'Selles humides sans craquelures. Elles ont une forme distincte.',
      },
      '4': {
        label: 'SELLES TRÈS MOLLES',
        description: 'Selles très humides, mais non liquides.',
      },
      '5': {
        label: 'SELLES LIQUIDES',
        description:
          'Selles entièrement liquides (aucune consistance) ou selles liquides à consistance minimale.',
      },
    },
  },

  puppy: {
    title: 'Système de cotation fécale pour chiots',
    subtitle: 'Pour les chiots âgés de 8 semaines ou plus',
    directions: DIRECTIVES,
    entries: {
      '1': {
        label: 'SELLES BIEN FORMÉES, DURES ET SÈCHES',
        description: 'Difficiles à éliminer pour les chiots.',
      },
      '2': {
        label: 'SELLES BIEN FORMÉES, SÈCHES MAIS PAS DURES',
        description:
          "Selles de forme cylindrique, d'apparence sèche, séparées en crottes.",
      },
      '2.5': {
        label: 'SELLES MOLLES BIEN FORMÉES',
        description:
          'Selles formées mais molles. De forme cylindrique, elles peuvent être séparées en crottes ou entières, avec ou sans craquelures visibles.',
      },
      '3': {
        label: 'SELLES MOLLES SANS FORME DÉFINIE',
        description:
          'Selles principalement informes, comportant une petite partie de forme définie ou partiellement définie détrempée. Une forme cylindrique peut être visible, mais elle disparaît en raison de la consistance trop humide.',
      },
      '4': {
        label: 'SELLES HUMIDES',
        description: 'Selles avec peu de consistance et sans forme définie. Aucun liquide visible.',
      },
      '4.5': {
        label: 'SELLES MOLLES, PARTIELLEMENT LIQUIDES',
        description: 'La plus grande partie des selles est molle ou liquide.',
      },
      '5': {
        label: 'SELLES LIQUIDES',
        description: 'Aucune consistance.',
      },
    },
  },
};
