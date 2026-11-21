import {
  type BridgeOptions,
  BridgeProvider,
  detectPluginId,
  type PluginBackendState,
  useBridge,
} from '@pochita/bridge';
import {
  createContext,
  createElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PluginContextValue, PluginManifest, PluginsSnapshotPayload } from './types.ts';

const SideVeilPluginContext = createContext<PluginContextValue | null>(null);

function PluginContextInner({
  pluginId,
  manifest,
  children,
}: {
  pluginId: string;
  manifest?: PluginManifest;
  children?: ReactNode;
}) {
  const bridge = useBridge();
  const hasBackend = Boolean(manifest?.backend && manifest.backend !== 'none');
  const [backendState, setBackendState] = useState<PluginBackendState>(
    hasBackend ? 'offline' : 'none',
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = bridge.onPluginBackendState((state) => {
      if (active) setBackendState(state);
    });

    if (hasBackend && bridge.env === 'host') {
      void bridge
        .invoke<PluginsSnapshotPayload>('plugins.list')
        .then((snapshot) => {
          if (!active || !snapshot || !Array.isArray(snapshot.plugins)) return;
          const entry = snapshot.plugins.find((item) => item.id === pluginId);
          if (entry?.backendState) {
            setBackendState(entry.backendState);
          }
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, hasBackend, pluginId]);

  const value = useMemo<PluginContextValue>(
    () => ({
      pluginId,
      manifest,
      bridge,
      backendState,
    }),
    [pluginId, manifest, bridge, backendState],
  );

  return createElement(SideVeilPluginContext.Provider, { value }, children);
}

export interface SideVeilPluginProviderProps {
  pluginId?: string;
  manifest?: PluginManifest;
  bridgeOptions?: BridgeOptions;
  children?: ReactNode;
}

/**
 * Root context provider for a SideVeil plugin WebView application.
 * Manages plugin identity, backend connection state, and bridge RPC multiplexing.
 */
export function SideVeilPluginProvider({
  pluginId,
  manifest,
  bridgeOptions,
  children,
}: SideVeilPluginProviderProps): ReactElement {
  const resolvedPluginId =
    pluginId ?? manifest?.id ?? detectPluginId(bridgeOptions?.pluginId) ?? 'unknown.plugin';

  const mergedBridgeOptions = useMemo<BridgeOptions>(
    () => ({
      ...bridgeOptions,
      pluginId: resolvedPluginId,
    }),
    [bridgeOptions, resolvedPluginId],
  );

  return createElement(
    BridgeProvider,
    { options: mergedBridgeOptions },
    createElement(PluginContextInner, { pluginId: resolvedPluginId, manifest }, children),
  );
}

/**
 * Access the active SideVeil plugin context.
 */
export function useSideVeilPlugin(): PluginContextValue {
  const ctx = useContext(SideVeilPluginContext);
  if (!ctx) {
    throw new Error('useSideVeilPlugin must be used within a SideVeilPluginProvider');
  }
  return ctx;
}
