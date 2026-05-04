// PBT — App shell, navigation, and screen router
// Responsive mobile-first web app

const { useState, useEffect, useRef, useMemo } = React;

// ───────────────────── App Frame ─────────────────────
// A responsive mobile-first column. On wide screens, sits centered
// inside a "stage" that shows the gradient canvas around it.
function AppFrame({ children, theme = 'light', dir = 'tl', intensity = 1, scale = 1, embedded = false, primaryColor = null, secondaryColor = null }) {
  // When embedded (inside design canvas), render fixed 414×896
  // When standalone, fill viewport with max width 440
  if (embedded) {
    return (
      <div style={{
        width: 414, height: 896, position: 'relative',
        borderRadius: 32, overflow: 'hidden',
        boxShadow: '0 30px 80px -20px oklch(0.45 0.20 18 / 0.35), 0 12px 30px -10px oklch(0.45 0.20 18 / 0.25)',
      }}>
        <GradientBg theme={theme} dir={dir} intensity={intensity} primaryColor={primaryColor} secondaryColor={secondaryColor}>
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', fontSize: 14 * scale }}>
            {children}
          </div>
        </GradientBg>
      </div>
    );
  }
  return (
    <div style={{
      minHeight: '100vh', width: '100%', position: 'relative',
      background: theme === 'dark' ? '#070203' : '#fff7f5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Outer canvas — visible on desktop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <GradientBg theme={theme} dir={dir} intensity={intensity * 0.65} primaryColor={primaryColor} secondaryColor={secondaryColor} />
      </div>
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 440, height: '100vh',
        maxHeight: 920, minHeight: 680,
        boxShadow: '0 30px 80px -20px oklch(0.45 0.20 18 / 0.35)',
        borderRadius: 'min(28px, 0vw)', overflow: 'hidden',
      }}
      className="pbt-frame">
        <GradientBg theme={theme} dir={dir} intensity={intensity} primaryColor={primaryColor} secondaryColor={secondaryColor}>
          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', fontSize: 14 * scale }}>
            {children}
          </div>
        </GradientBg>
      </div>
    </div>
  );
}

// ───────────────────── Top Bar ─────────────────────
function TopBar({ title, onBack, trailing, theme = 'light', transparent = true }) {
  const dark = theme === 'dark';
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 18px 10px',
      background: transparent ? 'transparent' : (dark ? 'rgba(20,8,10,0.55)' : 'rgba(255,255,255,0.55)'),
      backdropFilter: transparent ? 'none' : 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: transparent ? 'none' : 'blur(20px) saturate(180%)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 60 }}>
        {onBack ? (
          <button onClick={onBack} style={{
            width: 36, height: 36, borderRadius: 18,
            background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)',
            border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: dark ? '#fff' : 'oklch(0.30 0.10 20)', cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 0 rgba(255,255,255,0.8) inset',
          }}>
            <Icon.back/>
          </button>
        ) : <span/>}
      </div>
      {title && (
        <div style={{
          fontFamily: 'var(--pbt-font)', fontWeight: 600, fontSize: 16,
          color: dark ? '#fff' : 'oklch(0.20 0.04 20)', letterSpacing: '-0.01em',
        }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 60, justifyContent: 'flex-end' }}>
        {trailing}
      </div>
    </div>
  );
}

// ───────────────────── Bottom tab bar ─────────────────────
function TabBar({ active, onChange, theme = 'light' }) {
  const dark = theme === 'dark';
  const tabs = [
    { id: 'home', label: 'Train', icon: Icon.spark },
    { id: 'history', label: 'History', icon: Icon.history },
    { id: 'resources', label: 'Library', icon: Icon.book },
    { id: 'settings', label: 'You', icon: Icon.user },
  ];
  return (
    <div style={{
      position: 'absolute', left: 14, right: 14, bottom: 14, zIndex: 4,
    }}>
      <Glass radius={28} blur={36} tint={dark ? 0.32 : 0.32} padding={6} theme={theme}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {tabs.map(t => {
            const isActive = t.id === active;
            return (
              <button key={t.id} onClick={() => onChange(t.id)} style={{
                flex: 1, height: 52, border: 'none', cursor: 'pointer',
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                background: isActive
                  ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                  : 'transparent',
                color: isActive ? '#fff' : (dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.06 20)'),
                borderRadius: 22,
                boxShadow: isActive ? '0 4px 12px -2px oklch(0.55 0.22 18 / 0.5), 0 1px 0 rgba(255,255,255,0.4) inset' : 'none',
                transition: 'all 0.2s',
              }}>
                <t.icon/>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em' }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </Glass>
    </div>
  );
}

// ───────────────────── Page Layout ─────────────────────
// Scrollable body that respects bottom tab bar
function Page({ children, padBottom = 100, theme = 'light' }) {
  return (
    <div className="pbt-scroll" style={{
      position: 'absolute', inset: 0,
      overflowY: 'auto', overflowX: 'hidden',
      paddingBottom: padBottom,
    }}>
      {children}
    </div>
  );
}

Object.assign(window, { AppFrame, TopBar, TabBar, Page });
