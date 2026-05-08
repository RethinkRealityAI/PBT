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
import { FlagProvider, useFlag, useFlags } from './providers/FlagProvider';
import { useScenario } from './providers/ScenarioProvider';
import {
  adminOverrideToScenario,
  applyScenarioOverride,
  isAdminScenarioId,
  seedScenarioId,
} from '../data/scenarioOverrides';
import { LIBRARY_SCENARIOS } from '../data/scenarios';
import type { ScenarioOverride } from '../services/flagsClient';
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
          <FlagProvider>
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
                    <PreviewRunner />
                  </AppFrame>
                </ChatProvider>
              </NavigationProvider>
            </ScenarioProvider>
          </FlagProvider>
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

/**
 * Each gated screen redirects to home when its flag is off. We check before
 * rendering so admins can disable a screen without breaking the back stack
 * or leaving the user on a now-empty page.
 */
function useScreenGate(current: Screen): boolean {
  const { go } = useNavigation();
  const analyzer = useFlag('screen.analyzer.enabled', true);
  const actGuide = useFlag('screen.act_guide.enabled', true);
  const resources = useFlag('screen.resources.enabled', true);
  const stats = useFlag('screen.stats.enabled', true);
  const history = useFlag('screen.history.enabled', true);
  const create = useFlag('screen.create.enabled', true);

  const blocked =
    (current === 'analyzer' && !analyzer) ||
    (current === 'actGuide' && !actGuide) ||
    (current === 'resources' && !resources) ||
    (current === 'stats' && !stats) ||
    (current === 'history' && !history) ||
    (current === 'historyDetail' && !history) ||
    (current === 'create' && !create);

  useEffect(() => {
    if (blocked) go('home');
  }, [blocked, go]);

  return !blocked;
}

/**
 * Preview-mode chat runner. When the consumer is rendered inside the admin
 * Scenario Builder iframe (URL has `?pbt_preview=1`), it accepts:
 *
 *   { type: 'pbt:preview-run-scenario',
 *     scenarioId?: string,
 *     draft?: ScenarioOverride,
 *     mode?: 'chat' | 'voice' }
 *
 * On receipt: resolve the scenario from the snapshot (or synthesize from
 * the draft override row), set it via ScenarioProvider, and navigate to the
 * chat screen. The Builder uses this to start a real chat/voice session
 * with the unsaved scenario draft so the admin can test before saving.
 */
function PreviewRunner() {
  const { snapshot } = useFlags();
  const { setScenario } = useScenario();
  const { go } = useNavigation();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('pbt_preview')) return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as
        | {
            type?: string;
            scenarioId?: string;
            draft?: ScenarioOverride;
            mode?: 'chat' | 'voice';
          }
        | null;
      if (!data || data.type !== 'pbt:preview-run-scenario') return;

      let scenario = null as ReturnType<typeof applyScenarioOverride> | null;
      if (data.draft) {
        if (isAdminScenarioId(data.draft.scenario_id)) {
          scenario = adminOverrideToScenario(data.draft);
        } else if (data.draft.scenario_id.startsWith('seed:')) {
          const idx = Number(data.draft.scenario_id.slice('seed:'.length));
          const base = LIBRARY_SCENARIOS[idx];
          if (base) scenario = applyScenarioOverride(base, data.draft, data.draft.scenario_id);
        }
      } else if (data.scenarioId) {
        if (isAdminScenarioId(data.scenarioId)) {
          const row = snapshot?.scenarioOverrides.find(
            (o) => o.scenario_id === data.scenarioId,
          );
          if (row) scenario = adminOverrideToScenario(row);
        } else if (data.scenarioId.startsWith('seed:')) {
          const idx = Number(data.scenarioId.slice('seed:'.length));
          const base = LIBRARY_SCENARIOS[idx];
          const row = snapshot?.scenarioOverrides.find(
            (o) => o.scenario_id === data.scenarioId,
          );
          if (base) scenario = applyScenarioOverride(base, row ?? null, data.scenarioId);
        }
      }
      if (!scenario) return;
      setScenario(scenario);
      go('chat');
    };
    window.addEventListener('message', handler);
    // Tell the admin we're ready to receive scenario-run commands too.
    window.parent?.postMessage(
      { type: 'pbt:preview-runner-ready' },
      window.location.origin,
    );
    return () => window.removeEventListener('message', handler);
  }, [snapshot, setScenario, go]);
  return null;
}

function ScreenSwitch() {
  const { current } = useNavigation();
  const allowed = useScreenGate(current);
  if (!allowed) return null;
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
