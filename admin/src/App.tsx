import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './lib/supabase';
import { COLOR } from './lib/tokens';
import { Glass } from './primitives/Glass';
import { FloatingNav, type AdminScreen, type Range } from './primitives/Shell';
import { OverviewScreen } from './screens/OverviewScreen';
import { UsersScreen } from './screens/UsersScreen';
import { SessionsScreen } from './screens/SessionsScreen';
import { ScenariosScreen } from './screens/ScenariosScreen';
import { AnalyzerScreen } from './screens/AnalyzerScreen';
import { QualityScreen } from './screens/QualityScreen';
import { SignInGate } from './screens/SignInGate';

type AdminState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'not_admin' }
  | { status: 'admin'; userId: string };

export function App() {
  const [auth, setAuth] = useState<AdminState>({ status: 'loading' });
  const [view, setView] = useState<AdminScreen>('overview');
  const [range, setRange] = useState<Range>('28d');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    async function check(session: Session | null) {
      if (cancelled) return;
      if (!session) {
        setAuth({ status: 'signed_out' });
        return;
      }
      const { data, error } = await sb
        .from('profiles')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.is_admin) {
        setAuth({ status: 'not_admin' });
      } else {
        setAuth({ status: 'admin', userId: session.user.id });
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
  }, []);

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
            Your account is signed in but doesn't have admin access. Ask an
            existing admin to set <code>is_admin = true</code> on your profile.
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

  // Halos behind the canvas — same language as the consumer app.
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <BackgroundHalos />
      <FloatingNav active={view} onNav={setView} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {view === 'overview' && <OverviewScreen range={range} onRange={setRange} onNav={setView} />}
        {view === 'users' && <UsersScreen query={query} onQuery={setQuery} />}
        {view === 'sessions' && <SessionsScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {view === 'scenarios' && <ScenariosScreen query={query} onQuery={setQuery} />}
        {view === 'analyzer' && <AnalyzerScreen range={range} onRange={setRange} query={query} onQuery={setQuery} />}
        {view === 'quality' && <QualityScreen range={range} onRange={setRange} />}
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
