import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PLUGIN_EVENT_LAGGED_EVENT } from './manifest.ts';
import { useSideVeilPlugin } from './PluginContext.ts';
import {
  parseNetworkContextSnapshot,
  parsePanelVisibilityEvent,
  parsePluginEventLaggedPayload,
  parseScopeChangedEvent,
} from './parsers.ts';
import type { NetworkContextSnapshot, PanelVisibilityState, ScopeChangedState } from './types.ts';

export {
  parseNetworkContextSnapshot,
  parsePanelVisibilityEvent,
  parsePluginEventLaggedPayload,
  parseScopeChangedEvent,
};

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
