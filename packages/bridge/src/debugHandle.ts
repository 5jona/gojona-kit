import { SEMANTIC_THEME_TOKENS } from '@pochita/config/themes';
import type {
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  PochitaDebugHandle,
  RuntimeEnv,
} from './types.ts';

/**
 * Read-only DOM theme token inspector exposed via `window.__POCHITA_DEBUG__`
 * using the canonical semantic token list from `@pochita/config/themes`.
 */
export function inspectDomThemeTokens(): Record<string, unknown> {
  if (typeof document === 'undefined' || !document.documentElement) {
    return {
      themeId: null,
      surface: null,
      colorScheme: 'dark',
      tokens: {},
      inlineOverrides: {},
    };
  }
  const root = document.documentElement;
  const datasetScheme = root.dataset?.colorScheme;
  const colorScheme =
    datasetScheme === 'light' || datasetScheme === 'dark'
      ? datasetScheme
      : typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  const styles = typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  const tokens: Record<
    string,
    { token: string; resolved: string; computed: string; inlineOverride: string | null }
  > = {};
  const inlineOverrides: Record<string, string> = {};

  for (const token of SEMANTIC_THEME_TOKENS) {
    const inlineVal = root.style?.getPropertyValue?.(token)?.trim() ?? '';
    const computed = styles ? styles.getPropertyValue(token).trim() : '';
    const schemeVal = styles ? styles.getPropertyValue(`${token}-${colorScheme}`).trim() : '';
    const resolved =
      (inlineVal && !inlineVal.includes('light-dark') ? inlineVal : '') ||
      schemeVal ||
      (computed && !computed.includes('light-dark') ? computed : '') ||
      computed;
    tokens[token] = {
      token,
      resolved,
      computed,
      inlineOverride: inlineVal || null,
    };
    if (inlineVal) {
      inlineOverrides[token] = inlineVal;
    }
  }

  return {
    themeId: root.dataset?.theme ?? null,
    surface: root.dataset?.surface ?? null,
    colorScheme,
    tokens,
    inlineOverrides,
  };
}

/**
 * Installs a frozen read-only `window.__POCHITA_DEBUG__` inspection handle for live CDP diagnostics.
 * Exposes `emitHostEvent` strictly in `mock` env only.
 */
export function installPochitaDebugHandle(options: {
  env: RuntimeEnv;
  getDiagnostics: () => BridgeDiagnosticsSnapshot;
  getRecentTraces: (limit?: number) => BridgeTraceEvent[];
  emitMockHostEvent?: (event: string, payload?: unknown) => void;
}): PochitaDebugHandle | null {
  if (typeof window === 'undefined') return null;

  const handle: PochitaDebugHandle = Object.freeze({
    getDiagnostics: () => options.getDiagnostics(),
    getRecentTraces: (limit?: number) => options.getRecentTraces(limit),
    inspectThemeTokens: () => inspectDomThemeTokens(),
    ...(options.env === 'mock' && options.emitMockHostEvent
      ? { emitHostEvent: options.emitMockHostEvent }
      : {}),
  });

  window.__POCHITA_DEBUG__ = handle;
  return handle;
}

/**
 * Removes `window.__POCHITA_DEBUG__` only if it still references the given handle.
 */
export function uninstallPochitaDebugHandle(handle: PochitaDebugHandle | null): void {
  if (!handle || typeof window === 'undefined') return;
  if (window.__POCHITA_DEBUG__ === handle) {
    delete window.__POCHITA_DEBUG__;
  }
}
