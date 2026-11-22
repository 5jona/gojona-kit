import { sanitizeTraceValue } from './traceSanitize.ts';
import { createTraceStore, DEFAULT_TRACE_BUFFER_SIZE } from './traceStore.ts';
import type {
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  BridgeTraceInput,
  BridgeTraceListener,
  BridgeTraceStore,
  BridgeTraceTransport,
  PochitaDebugHandle,
  RuntimeEnv,
} from './types.ts';

export { createTraceStore, DEFAULT_TRACE_BUFFER_SIZE, sanitizeTraceValue };

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
 * Delegates storage and subscriptions to a `BridgeTraceStore`.
 */
export class BridgeTracer {
  private readonly store: BridgeTraceStore;

  constructor(
    onTrace?: BridgeTraceListener,
    maxEntries = DEFAULT_TRACE_BUFFER_SIZE,
    store?: BridgeTraceStore,
  ) {
    this.store = store ?? createTraceStore({ maxEntries });
    if (onTrace) {
      this.store.subscribe(onTrace);
    }
  }

  getStore(): BridgeTraceStore {
    return this.store;
  }

  record(event: BridgeTraceInput): BridgeTraceEvent {
    return this.store.push(event);
  }

  rpcStart(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.start',
      phase: 'request',
      transport,
      id,
      method,
      timestampMs: startedAt,
      payloadPreview,
    });
  }

  rpcOk(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.ok',
      phase: 'response',
      transport,
      id,
      method,
      durationMs: Math.max(0, Date.now() - startedAt),
      payloadPreview,
    });
  }

  rpcError(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    error: string,
    options?: { code?: number; timedOut?: boolean },
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.error',
      phase: options?.timedOut ? 'timeout' : 'error',
      transport,
      id,
      method,
      durationMs: Math.max(0, Date.now() - startedAt),
      error,
      ...(options?.code !== undefined ? { code: options.code } : {}),
    });
  }

  eventIn(
    transport: BridgeTraceTransport,
    event: string,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'event.in',
      phase: 'event',
      transport,
      event,
      payloadPreview,
    });
  }

  getRecentTraces(limit?: number): BridgeTraceEvent[] {
    return this.store.getEntries(limit);
  }

  clear(): void {
    this.store.clear();
  }

  subscribe(listener: BridgeTraceListener): () => void {
    return this.store.subscribe(listener);
  }

  exportJson(pretty = true): string {
    return this.store.exportJson(pretty);
  }

  getTraceCount(): number {
    return this.store.getTraceCount();
  }

  getLastError(): string | null {
    return this.store.getLastError();
  }

  setLastError(error: string | null): void {
    this.store.setLastError(error);
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
