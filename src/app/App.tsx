import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from './providers/ThemeProvider';
import { ProfileProvider, useProfile } from './providers/ProfileProvider';
import {
  NavigationProvider,
  useNavigation,
} from './providers/NavigationProvider';
import { ScenarioProvider } from './providers/ScenarioProvider';
import { ChatProvider } from './providers/ChatProvider';
import { SessionProvider } from './providers/SessionProvider';
import type { Screen } from './routes';
import { SCREENS_WITH_TAB_BAR } from './routes';

import { mountKeyframes } from '../design-system/keyframes';
import { AppFrame } from '../shell/AppFrame';
import { TabBar } from '../shell/TabBar';
import { useCloudSync } from '../features/auth/useCloudSync';

import { OnboardingScreen } from '../screens/OnboardingScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CreateScreen } from '../screens/CreateScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { PetAnalyzerScreen } from '../screens/PetAnalyzerScreen';
import { ResourcesScreen } from '../screens/ResourcesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

import { readStorage, STORAGE_KEYS, getOrCreateSessionId } from '../lib/storage';

function getInitialScreen(): Screen {
  const terms = readStorage(STORAGE_KEYS.termsAcceptedAt);
  if (!terms) return 'onboarding';
  return 'home';
}

export function App() {
  useEffect(() => {
    mountKeyframes();
    getOrCreateSessionId();
  }, []);

  return (
    <ThemeProvider>
      <SessionProvider>
        <ProfileProvider>
          <ScenarioProvider>
            <NavigationProvider initial={getInitialScreen()}>
              <ChatProvider>
                <AppFrame>
                  <RouteResolver>
                    <ScreenSwitch />
                  </RouteResolver>
                  <TabBarHost />
                </AppFrame>
              </ChatProvider>
            </NavigationProvider>
          </ScenarioProvider>
        </ProfileProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

/** Once mounted, if no profile exists and we're not in onboarding/quiz, route to quiz. */
function RouteResolver({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const { current, replace } = useNavigation();
  useEffect(() => {
    if (!profile && current !== 'onboarding' && current !== 'quiz') {
      replace('quiz');
    }
  }, [profile, current, replace]);
  return <>{children}</>;
}

function TabBarHost() {
  const { current } = useNavigation();
  useCloudSync();
  if (!SCREENS_WITH_TAB_BAR.includes(current)) return null;
  return <TabBar />;
}

function ScreenSwitch() {
  const { current } = useNavigation();
  switch (current) {
    case 'onboarding':
      return <OnboardingScreen />;
    case 'quiz':
      return <QuizScreen />;
    case 'result':
      return <ResultScreen />;
    case 'home':
      return <HomeScreen />;
    case 'create':
      return <CreateScreen />;
    case 'chat':
      return <ChatScreen />;
    case 'stats':
      return <StatsScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'analyzer':
      return <PetAnalyzerScreen />;
    case 'resources':
      return <ResourcesScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return null;
  }
}
