// Shared design system for PBT
// Glass morphism on warm-white red bloom canvas

const PBT = {
  // Tokens are read off CSS vars so Tweaks can rewire them live
  // Fallbacks here for when JS reads before paint
  colors: {
    cherry:  'oklch(0.62 0.22 22)',
    crimson: 'oklch(0.55 0.24 18)',
    coral:   'oklch(0.74 0.18 28)',
    blush:   'oklch(0.94 0.05 20)',
    cream:   'oklch(0.985 0.012 60)',
    ink:     'oklch(0.22 0.04 20)',
    mute:    'oklch(0.50 0.04 20)',
  },
};

// ── Background — clean canvas with a soft driver halo ───────────
// Light theme: plain white with one quiet driver-color halo, so glass
// surfaces have something to refract without the page itself looking
// red. Dark theme: keeps the warm bloom, untouched.
function GradientBg({ children, dir = 'tl', intensity = 1, theme = 'light', primaryColor = null, secondaryColor = null }) {
  const positions = {
    tl: ['10% 8%', '88% 18%', '60% 92%'],
    tr: ['85% 12%', '15% 25%', '50% 92%'],
    bl: ['12% 88%', '85% 22%', '55% 8%'],
    br: ['85% 88%', '15% 22%', '50% 8%'],
    center: ['50% 30%', '15% 80%', '85% 80%'],
  }[dir] || ['10% 8%', '88% 18%', '60% 92%'];
  const dark = theme === 'dark';
  const base = dark ? '#0e0306' : '#ffffff';

  const primary = primaryColor || (dark ? 'oklch(0.55 0.24 18)' : 'oklch(0.68 0.22 22)');
  const secondary = secondaryColor || primaryColor || (dark ? 'oklch(0.55 0.20 22)' : 'oklch(0.78 0.18 30)');
  const accent = dark ? 'oklch(0.45 0.18 12)' : 'oklch(0.92 0.06 20)';

  // Light theme: a single soft halo, opacity ~10–14%, so the canvas reads
  // as "white" but glass elements still pick up color when they refract.
  // Dark theme: original three-orb bloom retained.
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: base,
    }}>
      {dark ? (
        <>
          <div style={{
            position: 'absolute', width: '120%', height: '90%',
            left: `calc(${positions[0].split(' ')[0]} - 60%)`,
            top:  `calc(${positions[0].split(' ')[1]} - 45%)`,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${primary} ${Math.round(85 * intensity)}%, transparent), transparent 70%)`,
            filter: 'blur(24px)', transition: 'background 0.6s ease',
          }} />
          <div style={{
            position: 'absolute', width: '90%', height: '70%',
            left: `calc(${positions[1].split(' ')[0]} - 45%)`,
            top:  `calc(${positions[1].split(' ')[1]} - 35%)`,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${secondary} ${Math.round(38 * intensity)}%, transparent), transparent 70%)`,
            filter: 'blur(28px)', transition: 'background 0.6s ease',
          }} />
          <div style={{
            position: 'absolute', width: '100%', height: '70%',
            left: `calc(${positions[2].split(' ')[0]} - 50%)`,
            top:  `calc(${positions[2].split(' ')[1]} - 35%)`,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${accent} ${Math.round(60 * intensity)}%, transparent), transparent 70%)`,
            filter: 'blur(20px)',
          }} />
        </>
      ) : (
        <>
          {/* one quiet driver-color halo — placed in the upper third so glass
              cards mid-screen pick up gentle refraction */}
          <div style={{
            position: 'absolute', width: '110%', height: '80%',
            left: `calc(${positions[0].split(' ')[0]} - 55%)`,
            top:  `calc(${positions[0].split(' ')[1]} - 40%)`,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${primary} ${Math.round(14 * intensity)}%, transparent), transparent 75%)`,
            filter: 'blur(40px)', transition: 'background 0.6s ease',
          }} />
          <div style={{
            position: 'absolute', width: '90%', height: '70%',
            left: `calc(${positions[2].split(' ')[0]} - 45%)`,
            top:  `calc(${positions[2].split(' ')[1]} - 35%)`,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklab, ${secondary} ${Math.round(8 * intensity)}%, transparent), transparent 75%)`,
            filter: 'blur(50px)', transition: 'background 0.6s ease',
          }} />
        </>
      )}
      {/* fine grain noise — only in dark mode, where the bloom needs texture */}
      {dark && (
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.18,
          mixBlendMode: 'overlay', pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// ── Glass card ────────────────────────────────────────────────
// Liquid-glass: low tint + heavy backdrop blur + bright inner highlight,
// so what's behind shows through. Drop shadow is neutral and subtle —
// no red glow on every card. Pass `glow` to opt a single hero card into
// a colored shadow.
function Glass({
  children, blur = 36, radius = 28, tint = null,
  border = true, padding = 20, style = {}, theme = 'light',
  shine = true, onClick, className = '', glow = null,
}) {
  const dark = theme === 'dark';
  // Default tint: low enough to read translucent. Tint prop still wins
  // when callers want an opaque-ish surface (e.g. tabbar).
  const t = tint ?? (dark ? 0.22 : 0.18);
  // Neutral subtle shadow by default; colored only when `glow` is set.
  const shadow = (() => {
    if (glow) {
      return dark
        ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 30px -12px color-mix(in oklab, ${glow} 55%, black), 0 2px 6px -2px rgba(0,0,0,0.25)`
        : `0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(255,255,255,0.5) inset, 0 14px 36px -14px color-mix(in oklab, ${glow} 35%, transparent), 0 1px 3px -1px rgba(60,20,15,0.10)`;
    }
    return dark
      ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -10px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.25)`
      : `0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px -10px rgba(60,20,15,0.18), 0 1px 2px rgba(60,20,15,0.06)`;
  })();
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        position: 'relative',
        borderRadius: radius,
        padding,
        backdropFilter: `blur(${blur}px) saturate(200%)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(200%)`,
        background: dark
          ? `rgba(28,12,14,${t})`
          : `rgba(255,255,255,${t})`,
        boxShadow: shadow,
        border: border
          ? (dark ? '0.5px solid rgba(255,255,255,0.14)' : '0.5px solid rgba(255,255,255,0.7)')
          : 'none',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {shine && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: radius,
          background: dark
            ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05) 100%)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.20) 100%)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

// ── Pill button (filled, red) ─────────────────────────────────
function PillButton({ children, onClick, variant = 'solid', icon, style = {}, theme = 'light' }) {
  const dark = theme === 'dark';
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    height: 48, padding: '0 22px', borderRadius: 9999,
    fontSize: 15, fontWeight: 600, fontFamily: 'var(--pbt-font)',
    cursor: 'pointer', border: 'none', letterSpacing: '-0.01em',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  };
  const variants = {
    solid: {
      color: '#fff',
      background: 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))',
      boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 -1px 0 rgba(0,0,0,0.15) inset, 0 6px 16px -4px oklch(0.55 0.22 18 / 0.5), 0 2px 4px oklch(0.55 0.22 18 / 0.3)',
    },
    glass: {
      color: dark ? '#fff' : 'oklch(0.30 0.10 20)',
      background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      boxShadow: dark
        ? '0 1px 0 rgba(255,255,255,0.1) inset, 0 6px 14px -4px rgba(0,0,0,0.4)'
        : '0 1px 0 rgba(255,255,255,0.9) inset, 0 6px 14px -4px oklch(0.55 0.22 18 / 0.18)',
      border: dark ? '0.5px solid rgba(255,255,255,0.18)' : '0.5px solid rgba(255,255,255,0.9)',
    },
    ghost: {
      color: dark ? '#fff' : 'oklch(0.30 0.10 20)',
      background: 'transparent',
      border: dark ? '1px solid rgba(255,255,255,0.2)' : '1px solid oklch(0.55 0.22 18 / 0.25)',
    },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {icon}
      {children}
    </button>
  );
}

// ── Glass orb (the "AI" object) ────────────────────────────────
function Orb({ size = 120, pulse = true, intensity = 1 }) {
  return (
    <div style={{
      position: 'relative', width: size, height: size,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* outer glow */}
      <div style={{
        position: 'absolute', inset: -size * 0.3,
        borderRadius: '50%',
        background: `radial-gradient(closest-side, oklch(0.65 0.24 22 / ${0.5 * intensity}), transparent 70%)`,
        filter: 'blur(8px)',
        animation: pulse ? 'pbtPulse 3.2s ease-in-out infinite' : 'none',
      }} />
      {/* core sphere */}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `radial-gradient(circle at 30% 28%, #fff 0%, oklch(0.92 0.08 22) 18%, oklch(0.70 0.20 22) 55%, oklch(0.48 0.22 18) 100%)`,
        boxShadow: 'inset -6px -10px 20px rgba(80,0,10,0.4), inset 6px 8px 18px rgba(255,255,255,0.6), 0 8px 24px -6px oklch(0.55 0.22 18 / 0.5)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* highlight */}
        <div style={{
          position: 'absolute', top: '8%', left: '14%',
          width: '38%', height: '28%', borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.85), transparent 70%)',
          filter: 'blur(2px)',
        }} />
        {/* tiny dot */}
        <div style={{
          position: 'absolute', top: '20%', right: '22%',
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
        }} />
      </div>
    </div>
  );
}

// ── Icon set (line, 22px) ──────────────────────────────────────
const Icon = {
  arrow: (props = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  ),
  back: (props = {}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  ),
  close: (p = {}) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>),
  mic: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>),
  send: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>),
  plus: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>),
  bell: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>),
  user: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>),
  chat: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z"/></svg>),
  spark: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>),
  paw: (p = {}) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <ellipse cx="6" cy="9" rx="2" ry="2.6"/><ellipse cx="10" cy="6" rx="2" ry="2.6"/><ellipse cx="14" cy="6" rx="2" ry="2.6"/><ellipse cx="18" cy="9" rx="2" ry="2.6"/>
      <path d="M12 11c-3 0-6 3-6 6 0 2.2 1.8 3 3.5 2.5C11 19 11 18 12 18s1 1 2.5 1.5C16.2 20 18 19.2 18 17c0-3-3-6-6-6Z"/>
    </svg>
  ),
  book: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4ZM4 16a4 4 0 0 1 4-4h12"/></svg>),
  history: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg>),
  trophy: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM4 5h4v3a2 2 0 0 1-4 0V5ZM16 5h4v3a2 2 0 0 1-4 0V5ZM12 13v4M8 21h8M9 17h6"/></svg>),
  settings: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>),
  search: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>),
  flame: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2c0 4 4 4 4 9a4 4 0 0 1-8 0c0-2 1-3 1-5 0 2 3 2 3-4ZM7 14a5 5 0 0 0 10 0"/></svg>),
  star: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2.5l2.95 6 6.6.95-4.78 4.65 1.13 6.55L12 17.6l-5.9 3.05 1.13-6.55L2.45 9.45l6.6-.95Z"/></svg>),
  check: (p = {}) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12l5 5L20 7"/></svg>),
  voice: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12h2M19 12h2M7 8v8M11 5v14M17 8v8M14 9v6"/></svg>),
  text: (p = {}) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 7h16M9 7v13M4 7V4h16v3"/></svg>),
};

// keyframes
if (!document.getElementById('pbt-kf')) {
  const s = document.createElement('style');
  s.id = 'pbt-kf';
  s.textContent = `
@keyframes pbtPulse { 0%,100% { transform: scale(1); opacity: .9; } 50% { transform: scale(1.06); opacity: 1; } }
@keyframes pbtFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes pbtFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pbtSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes pbtTypingDot { 0%,80%,100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@keyframes pbtRingBreath { 0%,100% { transform: scale(1); opacity: .5; } 50% { transform: scale(1.2); opacity: 0; } }
@keyframes pbtBarWave {
  0%,100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
}
.pbt-scroll::-webkit-scrollbar { width: 0; height: 0; }
.pbt-scroll { scrollbar-width: none; }
`;
  document.head.appendChild(s);
}

// ── Animated SVG personality wave ─────────────────────────────
// driver: 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer' | 'all'
// One soft, breathing sinusoidal line per driver, with a subtle glow.
const DRIVER_WAVE_COLORS = {
  Activator:  'oklch(0.62 0.22 22)',  // cherry red
  Energizer:  'oklch(0.70 0.18 70)',  // amber
  Analyzer:   'oklch(0.62 0.16 245)', // indigo
  Harmonizer: 'oklch(0.60 0.16 145)', // sage
};

function DriverWave({
  driver = 'all', height = 80, width = 360,
  amplitude = 1, opacity = 1, theme = 'light',
  speed = 1, count = null, // override line count
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = null;
    const tick = (ts) => {
      if (start === null) start = ts;
      setT((ts - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const dark = theme === 'dark';
  const allDrivers = driver === 'all';
  const driverList = allDrivers
    ? ['Activator', 'Energizer', 'Analyzer', 'Harmonizer']
    : [driver];

  // For single-driver mode, render 3 stacked harmonics of the same color
  const lines = (() => {
    if (allDrivers) {
      return driverList.map((d, i) => ({
        color: DRIVER_WAVE_COLORS[d],
        amp:   12 + (i % 2) * 4,
        freq:  0.9 + i * 0.18,
        speed: (0.7 + i * 0.18) * speed,
        phase: i * 1.3,
        width: 1.5,
        op:    0.85,
      }));
    }
    const c = DRIVER_WAVE_COLORS[driver] || DRIVER_WAVE_COLORS.Activator;
    return [
      { color: c, amp: 16, freq: 1.0,  speed: 0.8 * speed, phase: 0.0, width: 2.0, op: 0.95 },
      { color: c, amp: 11, freq: 1.45, speed: 1.05 * speed, phase: 1.4, width: 1.4, op: 0.55 },
      { color: c, amp: 7,  freq: 1.85, speed: 0.55 * speed, phase: 2.7, width: 1.0, op: 0.4 },
    ];
  })();

  const W = width, H = height;
  const cy = H / 2;
  const samples = 64;

  const buildPath = (line, tt) => {
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * W;
      const phase = (i / samples) * Math.PI * 2 * line.freq + tt * line.speed + line.phase;
      const env = Math.sin((i / samples) * Math.PI); // soft taper at both ends
      const y = cy + Math.sin(phase) * line.amp * amplitude * env;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    return d;
  };

  // unique-ish ids so multiple instances don't collide
  const uid = useMemo(() => 'dw' + Math.random().toString(36).slice(2, 8), []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
      style={{ overflow: 'visible', opacity }}>
      <defs>
        {lines.map((l, i) => (
          <linearGradient key={i} id={`${uid}-fade-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={l.color} stopOpacity="0"/>
            <stop offset="0.15" stopColor={l.color} stopOpacity={l.op}/>
            <stop offset="0.85" stopColor={l.color} stopOpacity={l.op}/>
            <stop offset="1" stopColor={l.color} stopOpacity="0"/>
          </linearGradient>
        ))}
        <filter id={`${uid}-glow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.4"/>
        </filter>
      </defs>

      {/* glow halo */}
      {lines.map((l, i) => (
        <path key={`g-${i}`} d={buildPath(l, t)} fill="none"
          stroke={`url(#${uid}-fade-${i})`} strokeWidth={l.width * 3}
          strokeLinecap="round" filter={`url(#${uid}-glow)`}
          style={{ opacity: 0.45, mixBlendMode: dark ? 'screen' : 'multiply' }}/>
      ))}
      {/* crisp lines */}
      {lines.map((l, i) => (
        <path key={`l-${i}`} d={buildPath(l, t)} fill="none"
          stroke={`url(#${uid}-fade-${i})`} strokeWidth={l.width}
          strokeLinecap="round"/>
      ))}
    </svg>
  );
}

Object.assign(window, { PBT, GradientBg, Glass, PillButton, Orb, Icon, DriverWave, DRIVER_WAVE_COLORS });
