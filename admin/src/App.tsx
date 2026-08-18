import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './lib/supabase';
import { apiFetch } from './lib/api';
import { COLOR } from './lib/tokens';
import { Glass } from './primitives/Glass';
import { SectionTabsProvider, type AdminScreen, type Range } from './primitives/Shell';
import { Sidebar, SidebarTrigger, useSidebarState } from './primitives/Sidebar';
import { AccessProvider } from './primitives/access';
import { ConfirmProvider } from './primitives/Confirm';
import { ToastProvider } from './primitives/Toast';
import { defaultTab, findNavItem, visibleItems, visibleTabs } from './primitives/nav';
import { useHashRoute } from './lib/route';
import { OverviewScreen } from './screens/OverviewScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { UsersScreen } from './screens/UsersScreen';
import { SessionsScreen } from './screens/SessionsScreen';
import { ScenariosScreen } from './screens/ScenariosScreen';
import { AnalyzerScreen } from './screens/AnalyzerScreen';
import { QualityScreen } from './screens/QualityScreen';
import { FeedbackScreen } from './screens/FeedbackScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { FlagsScreen } from './screens/FlagsScreen';
import { ScenarioBuilderScreen } from './screens/ScenarioBuilderScreen';
import { AuditLogScreen } from './screens/AuditLogScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { SimulationScreen } from './screens/SimulationScreen';
import { KnowledgeScreen } from './screens/KnowledgeScreen';
import { TeamScreen } from './screens/TeamScreen';
import { EmailScreen } from './screens/EmailScreen';
import { InviteAcceptPage, ResetPasswordPage } from './screens/AuthPages';
import { SignInGate } from './screens/SignInGate';
import type { Whoami } from './data/access';
import type { TeamTab } from './screens/TeamScreen';
import type { EmailTab } from './screens/EmailScreen';

type AdminState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'not_admin' }
  | { status: 'error'; message: string }
  | { status: 'admin'; me: Whoami };

/**
 * Two paths under /admin render before the auth gate: accepting an invitation
 * and completing a password reset. Both are reached by people who, by
 * definition, can't sign in yet.
 */
function publicRoute(): 'invite' | 'reset' | null {
  const path = location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/invite')) return 'invite';
  if (path.endsWith('/reset')) return 'reset';
  return null;
}

export function App() {
  const [auth, setAuth] = useState<AdminState>({ status: 'loading' });
  const [range, setRange] = useState<Range>('28d');
  const [query, setQuery] = useState('');
  const [hashRoute, navigate] = useHashRoute();
  const sidebar = useSidebarState();
  const route = publicRoute();

  useEffect(() => {
    if (route) return;
    let cancelled = false;
    const sb = getSupabase();
    async function check(session: Session | null) {
      if (cancelled) return;
      if (!session) {
        setAuth({ status: 'signed_out' });
        return;
      }
      // Server-side gate: admin-whoami returns 200 only for admins, and tells
      // us which permissions this account actually holds. We distinguish
      // between "not admin" (403 → show the not-authorised card) and any other
      // error (env misconfig, network, 500 → surface the actual message so
      // deployment issues are debuggable).
      try {
        const me = await apiFetch<Whoami>('admin-whoami');
        if (!cancelled) setAuth({ status: 'admin', me });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Auth check failed';
        if (msg === 'Not an admin') {
          setAuth({ status: 'not_admin' });
        } else {
          setAuth({ status: 'error', message: msg });
        }
      }
    }
    sb.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      void check(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [route]);

  if (route === 'invite') return <InviteAcceptPage />;
  if (route === 'reset') return <ResetPasswordPage />;

  if (auth.status === 'loading') {
    return <FullCenterMessage>Loading…</FullCenterMessage>;
  }
  if (auth.status === 'signed_out') {
    return <SignInGate />;
  }
  if (auth.status === 'not_admin') {
    return (
      <FullCenterMessage>
        <Glass padding={24} radius={16}>
          <div style={{ fontWeight: 800, color: COLOR.ink, fontSize: 18 }}>
            Not authorised
          </div>
          <div
            style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 6, maxWidth: 360 }}
          >
            Your account is signed in but doesn't hold an admin role. Ask an
            owner to invite you from Team &amp; roles — you'll get an email with
            a link that grants access.
          </div>
          <button
            onClick={() => void getSupabase().auth.signOut()}
            style={signOutBtn}
          >
            Sign out
          </button>
        </Glass>
      </FullCenterMessage>
    );
  }
  if (auth.status === 'error') {
    return (
      <FullCenterMessage>
        <Glass padding={24} radius={16}>
          <div style={{ fontWeight: 800, color: COLOR.ink, fontSize: 18 }}>
            Admin endpoint error
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLOR.inkMute,
              marginTop: 6,
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            The admin gate (<code>/.netlify/functions/admin-whoami</code>)
            returned an error. This usually means the Netlify deploy is
            missing an environment variable. Server said:
          </div>
          <pre
            style={{
              marginTop: 10,
              fontFamily: 'var(--pbt-mono)',
              fontSize: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(60,20,15,0.06)',
              color: COLOR.ink,
              maxWidth: 480,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {auth.message}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => location.reload()} style={signOutBtn}>
              Retry
            </button>
            <button
              onClick={() => void getSupabase().auth.signOut()}
              style={{ ...signOutBtn, background: 'rgba(60,20,15,0.08)', color: COLOR.ink }}
            >
              Sign out
            </button>
          </div>
        </Glass>
      </FullCenterMessage>
    );
  }

  const { me } = auth;
  const perms = me.permissions;
  const allowed = visibleItems(perms);

  if (allowed.length === 0) {
    return (
      <FullCenterMessage>
        <Glass padding={24} radius={16}>
          <div style={{ fontWeight: 800, color: COLOR.ink, fontSize: 18 }}>No screens available</div>
          <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 6, maxWidth: 380 }}>
            Your role doesn’t grant access to any part of the portal yet. Ask an
            owner to widen it.
          </div>
        </Glass>
      </FullCenterMessage>
    );
  }

  /*
   * Resolve the URL against what this role may actually open. Three things can
   * go wrong and all three land on the same fallback rather than a 403 screen:
   * no hash at all (first visit), a hash naming a destination that no longer
   * exists (old bookmark), and a hash naming one this role lost access to
   * (their permissions changed while they had the tab open).
   */
  const item =
    (hashRoute && allowed.find((i) => i.key === hashRoute.screen)) ?? allowed[0];
  const tabs = visibleTabs(item, perms);
  const tab =
    tabs.find((t) => t.key === hashRoute?.tab)?.key ?? defaultTab(item, perms) ?? '';

  const go = (screen: AdminScreen, nextTab?: string) => {
    // Clear the shared search on destination change — a filter typed on one
    // screen silently constraining every other one is a bug people report as
    // "the list is empty".
    if (screen !== item.key) setQuery('');
    const target = findNavItem(screen);
    navigate({
      screen,
      tab: nextTab ?? (target ? defaultTab(target, perms) : null),
    });
    sidebar.setDrawerOpen(false);
  };

  const contentOffset = sidebar.compact ? 0 : sidebar.width;

  /*
   * Three cross-cutting providers wrap the authed app:
   *
   *   AccessProvider  — this admin's effective permissions, so screens ask
   *                     `useCan('scenarios.write')` instead of receiving
   *                     `myPermissions` through four layers of props.
   *   ToastProvider   — transient feedback; its live regions must mount here,
   *                     with the shell, so they exist before the first message.
   *   ConfirmProvider — the destructive-action dialog, hosted once rather than
   *                     re-implemented per screen.
   *
   * Halos behind the canvas — same language as the consumer app.
   */
  return (
    <AccessProvider permissions={perms} isOwner={me.is_owner}>
    <ToastProvider>
    <ConfirmProvider>
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <BackgroundHalos />
      <Sidebar
        active={item.key}
        onNav={(s) => go(s)}
        permissions={perms}
        identity={{
          name: me.display_name || me.email || 'Admin',
          email: me.email,
          role: me.role_name || me.role || 'admin',
        }}
        onSignOut={() => void getSupabase().auth.signOut()}
        collapsed={sidebar.collapsed}
        onToggleCollapsed={() => sidebar.setCollapsed(!sidebar.collapsed)}
        compact={sidebar.compact}
        drawerOpen={sidebar.drawerOpen}
        onCloseDrawer={() => sidebar.setDrawerOpen(false)}
      />
      {/*
        No z-index here on purpose. A stacking context at z-index 1 would trap
        every descendant below it — including the fixed-position modals, whose
        z-index 60 would then still lose to the sidebar's 45 and leave their
        headers (and close buttons) unreachable. `position: relative` alone is
        enough to paint above the z-index-0 halos, since it comes later in the
        DOM.
      */}
      <div
        style={{
          position: 'relative',
          marginLeft: contentOffset,
          transition: 'margin-left 0.18s ease',
        }}
      >
        <SectionTabsProvider
          value={{
            tabs: tabs.map((t) => ({ key: t.key, label: t.label })),
            active: tab,
            onChange: (next) => go(item.key, next),
          }}
        >
          {sidebar.compact && (
            <div style={{ padding: '16px 20px 0', maxWidth: 1440, margin: '0 auto' }}>
              <SidebarTrigger onOpen={() => sidebar.setDrawerOpen(true)} />
            </div>
          )}

          {item.key === 'overview' && (
            <OverviewScreen range={range} onRange={setRange} onNav={go} />
          )}

          {item.key === 'analytics' && tab === 'insights' && (
            <InsightsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />
          )}
          {item.key === 'analytics' && tab === 'traffic' && (
            <AnalyticsScreen range={range} onRange={setRange} />
          )}
          {item.key === 'analytics' && tab === 'quality' && (
            <QualityScreen range={range} onRange={setRange} />
          )}

          {item.key === 'activity' && tab === 'sessions' && (
            <SessionsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />
          )}
          {item.key === 'activity' && tab === 'analyzer' && (
            <AnalyzerScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />
          )}

          {item.key === 'people' && tab === 'users' && (
            <UsersScreen query={query} onQuery={setQuery} meUserId={me.user_id} />
          )}
          {item.key === 'people' && tab !== 'users' && (
            <TeamScreen
              query={query}
              onQuery={setQuery}
              meUserId={me.user_id}
              myPermissions={perms}
              tab={tab as TeamTab}
              onTab={(t) => go('people', t)}
            />
          )}

          {item.key === 'library' && tab === 'scenarios' && (
            <ScenariosScreen query={query} onQuery={setQuery} />
          )}
          {item.key === 'library' && tab === 'builder' && (
            <ScenarioBuilderScreen query={query} onQuery={setQuery} />
          )}
          {item.key === 'library' && tab === 'knowledge' && (
            <KnowledgeScreen query={query} onQuery={setQuery} />
          )}
          {item.key === 'library' && tab === 'simulation' && <SimulationScreen />}

          {item.key === 'feedback' && tab === 'sessions' && (
            <FeedbackScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />
          )}
          {item.key === 'feedback' && tab === 'reports' && (
            <ReportsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />
          )}

          {item.key === 'email' && (
            <EmailScreen
              myPermissions={perms}
              tab={tab as EmailTab}
              onTab={(t) => go('email', t)}
            />
          )}
          {item.key === 'flags' && <FlagsScreen query={query} onQuery={setQuery} />}
          {item.key === 'audit' && <AuditLogScreen />}
          {item.key === 'preview' && <PreviewScreen />}
        </SectionTabsProvider>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
    </AccessProvider>
  );
}

function BackgroundHalos() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '60vw',
          height: '50vh',
          top: '-10vh',
          right: '-10vw',
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, oklch(0.92 0.06 22 / 0.55), transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '50vw',
          height: '40vh',
          bottom: '-10vh',
          left: '-10vw',
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, oklch(0.94 0.04 245 / 0.4), transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
    </div>
  );
}

function FullCenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

const signOutBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  background: COLOR.brand,
  color: '#fff',
  fontWeight: 700,
  fontFamily: 'var(--pbt-font)',
};
