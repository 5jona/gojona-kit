import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isValidThemeId, THEME_REGISTRY } from './registry.ts';
import { buildThemeSyncKey } from './sync.ts';
import { STORAGE_KEY_SCHEME, STORAGE_KEY_THEME } from './tokens.ts';
import type {
  ColorMode,
  ResolvedColorScheme,
  SurfaceMode,
  ThemeDefinition,
  ThemeId,
  ThemeSyncPayload,
} from './types.ts';

export { buildThemeSyncKey, STORAGE_KEY_SCHEME, STORAGE_KEY_THEME };

function readStoredTheme(fallback: ThemeId): ThemeId {
  if (typeof window === 'undefined') return fallback;
  try {
    const val = window.localStorage.getItem(STORAGE_KEY_THEME);
    return isValidThemeId(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

function readStoredColorMode(fallback: ColorMode): ColorMode {
  if (typeof window === 'undefined') return fallback;
  try {
    const val = window.localStorage.getItem(STORAGE_KEY_SCHEME);
    if (val === 'light' || val === 'dark' || val === 'system') return val;
    return fallback;
  } catch {
    return fallback;
  }
}

function getSystemScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateMetaColorScheme(mode: ColorMode): void {
  if (typeof document === 'undefined') return;
  const content = mode === 'system' ? 'light dark' : mode;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  if (meta.content !== content) {
    meta.content = content;
  }
}

/**
 * Active theme and color-scheme state exposed by `useTheme()`.
 */
export interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDefinition;
  colorMode: ColorMode;
  systemScheme: ResolvedColorScheme;
  resolvedScheme: ResolvedColorScheme;
  surfaceMode: SurfaceMode;
  setThemeId: (themeId: ThemeId) => void;
  setColorMode: (mode: ColorMode) => void;
  setSurfaceMode: (surface: SurfaceMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Props for `<ThemeProvider>`.
 */
export interface ThemeProviderProps {
  defaultTheme?: ThemeId;
  defaultColorMode?: ColorMode;
  defaultSurfaceMode?: SurfaceMode;
  surfaceMode?: SurfaceMode;
  /**
   * Whether theme synchronization with the native container host is enabled.
   * Daemon-backed embedded WebViews should pass `syncEnabled={hydrated}` so stale
   * `localStorage` values do not flash the native container backdrop before authoritative config loads.
   * Defaults to `true`.
   */
  syncEnabled?: boolean;
  onThemeSync?: (payload: ThemeSyncPayload) => void;
  children: ReactNode;
}

/**
 * Root theme provider managing `data-theme`, `data-surface`, `data-color-scheme`,
 * `<meta name="color-scheme">`, `localStorage` persistence, and host container synchronization.
 */
export function ThemeProvider({
  defaultTheme = 'coloros-glass',
  defaultColorMode = 'system',
  defaultSurfaceMode = 'standalone',
  surfaceMode: controlledSurfaceMode,
  syncEnabled = true,
  onThemeSync,
  children,
}: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readStoredTheme(defaultTheme));
  const [colorMode, setColorModeState] = useState<ColorMode>(() =>
    readStoredColorMode(defaultColorMode),
  );
  const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(getSystemScheme);
  const [internalSurfaceMode, setInternalSurfaceMode] = useState<SurfaceMode>(defaultSurfaceMode);

  const onThemeSyncRef = useRef(onThemeSync);
  onThemeSyncRef.current = onThemeSync;
  const hasOnThemeSync = Boolean(onThemeSync);
  const lastSyncedKeyRef = useRef<string>('');

  const surfaceMode = controlledSurfaceMode ?? internalSurfaceMode;
  const resolvedScheme: ResolvedColorScheme = colorMode === 'system' ? systemScheme : colorMode;
  const theme = THEME_REGISTRY[themeId];

  const setThemeId = useCallback((nextTheme: ThemeId) => {
    setThemeIdState(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY_THEME, nextTheme);
    } catch {
      // Ignore storage errors in restricted contexts.
    }
  }, []);

  const setColorMode = useCallback((nextMode: ColorMode) => {
    setColorModeState(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY_SCHEME, nextMode);
    } catch {
      // Ignore storage errors in restricted contexts.
    }
  }, []);

  const setSurfaceMode = useCallback((nextSurface: SurfaceMode) => {
    setInternalSurfaceMode(nextSurface);
  }, []);

  // Track OS scheme changes purely for `resolvedScheme` & UI labels without clearing user pin.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (ev: MediaQueryListEvent) => {
      setSystemScheme(ev.matches ? 'dark' : 'light');
    };
    setSystemScheme(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  // Cross-tab synchronization via storage events.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY_THEME) {
        setThemeIdState(isValidThemeId(ev.newValue) ? ev.newValue : defaultTheme);
      } else if (ev.key === STORAGE_KEY_SCHEME) {
        if (ev.newValue === 'light' || ev.newValue === 'dark' || ev.newValue === 'system') {
          setColorModeState(ev.newValue);
        } else {
          setColorModeState('system');
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [defaultTheme]);

  // Apply DOM attributes, <meta name="color-scheme">, and notify Android container host.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = themeId;
      document.documentElement.dataset.surface = surfaceMode;
      document.documentElement.dataset.colorScheme = resolvedScheme;
      updateMetaColorScheme(colorMode);
    }

    const payload: ThemeSyncPayload = {
      themeId,
      colorScheme: resolvedScheme,
      wantsNativeBlur: theme.wantsNativeBlur,
      cornerRadiusPx: theme.defaultCornerRadiusPx,
    };

    if (syncEnabled && hasOnThemeSync && onThemeSyncRef.current) {
      const syncKey = buildThemeSyncKey(payload);
      if (syncKey !== lastSyncedKeyRef.current) {
        lastSyncedKeyRef.current = syncKey;
        onThemeSyncRef.current(payload);
      }
    }
  }, [themeId, surfaceMode, colorMode, resolvedScheme, theme, syncEnabled, hasOnThemeSync]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      theme,
      colorMode,
      systemScheme,
      resolvedScheme,
      surfaceMode,
      setThemeId,
      setColorMode,
      setSurfaceMode,
    }),
    [
      themeId,
      theme,
      colorMode,
      systemScheme,
      resolvedScheme,
      surfaceMode,
      setThemeId,
      setColorMode,
      setSurfaceMode,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Accesses the active `<ThemeProvider>` context value.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
