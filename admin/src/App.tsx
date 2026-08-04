import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './lib/supabase';
import { apiFetch } from './lib/api';
import { COLOR } from './lib/tokens';
import { Glass } from './primitives/Glass';
import { FloatingNav, type AdminScreen, type Range } from './primitives/Shell';
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
import { visibleNav } from './primitives/Shell';
import type { Whoami } from './data/access';

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
  const [view, setView] = useState<AdminScreen>('overview');
  const [range, setRange] = useState<Range>('28d');
  const [query, setQuery] = useState('');
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
        if (!cancelled) {
          setAuth({ status: 'admin', me });
          // Land on the first screen this role can actually open — an Analyst
          // shouldn't boot into a blank Overview they lack permission for.
          const allowed = visibleNav(me.permissions);
          if (allowed.length && !allowed.some((n) => n.key === 'overview')) {
            setView(allowed[0].key);
          }
        }
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
  const allowed = visibleNav(perms);
  // A role can lose access to the screen it's currently on (someone changed
  // it mid-session). Fall back rather than render a screen that will 403.
  const current = allowed.some((n) => n.key === view) ? view : (allowed[0]?.key ?? 'overview');

  // Halos behind the canvas — same language as the consumer app.
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <BackgroundHalos />
      {/* Clear the shared search query on screen change — otherwise a filter
          typed on one screen silently constrains every other screen too. */}
      <FloatingNav
        active={current}
        onNav={(s) => {
          setQuery('');
          setView(s);
        }}
        permissions={perms}
        identity={{
          name: me.display_name || me.email || 'Admin',
          role: me.role_name || me.role || 'admin',
        }}
        onSignOut={() => void getSupabase().auth.signOut()}
      />
      {/*
        No z-index here on purpose. A stacking context at z-index 1 would trap
        every descendant below it — including the fixed-position modals, whose
        z-index 60 would then still lose to the nav's 30 and leave their headers
        (and close buttons) unreachable. `position: relative` alone is enough to
        paint above the z-index-0 halos, since it comes later in the DOM.
      */}
      <div style={{ position: 'relative' }}>
        {allowed.length === 0 && (
          <FullCenterMessage>
            <Glass padding={24} radius={16}>
              <div style={{ fontWeight: 800, color: COLOR.ink, fontSize: 18 }}>No screens available</div>
              <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 6, maxWidth: 380 }}>
                Your role doesn’t grant access to any part of the portal yet. Ask
                an owner to widen it.
              </div>
            </Glass>
          </FullCenterMessage>
        )}
        {current === 'overview' && <OverviewScreen range={range} onRange={setRange} onNav={setView} />}
        {current === 'insights' && <InsightsScreen range={range} onRange={setRange} />}
        {current === 'analytics' && <AnalyticsScreen range={range} onRange={setRange} />}
        {current === 'users' && <UsersScreen query={query} onQuery={setQuery} meUserId={me.user_id} />}
        {current === 'team' && (
          <TeamScreen query={query} onQuery={setQuery} meUserId={me.user_id} myPermissions={perms} />
        )}
        {current === 'sessions' && <SessionsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {current === 'scenarios' && <ScenariosScreen query={query} onQuery={setQuery} />}
        {current === 'analyzer' && <AnalyzerScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {current === 'quality' && <QualityScreen range={range} onRange={setRange} />}
        {current === 'feedback' && <FeedbackScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {current === 'reports' && <ReportsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {current === 'email' && <EmailScreen myPermissions={perms} />}
        {current === 'flags' && <FlagsScreen query={query} onQuery={setQuery} />}
        {current === 'overrides' && <ScenarioBuilderScreen query={query} onQuery={setQuery} />}
        {current === 'simulation' && <SimulationScreen />}
        {current === 'knowledge' && <KnowledgeScreen query={query} onQuery={setQuery} />}
        {current === 'preview' && <PreviewScreen />}
        {current === 'audit' && <AuditLogScreen />}
      </div>
    </div>
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
