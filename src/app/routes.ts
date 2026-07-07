export type Screen =
  | 'onboarding'
  | 'terms'
  | 'quiz'
  | 'result'
  | 'home'
  | 'create'
  | 'chat'
  | 'stats'
  | 'history'
  | 'historyDetail'
  | 'analyzer'
  | 'resources'
  | 'settings'
  | 'actGuide';

export const SCREENS_WITH_TAB_BAR: Screen[] = [
  'home',
  'history',
  'resources',
  'settings',
];

/**
 * Pre-onboarding flow — the app chrome (desktop sidebar) is hidden on these
 * screens so a first-time user can't jump into gated areas before finishing
 * terms + the ECHO quiz. The sidebar also requires a locked profile to show.
 */
export const PRE_ONBOARDING_SCREENS: Screen[] = [
  'onboarding',
  'terms',
  'quiz',
  'result',
];

export interface TabDef {
  screen: Screen;
  label: string;
  iconKey: 'flame' | 'history' | 'book' | 'user';
}

export const TABS: TabDef[] = [
  { screen: 'home', label: 'Train', iconKey: 'flame' },
  { screen: 'history', label: 'History', iconKey: 'history' },
  { screen: 'resources', label: 'Library', iconKey: 'book' },
  { screen: 'settings', label: 'You', iconKey: 'user' },
];
