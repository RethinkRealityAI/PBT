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
import { LIBRARY_SCENARIOS, type Scenario } from '../data/scenarios';
import type { ScenarioOverride } from '../services/flagsClient';
import { isPreviewMode, startPreviewRun } from '../lib/previewMode';
import type { Screen } from './routes';
import { SCREENS_WITH_TAB_BAR } from './routes';

import { mountKeyframes } from '../design-system/keyframes';
import { AppFrame } from '../shell/AppFrame';
import { ErrorBoundary } from './ErrorBoundary';
import { TabBar } from '../shell/TabBar';
import { useCloudSync } from '../features/auth/useCloudSync';
import { logEvent, markScreenEntered, startAnalytics } from '../lib/analytics';

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
  // Admin preview iframe: the builder drives this document by postMessage and
  // there is no human behind it to accept terms or take the ECHO quiz. Boot
  // straight into the shell — RouteResolver skips its quiz redirect for the
  // same reason.
  if (isPreviewMode()) return 'home';
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

/**
 * Emits a `screen_view` nav_event each time the current screen changes, and
 * hands the screen to the dwell timer so the screen just left is logged with
 * the time spent on it.
 */
function ScreenViewLogger() {
  const { current } = useNavigation();
  useEffect(() => {
    logEvent({ type: 'screen_view', screen: current });
    markScreenEntered(current);
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
    // Admin preview: no profile is expected, and bouncing the iframe to the
    // quiz would make "Test in app" untestable. ChatScreen already falls back
    // to a default driver when `profile` is null.
    if (isPreviewMode()) return;
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

/** Seed ids are `seed:<index>` into LIBRARY_SCENARIOS. */
function seedBaseFor(scenarioId: string): Scenario | null {
  if (!scenarioId.startsWith('seed:')) return null;
  const idx = Number(scenarioId.slice('seed:'.length));
  if (!Number.isInteger(idx) || idx < 0) return null;
  return LIBRARY_SCENARIOS[idx] ?? null;
}

/**
 * Preview-mode chat runner. When the consumer is rendered inside the admin
 * Scenario Builder iframe (URL has `?pbt_preview=1`), it accepts:
 *
 *   { type: 'pbt:preview-run-scenario',
 *     scenarioId?: string,
 *     draft?: ScenarioOverride,
 *     mode?: 'text' | 'voice' }
 *
 * On receipt: resolve the scenario (from the posted draft, else from the flag
 * snapshot), set it via ScenarioProvider, publish the requested mode as a
 * preview run so ChatScreen opens in text or voice, and navigate to chat.
 *
 * ── Status contract ──────────────────────────────────────────────
 * Every message is answered exactly once with
 *   { type: 'pbt:preview-status', ok: boolean, reason?: string }
 * posted to `window.parent`. The admin builder renders it, so the reason
 * strings are part of the interface and must stay verbatim:
 *   • `invalid`     — a draft was posted but can't make a Scenario (missing
 *                     breed / life stage / driver / pushback id).
 *   • `unsupported` — nothing to run: no draft and no resolvable id (an
 *                     unknown prefix, an out-of-range seed index, or a
 *                     `user:` id the consumer has no copy of).
 * A silent no-op was the old behaviour and left the builder spinning forever.
 */
function PreviewRunner() {
  const { snapshot } = useFlags();
  const { setScenario } = useScenario();
  // `replace`, not `go`: the iframe is driven entirely from the builder and
  // has no back-navigation story, so repeated runs must not pile duplicate
  // 'chat' entries onto the depth-8 back stack.
  const { replace } = useNavigation();
  useEffect(() => {
    if (!isPreviewMode()) return;

    const postStatus = (ok: boolean, reason?: string) => {
      // '*' rather than the exact origin: the builder may be embedded from a
      // sibling deploy/preview host, and the payload carries no secrets.
      window.parent?.postMessage(
        reason ? { type: 'pbt:preview-status', ok, reason } : { type: 'pbt:preview-status', ok },
        '*',
      );
    };

    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as
        | {
            type?: string;
            scenarioId?: string;
            draft?: ScenarioOverride;
            mode?: 'text' | 'chat' | 'voice';
          }
        | null;
      if (!data || data.type !== 'pbt:preview-run-scenario') return;

      let scenario: Scenario | null = null;
      let reason: 'invalid' | 'unsupported' = 'unsupported';

      if (data.draft) {
        // The builder posts the fully-hydrated editor draft whatever the id
        // prefix is, so `user:` scenarios preview exactly like `admin:` ones:
        // the row IS the scenario. (Previously only admin:/seed: drafts were
        // handled and a user scenario silently did nothing.)
        const draft = data.draft;
        scenario = adminOverrideToScenario(draft);
        if (!scenario) {
          // A seed draft may legitimately omit columns it inherits from the
          // shipped scenario — overlay it on the seed rather than rejecting.
          const base = seedBaseFor(draft.scenario_id);
          if (base) scenario = applyScenarioOverride(base, draft, draft.scenario_id);
        }
        if (!scenario) reason = 'invalid';
      } else if (data.scenarioId) {
        const id = data.scenarioId;
        const row =
          snapshot?.scenarioOverrides.find((o) => o.scenario_id === id) ?? null;
        if (isAdminScenarioId(id)) {
          scenario = row ? adminOverrideToScenario(row) : null;
          // A saved admin row that won't build is malformed, not unsupported.
          if (!scenario && row) reason = 'invalid';
        } else {
          const base = seedBaseFor(id);
          if (base) scenario = applyScenarioOverride(base, row, id);
          // `user:<uuid>` without a draft: the consumer bundle has no copy of
          // another account's scenario, so only the builder can supply it.
        }
      }

      if (!scenario) {
        postStatus(false, reason);
        return;
      }

      setScenario(scenario);
      // Publish the run BEFORE navigating: ChatScreen reads the requested mode
      // for its initial state, and a fresh runId is the signal that an
      // already-open chat must reset onto this new draft.
      startPreviewRun(data.mode === 'voice' || data.mode == null ? 'voice' : 'text');
      replace('chat');
      postStatus(true);
    };

    window.addEventListener('message', handler);
    // Tell the admin we're ready to receive scenario-run commands too.
    window.parent?.postMessage(
      { type: 'pbt:preview-runner-ready' },
      window.location.origin,
    );
    return () => window.removeEventListener('message', handler);
  }, [snapshot, setScenario, replace]);
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
      <ErrorBoundary>
        <CurrentScreen />
      </ErrorBoundary>
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
