import { useEffect, useRef, useState } from 'react';
import { useDynamicThemeTokens } from './hooks.ts';
import { useSideVeilPlugin } from './PluginContext.ts';

export type PluginColorMode = 'system' | 'light' | 'dark';

export interface PluginAppearanceSnapshot {
  themeId: string | null;
  colorMode: PluginColorMode | null;
}

export interface PluginThemeController<TThemeId extends string = string> {
  themeId?: TThemeId;
  colorMode?: PluginColorMode;
  resolvedScheme?: 'light' | 'dark';
  setThemeId: (themeId: TThemeId) => void;
  setColorMode: (mode: PluginColorMode) => void;
}

export interface UseSyncedPluginThemeOptions<TThemeId extends string = string, TConfig = unknown> {
  /**
   * Optional theme controller (such as the return value of `@pochita/ui`'s `useTheme()`).
   * When omitted, `useSyncedPluginTheme` updates `data-theme` and `<meta name="color-scheme">`
   * directly on `document.documentElement`.
   */
  theme?: PluginThemeController<TThemeId>;
  /** Optional validator guarding theme IDs passed to `theme.setThemeId`. */
  isValidThemeId?: (value: string) => value is TThemeId;
  /** Called after initial authoritative `config.get` resolves. */
  onConfigLoaded?: (rawConfig: TConfig, appearance: PluginAppearanceSnapshot) => void;
  /** Called whenever a `config.updated` event arrives from the host. */
  onConfigUpdated?: (
    rawConfig: TConfig,
    appearance: PluginAppearanceSnapshot,
    eventPayload: Record<string, unknown>,
  ) => void;
  /** Called if initial `config.get` fails. */
  onError?: (message: string) => void;
}

export interface UseSyncedPluginThemeResult {
  hydrated: boolean;
  isNativeHost: boolean;
  themeId: string | null;
  colorMode: PluginColorMode | null;
  resolvedScheme: 'light' | 'dark';
  isDark: boolean;
}

/**
 * Extracts `panel.themeId` and `panel.colorMode` from a raw SideVeil daemon config object.
 */
export function extractPluginAppearance(rawConfig: unknown): PluginAppearanceSnapshot {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { themeId: null, colorMode: null };
  }
  const panel = (rawConfig as { panel?: unknown }).panel;
  if (!panel || typeof panel !== 'object') {
    return { themeId: null, colorMode: null };
  }
  const p = panel as { themeId?: unknown; colorMode?: unknown };
  const themeId =
    typeof p.themeId === 'string' && p.themeId.trim().length > 0 ? p.themeId.trim() : null;
  const colorMode: PluginColorMode | null =
    p.colorMode === 'system' || p.colorMode === 'light' || p.colorMode === 'dark'
      ? p.colorMode
      : null;
  return { themeId, colorMode };
}

function getSystemScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyDomAppearance(appearance: PluginAppearanceSnapshot): void {
  if (typeof document === 'undefined') return;
  if (appearance.themeId) {
    document.documentElement.dataset.theme = appearance.themeId;
  }
  if (appearance.colorMode) {
    const content = appearance.colorMode === 'system' ? 'light dark' : appearance.colorMode;
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
}

/**
 * Synchronizes a SideVeil plugin WebView with authoritative daemon appearance config
 * (`config.get` + `config.updated`) and host-synthesized Material You `Oklch` palette tokens
 * (`theme.paletteUpdated`).
 */
export function useSyncedPluginTheme<TThemeId extends string = string, TConfig = unknown>(
  options: UseSyncedPluginThemeOptions<TThemeId, TConfig> = {},
): UseSyncedPluginThemeResult {
  const { bridge } = useSideVeilPlugin();
  const [hydrated, setHydrated] = useState(false);
  const [syncedThemeId, setSyncedThemeId] = useState<string | null>(null);
  const [syncedColorMode, setSyncedColorMode] = useState<PluginColorMode | null>(null);
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(() => getSystemScheme());

  const isNativeHost = bridge.env === 'host';
  useDynamicThemeTokens(isNativeHost);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let active = true;

    const applyAppearance = (appearance: PluginAppearanceSnapshot) => {
      if (appearance.themeId) setSyncedThemeId(appearance.themeId);
      if (appearance.colorMode) setSyncedColorMode(appearance.colorMode);

      const { theme, isValidThemeId } = optionsRef.current;
      if (theme) {
        if (appearance.themeId) {
          if (!isValidThemeId || isValidThemeId(appearance.themeId)) {
            theme.setThemeId(appearance.themeId as TThemeId);
          }
        }
        if (appearance.colorMode) {
          theme.setColorMode(appearance.colorMode);
        }
      } else {
        applyDomAppearance(appearance);
      }
    };

    const hydrate = async () => {
      try {
        const raw = await bridge.invoke<TConfig>('config.get');
        if (!active) return;
        const appearance = extractPluginAppearance(raw);
        applyAppearance(appearance);
        optionsRef.current.onConfigLoaded?.(raw, appearance);
      } catch (err) {
        if (!active) return;
        optionsRef.current.onError?.(
          `config.get failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (active) setHydrated(true);
      }
    };
    void hydrate();

    const unsubConfig = bridge.onHostEvent('config.updated', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const payload = raw as Record<string, unknown>;
      if (!('config' in payload) || !payload.config) return;
      const appearance = extractPluginAppearance(payload.config);
      applyAppearance(appearance);
      setHydrated(true);
      optionsRef.current.onConfigUpdated?.(payload.config as TConfig, appearance, payload);
    });

    return () => {
      active = false;
      unsubConfig();
    };
  }, [bridge]);

  const effectiveColorMode = options.theme?.colorMode ?? syncedColorMode;
  const resolvedScheme: 'light' | 'dark' =
    options.theme?.resolvedScheme ??
    (effectiveColorMode === 'light' || effectiveColorMode === 'dark'
      ? effectiveColorMode
      : systemScheme);

  return {
    hydrated,
    isNativeHost,
    themeId: options.theme?.themeId ?? syncedThemeId,
    colorMode: effectiveColorMode,
    resolvedScheme,
    isDark: resolvedScheme === 'dark',
  };
}
