// src/lib/theme.js
export function applyPrefs(prefs = {}) {
    const root = document.documentElement;
    const body = document.body;
  
    const theme   = prefs.theme || 'system';   // 'light' | 'dark' | 'system'
    const accent  = prefs.accent || 'blue';    // 'blue' | 'violet' | 'emerald' | 'amber' | 'rose'
    const font    = prefs.fontSize || 'base';  // 'base' | 'lg' | 'xl'
    const reduced = !!prefs.reducedMotion;
  
    // --- theme (dark class on <html>) ---
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');  // ← IMPORTANT: clear when switching to light
  
    // auto-switch when in “system”
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e) => {
      if ((prefs.theme || 'system') === 'system') {
        if (e.matches) root.classList.add('dark');
        else root.classList.remove('dark');
      }
    };
    mq.addEventListener?.('change', onSystemChange);
  
    // --- accent color as CSS var ---
    const palette = {
      blue: '#3b82f6',
      violet: '#8b5cf6',
      emerald: '#10b981',
      amber: '#f59e0b',
      rose: '#f43f5e',
    };
    root.style.setProperty('--accent', palette[accent] || palette.blue);
  
    // --- font size on <body> ---
    body.classList.remove('text-base', 'text-lg', 'text-xl');
    body.classList.add(font === 'lg' ? 'text-lg' : font === 'xl' ? 'text-xl' : 'text-base');
  
    // --- motion ---
    root.style.setProperty('--motion', reduced ? '0' : '1');
  }
  