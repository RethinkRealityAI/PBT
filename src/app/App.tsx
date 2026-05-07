import { useEffect, useRef, type ReactNode } from 'react';
import { ThemeProvider } from './providers/ThemeProvider';
import { ProfileProvider, useProfile } from './providers/ProfileProvider';
import {
  NavigationProvider,
  useNavigation,
} from './providers/NavigationProvider';
import { ScenarioProvider } from './providers/ScenarioProvider';
import { ChatProvider, useChat } from './providers/ChatProvider';
import { SessionProvider } from './providers/SessionProvider';
import type { Screen } from './routes';
import { SCREENS_WITH_TAB_BAR } from './routes';

import { mountKeyframes } from '../design-system/keyframes';
import { AppFrame } from '../shell/AppFrame';
import { TabBar } from '../shell/TabBar';
import { useCloudSync } from '../features/auth/useCloudSync';
import { logEvent, startAnalytics } from '../lib/analytics';

import { OnboardingScreen } from '../screens/OnboardingScreen';
import { TermsScreen } from '../screens/TermsScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ResultScreen } from '../screens/ResultScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CreateScreen } from '../screens/CreateScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HistoryDetailScreen } from '../screens/HistoryDetailScreen';
import { PetAnalyzerScreen } from '../screens/PetAnalyzerScreen';
import { ResourcesScreen } from '../screens/ResourcesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ActGuideScreen } from '../screens/ActGuideScreen';

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
    startAnalytics();
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
                  <ScreenViewLogger />
                  <ChatAbandonWatcher />
                </AppFrame>
              </ChatProvider>
            </NavigationProvider>
          </ScenarioProvider>
        </ProfileProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

/** Emits a `screen_view` nav_event each time the current screen changes. */
function ScreenViewLogger() {
  const { current } = useNavigation();
  useEffect(() => {
    logEvent({ type: 'screen_view', screen: current });
  }, [current]);
  return null;
}

/**
 * When the user navigates away from `chat` while a session is mid-flight
 * (status awaitingUser / aiTyping), mark it abandoned so the admin
 * dashboard sees an honest completion rate.
 */
function ChatAbandonWatcher() {
  const { current } = useNavigation();
  const chat = useChat();
  const prevScreenRef = useRef<Screen>(current);
  useEffect(() => {
    const prev = prevScreenRef.current;
    prevScreenRef.current = current;
    if (prev !== 'chat' || current === 'chat') return;
    if (chat.status === 'awaitingUser' || chat.status === 'aiTyping' || chat.status === 'opening') {
      void chat.abandon('user_exit');
    }
  }, [current, chat]);
  return null;
}

/** Once mounted, if no profile exists and we're not in a pre-quiz screen, route to quiz. */
function RouteResolver({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const { current, replace } = useNavigation();
  useEffect(() => {
    if (!profile && current !== 'onboarding' && current !== 'terms' && current !== 'quiz') {
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
    case 'terms':
      return <TermsScreen />;
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
    case 'historyDetail':
      return <HistoryDetailScreen />;
    case 'analyzer':
      return <PetAnalyzerScreen />;
    case 'resources':
      return <ResourcesScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'actGuide':
      return <ActGuideScreen />;
    default:
      return null;
  }
}
