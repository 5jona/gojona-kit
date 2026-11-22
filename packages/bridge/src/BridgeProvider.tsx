import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { createBridge } from './createBridge.ts';
import { runMockExec, runMockRpc } from './mock.ts';
import type { BridgeClient, BridgeOptions } from './types.ts';

export interface DeferredBridgeDisposer {
  retain: (bridge: BridgeClient) => void;
  scheduleDispose: (bridge: BridgeClient) => void;
}

/**
 * Coordinates deferred microtask-cancellable disposal for React 19 `<StrictMode>`
 * mount -> cleanup -> remount cycles so a `useMemo`-retained bridge stays live
 * across StrictMode double-effect invocation while still disposing on real unmount.
 */
export function createDeferredBridgeDisposer(): DeferredBridgeDisposer {
  const pending = new Map<BridgeClient, { cancelled: boolean }>();

  const retain = (bridge: BridgeClient): void => {
    const token = pending.get(bridge);
    if (token) {
      token.cancelled = true;
      pending.delete(bridge);
    }
  };

  const scheduleDispose = (bridge: BridgeClient): void => {
    const prev = pending.get(bridge);
    if (prev) {
      prev.cancelled = true;
    }
    const token = { cancelled: false };
    pending.set(bridge, token);
    queueMicrotask(() => {
      if (token.cancelled) return;
      if (pending.get(bridge) === token) {
        pending.delete(bridge);
      }
      bridge.dispose();
    });
  };

  return { retain, scheduleDispose };
}

const BridgeContext = createContext<BridgeClient | null>(null);

export interface BridgeProviderProps {
  options?: BridgeOptions;
  client?: BridgeClient;
  children?: ReactNode;
}

export function BridgeProvider({ options, client, children }: BridgeProviderProps) {
  const callbacksRef = useRef({
    onMockExec: options?.onMockExec,
    onMockRpc: options?.onMockRpc,
    onMockPluginInvoke: options?.onMockPluginInvoke,
    onKsuRpc: options?.onKsuRpc,
    onMockContainerAction: options?.onMockContainerAction,
    onTrace: options?.onTrace,
  });
  callbacksRef.current = {
    onMockExec: options?.onMockExec,
    onMockRpc: options?.onMockRpc,
    onMockPluginInvoke: options?.onMockPluginInvoke,
    onKsuRpc: options?.onKsuRpc,
    onMockContainerAction: options?.onMockContainerAction,
    onTrace: options?.onTrace,
  };

  const disposerRef = useRef<DeferredBridgeDisposer | null>(null);
  if (!disposerRef.current) {
    disposerRef.current = createDeferredBridgeDisposer();
  }

  const pluginId = options?.pluginId;
  const forceEnv = options?.forceEnv;
  const mockTransport = options?.mockTransport;
  const allowUrlOverride = options?.allowUrlOverride ?? options?.allowQueryOverride;
  const wsUrl = options?.wsUrl;
  const mockNamespace = options?.mockNamespace;
  const timeoutMs = options?.timeoutMs;
  const allowedOriginsKey = options?.allowedOrigins?.join('\u0000') ?? '';

  const bridge = useMemo(() => {
    if (client) return client;
    return createBridge({
      pluginId,
      forceEnv,
      mockTransport,
      allowUrlOverride,
      wsUrl,
      mockNamespace,
      timeoutMs,
      allowedOrigins: allowedOriginsKey ? allowedOriginsKey.split('\u0000') : undefined,
      onMockExec: (cmd, execOpts) =>
        callbacksRef.current.onMockExec
          ? callbacksRef.current.onMockExec(cmd, execOpts)
          : runMockExec(mockNamespace ?? 'default', cmd, execOpts),
      onMockRpc: (method, params) =>
        callbacksRef.current.onMockRpc
          ? callbacksRef.current.onMockRpc(method, params)
          : runMockRpc(mockNamespace ?? 'default', method, params),
      onMockPluginInvoke: (method, params) =>
        callbacksRef.current.onMockPluginInvoke
          ? callbacksRef.current.onMockPluginInvoke(method, params)
          : runMockRpc(mockNamespace ?? 'default', `plugin.invoke:${method}`, params),
      onKsuRpc: (method, params) => {
        if (callbacksRef.current.onKsuRpc) {
          return callbacksRef.current.onKsuRpc(method, params);
        }
        throw new Error(
          `JSON-RPC invoke("${method}") is not supported in KernelSU mode unless onKsuRpc is provided`,
        );
      },
      onMockContainerAction: (action) => callbacksRef.current.onMockContainerAction?.(action),
      onTrace: (entry) => callbacksRef.current.onTrace?.(entry),
    });
  }, [
    client,
    pluginId,
    forceEnv,
    mockTransport,
    allowUrlOverride,
    wsUrl,
    mockNamespace,
    timeoutMs,
    allowedOriginsKey,
  ]);

  useEffect(() => {
    if (client) return;
    const disposer = disposerRef.current;
    disposer?.retain(bridge);
    return () => {
      disposer?.scheduleDispose(bridge);
    };
  }, [bridge, client]);

  return createElement(BridgeContext.Provider, { value: bridge }, children);
}

let defaultFallbackBridge: BridgeClient | null = null;

function getDefaultFallbackBridge(): BridgeClient {
  if (!defaultFallbackBridge) {
    defaultFallbackBridge = createBridge();
  }
  return defaultFallbackBridge;
}

/**
 * Returns the nearest BridgeClient instance (falling back to a lazy shared client
 * when called outside BridgeProvider).
 */
export function useBridge(): BridgeClient {
  const ctx = useContext(BridgeContext);
  return ctx ?? getDefaultFallbackBridge();
}
