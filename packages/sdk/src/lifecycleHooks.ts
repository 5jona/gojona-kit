import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLUGIN_EVENT_LAGGED_EVENT } from './manifest.ts';
import { useSideVeilPlugin } from './PluginContext.ts';
import type {
  NetworkContextSnapshot,
  NetworkTransportKind,
  PanelVisibilityState,
  ScopeChangedState,
} from './types.ts';

const VALID_TRANSPORTS = new Set<NetworkTransportKind>([
  'wifi',
  'cellular',
  'ethernet',
  'other',
  'none',
]);

/**
 * Validates and extracts visibility boolean from a `panel.visibility` host event payload.
 */
export function parsePanelVisibilityEvent(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object') return null;
  const visible = (raw as { visible?: unknown }).visible;
  return typeof visible === 'boolean' ? visible : null;
}

/**
 * Validates and extracts scope transition fields from a `scope.changed` host event payload.
 * Reads canonical `active` with backward-compatible fallback to `scopeActive`.
 */
export function parseScopeChangedEvent(raw: unknown): ScopeChangedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as {
    foregroundPackage?: unknown;
    foregroundActivity?: unknown;
    active?: unknown;
    scopeActive?: unknown;
  };
  if (typeof record.foregroundPackage !== 'string') return null;
  const active =
    typeof record.active === 'boolean'
      ? record.active
      : typeof record.scopeActive === 'boolean'
        ? record.scopeActive
        : false;
  return {
    foregroundPackage: record.foregroundPackage,
    foregroundActivity:
      typeof record.foregroundActivity === 'string' ? record.foregroundActivity : '',
    active,
    scopeActive: active,
  };
}

/**
 * Validates a `NetworkContextSnapshot` returned by `network.context` or `network.contextChanged`.
 */
export function parseNetworkContextSnapshot(raw: unknown): NetworkContextSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const transport = record.transport;
  if (typeof transport !== 'string' || !VALID_TRANSPORTS.has(transport as NetworkTransportKind)) {
    return null;
  }
  return {
    transport: transport as NetworkTransportKind,
    vpnActive: Boolean(record.vpnActive),
    validated: Boolean(record.validated),
    metered: Boolean(record.metered),
    ...(record.interfaceName !== undefined
      ? { interfaceName: typeof record.interfaceName === 'string' ? record.interfaceName : null }
      : {}),
    ...(record.ssid !== undefined
      ? { ssid: typeof record.ssid === 'string' ? record.ssid : null }
      : {}),
    ...(record.gateway !== undefined
      ? { gateway: typeof record.gateway === 'string' ? record.gateway : null }
      : {}),
    ...(record.localIpv4 !== undefined
      ? { localIpv4: typeof record.localIpv4 === 'string' ? record.localIpv4 : null }
      : {}),
  };
}

/**
 * Extracts the dropped event count from a `plugin.eventLagged` scoped event payload.
 */
export function parsePluginEventLaggedPayload(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (!raw || typeof raw !== 'object') return null;
  const dropped = (raw as { dropped?: unknown }).dropped;
  if (typeof dropped === 'number' && Number.isFinite(dropped) && dropped >= 0) {
    return Math.floor(dropped);
  }
  return null;
}

/**
 * Subscribes to host `panel.visibility` and browser `visibilitychange` events so plugins
 * can pause polling or animations whenever the overlay drawer or WebView document is hidden.
 */
export function usePanelVisibility(): PanelVisibilityState {
  const { bridge } = useSideVeilPlugin();
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelState, setPanelState] = useState<string | undefined>(undefined);
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document === 'undefined' ? false : Boolean(document.hidden),
  );

  useEffect(() => {
    return bridge.onHostEvent('panel.visibility', (raw) => {
      const next = parsePanelVisibilityEvent(raw);
      if (next !== null) {
        setPanelVisible(next);
        const rawState = (raw as { state?: unknown }).state;
        setPanelState(typeof rawState === 'string' ? rawState : undefined);
      }
    });
  }, [bridge]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setDocumentHidden(Boolean(document.hidden));
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const visible = panelVisible && !documentHidden;
  return useMemo(
    () => (panelState !== undefined ? { visible, state: panelState } : { visible }),
    [visible, panelState],
  );
}

/**
 * Subscribes to host `scope.changed` events indicating foreground app/activity changes.
 */
export function useScopeChanged(): ScopeChangedState {
  const { bridge } = useSideVeilPlugin();
  const [scope, setScope] = useState<ScopeChangedState>({
    foregroundPackage: '',
    foregroundActivity: '',
    active: false,
    scopeActive: false,
  });

  useEffect(() => {
    return bridge.onHostEvent('scope.changed', (raw) => {
      const next = parseScopeChangedEvent(raw);
      if (next !== null) {
        setScope(next);
      }
    });
  }, [bridge]);

  return scope;
}

export interface UseNetworkContextOptions {
  /** Whether to query `network.context` immediately on mount. Defaults to `true`. */
  initialFetch?: boolean;
}

export interface UseNetworkContextResult {
  context: NetworkContextSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Queries `network.context` on mount (unless `initialFetch: false`) and subscribes to
 * `network.contextChanged` host events (`network-context` capability).
 */
export function useNetworkContext(options?: UseNetworkContextOptions): UseNetworkContextResult {
  const { bridge } = useSideVeilPlugin();
  const initialFetch = options?.initialFetch !== false;
  const [context, setContext] = useState<NetworkContextSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(initialFetch);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await bridge.invoke<unknown>('network.context');
      if (!mountedRef.current) return;
      const parsed = parseNetworkContextSnapshot(raw);
      if (parsed !== null) {
        setContext(parsed);
      }
    } catch {
      // Preserve last known snapshot on transient RPC errors.
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [bridge]);

  useEffect(() => {
    if (initialFetch) {
      void refresh();
    }
  }, [initialFetch, refresh]);

  useEffect(() => {
    return bridge.onHostEvent('network.contextChanged', (raw) => {
      const parsed = parseNetworkContextSnapshot(raw);
      if (parsed !== null) {
        setContext(parsed);
        setLoading(false);
      }
    });
  }, [bridge]);

  return useMemo(() => ({ context, loading, refresh }), [context, loading, refresh]);
}

/**
 * Subscribes to `plugin.eventLagged` scoped events notifying how many backend events were dropped
 * due to subscriber backpressure.
 */
export function usePluginEventLagged(onLagged: (dropped: number) => void): void {
  const { bridge } = useSideVeilPlugin();
  const handlerRef = useRef(onLagged);
  handlerRef.current = onLagged;

  useEffect(() => {
    return bridge.onPluginEvent(PLUGIN_EVENT_LAGGED_EVENT, (raw) => {
      const dropped = parsePluginEventLaggedPayload(raw);
      if (dropped !== null) {
        handlerRef.current(dropped);
      }
    });
  }, [bridge]);
}
