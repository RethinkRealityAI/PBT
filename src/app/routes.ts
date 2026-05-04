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
