import type { DynamicThemePalettePayload, HostEventListener, PluginBackendState } from './types.ts';

/**
 * Structured JSON-RPC error returned by an embedded host or plugin backend,
 * preserving the numeric error `code`, RPC `method`, and optional structured `data`.
 */
export class BridgeRpcError extends Error {
  readonly code: number;
  readonly method: string;
  readonly data?: unknown;

  constructor(code: number, method: string, message: string, data?: unknown) {
    super(`${message} (code ${code})`);
    this.name = 'BridgeRpcError';
    this.code = code;
    this.method = method;
    this.data = data;
  }
}

/**
 * Invokes all registered listeners for an event using a snapshot copy and per-listener
 * exception isolation so one throwing subscriber cannot prevent remaining subscribers
 * from receiving the event.
 */
export function dispatchEventListeners(
  listeners: Map<string, Set<HostEventListener>>,
  event: string,
  payload: unknown,
): void {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  for (const listener of Array.from(set)) {
    try {
      listener(payload);
    } catch {
      // Isolate listener exceptions so remaining subscribers still execute.
    }
  }
}

/**
 * Builds plugin-scoped event subscription helpers with `pluginId` isolation and
 * scoped/direct deduplication.
 */
export function createBridgeEventSubscriptions(
  pluginId: string | null,
  onHostEvent: (event: string, listener: HostEventListener) => () => void,
) {
  const matchesPluginScope = (payloadPluginId: unknown): boolean =>
    !pluginId || typeof payloadPluginId !== 'string' || payloadPluginId === pluginId;

  const onPluginEvent = <T = unknown>(
    event: string,
    listener: (payload: T) => void,
  ): (() => void) => {
    let suppressNextDirect = false;
    const unsubScoped = onHostEvent('plugin.event', (data) => {
      if (data && typeof data === 'object') {
        const payloadObj = data as { pluginId?: string; event?: string; payload?: T };
        if (payloadObj.event === event && matchesPluginScope(payloadObj.pluginId)) {
          suppressNextDirect = true;
          queueMicrotask(() => {
            suppressNextDirect = false;
          });
          listener(payloadObj.payload as T);
        }
      }
    });
    if (event === 'plugin.event') {
      return unsubScoped;
    }
    const unsubDirect = onHostEvent(event, (data) => {
      if (suppressNextDirect) {
        suppressNextDirect = false;
        return;
      }
      if (
        data &&
        typeof data === 'object' &&
        !matchesPluginScope((data as { pluginId?: unknown }).pluginId)
      ) {
        return;
      }
      listener(data as T);
    });
    return () => {
      unsubScoped();
      unsubDirect();
    };
  };

  const onPluginBackendState = (listener: (state: PluginBackendState) => void): (() => void) =>
    onHostEvent('plugin.backendState', (data) => {
      if (data && typeof data === 'object') {
        const payloadObj = data as { pluginId?: string; state?: PluginBackendState };
        if (payloadObj.state && matchesPluginScope(payloadObj.pluginId)) {
          listener(payloadObj.state);
        }
      }
    });

  const onBackPressed = (listener: () => void): (() => void) =>
    onHostEvent('panel.backPressed', () => {
      listener();
    });

  const onThemePalette = (listener: (palette: DynamicThemePalettePayload) => void): (() => void) =>
    onHostEvent('theme.paletteUpdated', (data) => {
      if (data && typeof data === 'object' && 'cssTokens' in data) {
        listener(data as DynamicThemePalettePayload);
      }
    });

  return {
    onPluginEvent,
    onPluginBackendState,
    onBackPressed,
    onThemePalette,
  };
}
