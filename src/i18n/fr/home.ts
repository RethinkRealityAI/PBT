import type { home as enHome } from '../en/home';

export const home: Record<keyof typeof enHome, string> = {
  'home.streak.days': 'Série de {count} jours',
  'home.streak.daysOne': 'Série de 1 jour',
  'home.streak.practicedToday': 'Pratique faite aujourd’hui',
  'home.streak.keepItAlive': 'Pratiquez aujourd’hui pour la garder',
  'home.streak.thisWeek': '{count} cette semaine',
  'home.streak.thisWeekOne': '1 cette semaine',
  'home.streak.aria': 'Série de pratique',
} as const;
