import { type InvokeOptions, useBridge } from '@gojona/bridge';
import { useCallback, useMemo, useRef } from 'react';
import {
  createTypedPluginClient,
  type EventPayloadMap,
  type RpcInvokeArgs,
  type RpcMapConstraint,
  type RpcMethodMap,
  type RpcMethodSpec,
  resolveInvokeOptions,
  type TypedPluginBridge,
  type TypedPluginClient,
  type TypedPluginClientOptions,
} from './typedClientCore.ts';

export {
  createTypedPluginClient,
  type EventPayloadMap,
  type RpcInvokeArgs,
  type RpcMethodMap,
  type RpcMethodSpec,
  type TypedPluginBridge,
  type TypedPluginClient,
  type TypedPluginClientOptions,
};

/**
 * React hook returning a memoized, referentially stable `TypedPluginClient` bound to `useBridge()`.
 */
export function useTypedPluginClient<
  TRpcs extends RpcMapConstraint<TRpcs>,
  TEvents extends object = EventPayloadMap,
>(options?: TypedPluginClientOptions<TRpcs>): TypedPluginClient<TRpcs, TEvents> {
  const bridge = useBridge();
  const optionsRef = useRef<TypedPluginClientOptions<TRpcs> | undefined>(options);
  optionsRef.current = options;

  return useMemo<TypedPluginClient<TRpcs, TEvents>>(
    () => ({
      invoke<M extends keyof TRpcs & string>(
        method: M,
        ...args: RpcInvokeArgs<TRpcs[M]['params']>
      ): Promise<TRpcs[M]['result']> {
        const [params, callOptions] = args as [TRpcs[M]['params'] | undefined, InvokeOptions?];
        const invokeOpts = resolveInvokeOptions(method, callOptions, optionsRef.current);
        return bridge.invokePlugin<TRpcs[M]['result']>(method, params, invokeOpts);
      },

      onEvent<E extends keyof TEvents & string>(
        event: E,
        handler: (payload: TEvents[E]) => void,
      ): () => void {
        return bridge.onPluginEvent<TEvents[E]>(event, handler);
      },
    }),
    [bridge],
  );
}

/**
 * Lightweight single-method plugin RPC invoke callback bound to `useBridge()` with zero `useState`
 * allocations or component re-renders.
 */
export function usePluginInvoke<TParams = Record<string, unknown>, TResult = unknown>(
  method: string,
  options?: InvokeOptions,
): (params?: TParams, callOptions?: InvokeOptions) => Promise<TResult> {
  const bridge = useBridge();
  const defaultTimeoutMs = options?.timeoutMs;

  return useCallback(
    (params?: TParams, callOptions?: InvokeOptions): Promise<TResult> => {
      const timeoutMs = callOptions?.timeoutMs ?? defaultTimeoutMs;
      const invokeOpts = timeoutMs !== undefined ? { timeoutMs } : undefined;
      return bridge.invokePlugin<TResult>(method, params, invokeOpts);
    },
    [bridge, defaultTimeoutMs, method],
  );
}
