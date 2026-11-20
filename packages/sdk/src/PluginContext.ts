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
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PluginContextValue, PluginManifest } from './types.ts';

const SideveilPluginContext = createContext<PluginContextValue | null>(null);

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
  const [backendState, setBackendState] = useState<PluginBackendState>(
    manifest?.backend && manifest.backend !== 'none' ? 'offline' : 'none',
  );

  useEffect(() => {
    return bridge.onPluginBackendState((state) => {
      setBackendState(state);
    });
  }, [bridge]);

  const value = useMemo<PluginContextValue>(
    () => ({
      pluginId,
      manifest,
      bridge,
      backendState,
    }),
    [pluginId, manifest, bridge, backendState],
  );

  return createElement(SideveilPluginContext.Provider, { value }, children);
}

export interface SideveilPluginProviderProps {
  pluginId?: string;
  manifest?: PluginManifest;
  bridgeOptions?: BridgeOptions;
  children?: ReactNode;
}

/**
 * Root context provider for a Sideveil plugin WebView application.
 * Manages plugin identity, backend connection state, and bridge RPC multiplexing.
 */
export function SideveilPluginProvider({
  pluginId,
  manifest,
  bridgeOptions,
  children,
}: SideveilPluginProviderProps) {
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
 * Access the active Sideveil plugin context.
 */
export function useSideveilPlugin(): PluginContextValue {
  const ctx = useContext(SideveilPluginContext);
  if (!ctx) {
    throw new Error('useSideveilPlugin must be used within a SideveilPluginProvider');
  }
  return ctx;
}
