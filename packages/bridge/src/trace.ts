import type {
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  BridgeTraceListener,
  PochitaDebugHandle,
  RuntimeEnv,
} from './types.ts';

const DEFAULT_MAX_TRACES = 100;

const DEBUG_THEME_TOKENS = [
  '--surface-canvas',
  '--surface-panel',
  '--surface-card',
  '--surface-elevated',
  '--surface-toast',
  '--text-primary',
  '--text-secondary',
  '--border-hairline',
  '--glass-divider',
  '--accent',
  '--accent-soft',
  '--accent-fg',
  '--success',
  '--warning',
  '--danger',
  '--radius-panel',
  '--radius-card',
  '--radius-control',
  '--radius-pill',
  '--blur-amount',
] as const;

/**
 * Bounded ring-buffer tracer for bridge RPC and event diagnostics.
 */
export class BridgeTracer {
  private readonly maxEntries: number;
  private readonly entries: BridgeTraceEvent[] = [];
  private readonly onTrace?: BridgeTraceListener;
  private totalCount = 0;
  private lastError: string | null = null;

  constructor(onTrace?: BridgeTraceListener, maxEntries = DEFAULT_MAX_TRACES) {
    this.onTrace = onTrace;
    this.maxEntries = Math.max(1, maxEntries);
  }

  record(event: Omit<BridgeTraceEvent, 'timestampMs'> & { timestampMs?: number }): void {
    const entry: BridgeTraceEvent = {
      ...event,
      timestampMs: event.timestampMs ?? Date.now(),
    };
    this.totalCount += 1;
    if (entry.kind === 'rpc.error' && entry.error) {
      this.lastError = entry.error;
    }
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    if (this.onTrace) {
      try {
        this.onTrace(entry);
      } catch {
        // Isolate observer exceptions so transport execution is never disrupted.
      }
    }
  }

  getRecentTraces(limit?: number): BridgeTraceEvent[] {
    if (limit === undefined || limit >= this.entries.length) {
      return this.entries.slice();
    }
    if (limit <= 0) return [];
    return this.entries.slice(-limit);
  }

  getTraceCount(): number {
    return this.totalCount;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  setLastError(error: string | null): void {
    this.lastError = error;
  }
}

/**
 * Read-only DOM theme token inspector exposed via `window.__POCHITA_DEBUG__`
 * without introducing a runtime dependency from `@pochita/bridge` on `@pochita/ui`.
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

  for (const token of DEBUG_THEME_TOKENS) {
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
