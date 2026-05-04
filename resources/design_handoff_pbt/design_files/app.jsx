// PBT — Main app router
function PBTApp({ initialRoute = 'onboarding', tweaks, embedded = false }) {
  const [route, setRoute] = useState(initialRoute);
  const [tab, setTab] = useState('home');
  // Default profile uses real driver names — used for demo so home still feels personal
  const [profile, setProfile] = useState({
    primary: 'Activator', secondary: 'Energizer',
    tally: { Activator: 6, Energizer: 4, Analyzer: 3, Harmonizer: 2 },
  });
  // Once the quiz finishes (or user lands past it via Tweaks), tint the canvas
  const [profileLocked, setProfileLocked] = useState(initialRoute !== 'onboarding' && initialRoute !== 'quiz');
  const [scenario, setScenario] = useState(null);
  const [pet, setPet] = useState(null);

  const t = tweaks || { theme: 'light', dir: 'tl', blur: 24, intensity: 1, scale: 1, hue: 22 };

  // Resolve driver colors from the profile so the canvas can glow primary/secondary
  const driverColors = (typeof DRIVER_WAVE_COLORS !== 'undefined') ? DRIVER_WAVE_COLORS : {};
  const primaryColor   = profileLocked ? (driverColors[profile?.primary]   || null) : null;
  const secondaryColor = profileLocked ? (driverColors[profile?.secondary] || null) : null;

  const showTabs = ['home', 'history', 'resources', 'settings'].includes(route);

  const goTab = (id) => { setTab(id); setRoute(id === 'home' ? 'home' : id); };

  let body;
  switch (route) {
    case 'onboarding':
      body = <OnboardingScreen onContinue={() => setRoute('quiz')} theme={t.theme}/>;
      break;
    case 'quiz':
      body = <QuizScreen onComplete={(r) => { setProfile(r); setProfileLocked(true); setRoute('result'); }} onBack={() => setRoute('onboarding')} theme={t.theme}/>;
      break;
    case 'result':
      body = <ResultScreen result={profile} onContinue={() => { setTab('home'); setRoute('home'); }} theme={t.theme}/>;
      break;
    case 'home':
      body = <HomeScreen profile={profile}
        onStart={() => setRoute('chat')}
        onCreate={() => setRoute('create')}
        onOpenSession={() => setRoute('stats')}
        onAnalyzer={() => setRoute('analyzer')}
        onResources={() => setRoute('resources')}
        onTab={goTab} theme={t.theme}/>;
      break;
    case 'create':
      body = <CreateScreen onBack={() => { setTab('home'); setRoute('home'); }} onLaunch={(s) => { setScenario(s); setRoute('chat'); }} theme={t.theme}/>;
      break;
    case 'chat':
      body = <ChatScreen scenario={scenario} onEnd={() => setRoute('stats')} onBack={() => { setTab('home'); setRoute('home'); }} theme={t.theme}/>;
      break;
    case 'stats':
      body = <StatsScreen onBack={() => { setTab('home'); setRoute('home'); }} onRetry={() => setRoute('chat')} onHome={() => { setTab('home'); setRoute('home'); }} theme={t.theme}/>;
      break;
    case 'history':
      body = <HistoryScreen onOpen={() => setRoute('stats')} theme={t.theme}/>;
      break;
    case 'analyzer':
      body = <PetAnalyzerScreen onBack={() => { setTab('home'); setRoute('home'); }} theme={t.theme}/>;
      break;
    case 'resources':
      body = <ResourcesScreen onBack={() => { setTab('home'); setRoute('home'); }} theme={t.theme}/>;
      break;
    case 'settings':
      body = <SettingsScreen profile={profile} onRetake={() => setRoute('quiz')} theme={t.theme}/>;
      break;
    default:
      body = null;
  }

  return (
    <AppFrame theme={t.theme} dir={t.dir} intensity={t.intensity} scale={t.scale} embedded={embedded}
      primaryColor={primaryColor} secondaryColor={secondaryColor}>
      {body}
      {showTabs && <TabBar active={tab} onChange={goTab} theme={t.theme}/>}
    </AppFrame>
  );
}

Object.assign(window, { PBTApp });
