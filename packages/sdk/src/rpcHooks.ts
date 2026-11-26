import type { InvokeOptions } from '@gojona/bridge';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';
import type { PluginBackendState, PluginRpcState } from './types.ts';

/**
 * Perform type-safe JSON-RPC calls against the plugin's dedicated native/app UDS backend.
 * Accepts an optional default `timeoutMs` (overrideable per call) for long-running backend RPCs.
 */
export function usePluginRpc<TParams = unknown, TResult = unknown>(
  method: string,
  defaultOptions?: InvokeOptions,
) {
  const { bridge } = useSideVeilPlugin();
  const defaultTimeoutMs = defaultOptions?.timeoutMs;
  const [state, setState] = useState<PluginRpcState<TResult>>({
    data: null,
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);
  const callSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const invoke = useCallback(
    async (params?: TParams, callOptions?: InvokeOptions): Promise<TResult> => {
      const seq = ++callSeqRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const timeoutMs = callOptions?.timeoutMs ?? defaultTimeoutMs;
      const invokeOpts = timeoutMs !== undefined ? { timeoutMs } : undefined;
      try {
        const res = await bridge.invokePlugin<TResult>(method, params, invokeOpts);
        if (mountedRef.current && seq === callSeqRef.current) {
          setState({ data: res, loading: false, error: null });
        }
        return res;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current && seq === callSeqRef.current) {
          setState({ data: null, loading: false, error });
        }
        throw error;
      }
    },
    [bridge, defaultTimeoutMs, method],
  );

  return {
    invoke,
    data: state.data,
    loading: state.loading,
    error: state.error,
  };
}

/**
 * Subscribe to plugin-scoped events pushed by daemon or UDS backend.
 */
export function usePluginEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const { bridge } = useSideVeilPlugin();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return bridge.onPluginEvent<T>(event, (payload) => {
      handlerRef.current(payload);
    });
  }, [bridge, event]);
}

/**
 * Returns the current backend connection status of this plugin.
 */
export function usePluginBackendState(): PluginBackendState {
  const { backendState } = useSideVeilPlugin();
  return backendState;
}
