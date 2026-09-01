// Applies the persisted theme before first paint to avoid a flash of the wrong
// theme. Loaded as a classic (non-module) same-origin script so it satisfies
// the app's `script-src 'self'` CSP without needing 'unsafe-inline', and runs
// before React (and therefore before any IPC call) exists.
//
// Mirrors ThemeProvider's resolution + color-application logic (src/renderer/src/providers/ThemeProvider.tsx).
// Color values are data now (see src/renderer/src/theme/light.json and dark.json,
// applied to :root at runtime instead of a static CSS block) — the two
// builtin palettes are duplicated here as a bootstrap fallback only because
// this script can't import that JSON before paint. A custom (uploaded) theme
// is instead read from the localStorage cache CustomConfigProvider keeps in
// sync (maddoner:customThemeCache), so a previously-selected custom theme is
// also flash-free on the next launch.
;(function () {
  var BUILTIN_THEMES = {
    light: {
      mode: 'light',
      titleBarOverlay: { color: '#fafafa', symbolColor: '#737373' },
      colors: {
        '--background': 'oklch(1 0 0)',
        '--foreground': 'oklch(0.145 0 0)',
        '--card': 'oklch(1 0 0)',
        '--card-foreground': 'oklch(0.145 0 0)',
        '--popover': 'oklch(1 0 0)',
        '--popover-foreground': 'oklch(0.145 0 0)',
        '--primary': 'oklch(0.205 0 0)',
        '--primary-foreground': 'oklch(0.985 0 0)',
        '--secondary': 'oklch(0.97 0 0)',
        '--secondary-foreground': 'oklch(0.205 0 0)',
        '--muted': 'oklch(0.97 0 0)',
        '--muted-foreground': 'oklch(0.556 0 0)',
        '--accent': 'oklch(0.97 0 0)',
        '--accent-foreground': 'oklch(0.205 0 0)',
        '--destructive': 'oklch(0.577 0.245 27.325)',
        '--border': 'oklch(0.922 0 0)',
        '--input': 'oklch(0.922 0 0)',
        '--ring': 'oklch(0.708 0 0)',
        '--sidebar': 'oklch(0.985 0 0)',
        '--sidebar-foreground': 'oklch(0.145 0 0)',
        '--sidebar-primary': 'oklch(0.623 0.214 259.815)',
        '--sidebar-primary-foreground': 'oklch(0.546 0.245 262.881)',
        '--sidebar-accent': 'oklch(0.97 0 0)',
        '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
        '--sidebar-border': 'oklch(0.922 0 0)',
        '--sidebar-ring': 'oklch(0.708 0 0)',
        '--titlebar': 'oklch(0.985 0 0)',
        '--titlebar-foreground': 'oklch(0.145 0 0)',
        '--titlebar-border': 'oklch(0.922 0 0)',
        '--scene-canvas': 'oklch(1 0 0)'
      }
    },
    dark: {
      mode: 'dark',
      titleBarOverlay: { color: '#171717', symbolColor: '#a3a3a3' },
      colors: {
        '--background': 'oklch(0.145 0 0)',
        '--foreground': 'oklch(0.985 0 0)',
        '--card': 'oklch(0.205 0 0)',
        '--card-foreground': 'oklch(0.985 0 0)',
        '--popover': 'oklch(0.205 0 0)',
        '--popover-foreground': 'oklch(0.985 0 0)',
        '--primary': 'oklch(0.922 0 0)',
        '--primary-foreground': 'oklch(0.205 0 0)',
        '--secondary': 'oklch(0.269 0 0)',
        '--secondary-foreground': 'oklch(0.985 0 0)',
        '--muted': 'oklch(0.269 0 0)',
        '--muted-foreground': 'oklch(0.708 0 0)',
        '--accent': 'oklch(0.269 0 0)',
        '--accent-foreground': 'oklch(0.985 0 0)',
        '--destructive': 'oklch(0.704 0.191 22.216)',
        '--border': 'oklch(1 0 0 / 10%)',
        '--input': 'oklch(1 0 0 / 15%)',
        '--ring': 'oklch(0.556 0 0)',
        '--sidebar': 'oklch(0.205 0 0)',
        '--sidebar-foreground': 'oklch(0.985 0 0)',
        '--sidebar-primary': 'oklch(0.623 0.214 259.815)',
        '--sidebar-primary-foreground': 'oklch(0.707 0.165 254.624)',
        '--sidebar-accent': 'oklch(0.269 0 0)',
        '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
        '--sidebar-border': 'oklch(1 0 0 / 10%)',
        '--sidebar-ring': 'oklch(0.556 0 0)',
        '--titlebar': 'oklch(0.205 0 0)',
        '--titlebar-foreground': 'oklch(0.985 0 0)',
        '--titlebar-border': 'oklch(1 0 0 / 10%)',
        '--scene-canvas': 'oklch(0.145 0 0)'
      }
    }
  }

  try {
    var STORAGE_KEY = 'maddoner:theme'
    var CUSTOM_CACHE_KEY = 'maddoner:customThemeCache'
    var pref = localStorage.getItem(STORAGE_KEY) || 'system'

    var resolved = null
    var themeId = pref

    if (pref === 'system') {
      var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      themeId = isDark ? 'dark' : 'light'
    }

    if (BUILTIN_THEMES[themeId]) {
      resolved = BUILTIN_THEMES[themeId]
    } else {
      try {
        var cached = JSON.parse(localStorage.getItem(CUSTOM_CACHE_KEY) || '[]')
        for (var i = 0; i < cached.length; i++) {
          if (cached[i] && cached[i].id === themeId) {
            resolved = { mode: cached[i].mode, titleBarOverlay: cached[i].titleBarOverlay, colors: cached[i].colors }
            break
          }
        }
      } catch (e) {
        // fall through to the light fallback below
      }
    }

    if (!resolved) {
      themeId = 'light'
      resolved = BUILTIN_THEMES.light
    }

    document.documentElement.setAttribute('data-theme', themeId)
    document.documentElement.classList.toggle('dark', resolved.mode === 'dark')
    for (var key in resolved.colors) {
      document.documentElement.style.setProperty(key, resolved.colors[key])
    }

    // The native titlebar buttons (see titleBarOverlay in src/main/index.ts) are
    // drawn by DWM, not this page, so they start out hardcoded to a guess —
    // correct them here too, as early as the persisted theme is known, so
    // they don't visibly mismatch the page for even a moment.
    if (window.maddoner && window.maddoner.setTitleBarOverlay) {
      window.maddoner.setTitleBarOverlay(resolved.titleBarOverlay)
    }
  } catch (e) {
    // localStorage unavailable — just keep the default light theme.
  }
})()
