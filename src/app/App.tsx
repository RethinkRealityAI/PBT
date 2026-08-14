import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { ThemeProvider } from './providers/ThemeProvider';
import { LanguageProvider, useLanguage } from './providers/LanguageProvider';
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

/*
 * Screen loading strategy (spec §13.9 — main JS chunk < 500 kB gzip).
 *
 * EAGER: the screens reachable on first paint or that are trivially small.
 * `onboarding` / `terms` are the cold-start entry for a new user, `home` is
 * the cold-start entry for a returning one, and `settings` is small enough
 * that a separate request costs more than it saves.
 *
 * LAZY: everything else. Each becomes its own async chunk fetched the first
 * time the state machine routes to it, behind the single <ScreenFallback />
 * Suspense boundary in ScreenSwitch. Screens are NAMED exports, so every
 * import() is remapped to a default export for React.lazy.
 *
 * Note: ChatProvider mounts useTextChat at the app root, so geminiService
 * stays in the main chunk by design — lazy-loading ChatScreen does not (and
 * is not meant to) defer the AI SDK.
 */
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { TermsScreen } from '../screens/TermsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const QuizScreen = lazy(() =>
  import('../screens/QuizScreen').then((m) => ({ default: m.QuizScreen })),
);
const ResultScreen = lazy(() =>
  import('../screens/ResultScreen').then((m) => ({ default: m.ResultScreen })),
);
const CreateScreen = lazy(() =>
  import('../screens/CreateScreen').then((m) => ({ default: m.CreateScreen })),
);
const ChatScreen = lazy(() =>
  import('../screens/ChatScreen').then((m) => ({ default: m.ChatScreen })),
);
const StatsScreen = lazy(() =>
  import('../screens/StatsScreen').then((m) => ({ default: m.StatsScreen })),
);
const HistoryScreen = lazy(() =>
  import('../screens/HistoryScreen').then((m) => ({ default: m.HistoryScreen })),
);
const HistoryDetailScreen = lazy(() =>
  import('../screens/HistoryDetailScreen').then((m) => ({
    default: m.HistoryDetailScreen,
  })),
);
const PetAnalyzerScreen = lazy(() =>
  import('../screens/PetAnalyzerScreen').then((m) => ({
    default: m.PetAnalyzerScreen,
  })),
);
const ResourcesScreen = lazy(() =>
  import('../screens/ResourcesScreen').then((m) => ({
    default: m.ResourcesScreen,
  })),
);
const ActGuideScreen = lazy(() =>
  import('../screens/ActGuideScreen').then((m) => ({
    default: m.ActGuideScreen,
  })),
);
const ResetPasswordScreen = lazy(() =>
  import('../screens/ResetPasswordScreen').then((m) => ({
    default: m.ResetPasswordScreen,
  })),
);

import { readStorage, STORAGE_KEYS, getOrCreateSessionId } from '../lib/storage';

function getInitialScreen(): Screen {
  const terms = readStorage(STORAGE_KEYS.termsAcceptedAt);
  if (!terms) return 'onboarding';
  return 'home';
}

/**
 * `/reset-password` is a real URL people arrive at from a recovery email,
 * before they can sign in. It sits outside the screen state machine — sending
 * them through onboarding or the quiz first would be nonsense — but still
 * inside Theme + Language so it looks and reads like the rest of the app.
 */
const isPasswordResetRoute = () =>
  window.location.pathname.replace(/\/+$/, '') === '/reset-password';

export function App() {
  useEffect(() => {
    mountKeyframes();
    getOrCreateSessionId();
    startAnalytics();
  }, []);

  if (isPasswordResetRoute()) {
    return (
      <ThemeProvider>
        <LanguageProvider>
          <Suspense fallback={null}>
            <ResetPasswordScreen />
          </Suspense>
        </LanguageProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
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
      </LanguageProvider>
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

/**
 * Suspense fallback for lazily-loaded screens.
 *
 * Occupies exactly the same box a real screen would (`flex-1 min-h-0` inside
 * AppFrame's content column) so swapping fallback → screen never shifts the
 * shell chrome. Deliberately minimal: a neutral driver-tinted ring, no glass,
 * no copy — chunks resolve in a few frames on a warm connection and a heavier
 * placeholder would flash.
 */
function ScreenFallback() {
  const { t } = useLanguage();
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{t('chrome.loading')}</span>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border:
            '2px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, transparent)',
          borderTopColor: 'var(--pbt-driver-primary)',
          animation: 'pbtSpin 0.8s linear infinite',
        }}
      />
    </div>
  );
}

function ScreenSwitch() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <CurrentScreen />
    </Suspense>
  );
}

function CurrentScreen() {
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
