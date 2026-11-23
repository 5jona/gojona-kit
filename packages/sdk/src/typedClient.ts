import { type BridgeClient, type InvokeOptions, useBridge } from '@gojona/bridge';
import { useCallback, useMemo, useRef } from 'react';

/** Parameter and result type pair for a single typed plugin JSON-RPC method. */
export type RpcMethodSpec = {
  params: unknown;
  result: unknown;
};

/** Dictionary mapping JSON-RPC method wire strings to their parameter and result specs. */
export type RpcMethodMap = Record<string, RpcMethodSpec>;

/** Dictionary mapping plugin event wire strings to their payload types. */
export type EventPayloadMap = Record<string, unknown>;

/** Structural constraint accepting both `Record`-based maps and generated TypeScript interfaces. */
type RpcMapConstraint<T> = { [K in keyof T]: RpcMethodSpec };

/**
 * Tuple of arguments accepted after the method name by `TypedPluginClient.invoke`.
 * Allows omitting `params` when the method expects `void`, `undefined`, or `Record<string, never>`.
 */
export type RpcInvokeArgs<TParams> = [TParams] extends [ReturnType<() => void>]
  ? [params?: TParams, options?: InvokeOptions]
  : [TParams] extends [Record<string, never>]
    ? [params?: TParams, options?: InvokeOptions]
    : undefined extends TParams
      ? [params?: TParams, options?: InvokeOptions]
      : [params: TParams, options?: InvokeOptions];

/** Minimal bridge transport surface required by `createTypedPluginClient`. */
export type TypedPluginBridge = Pick<BridgeClient, 'invokePlugin' | 'onPluginEvent'>;

/** Configuration options for `createTypedPluginClient` and `useTypedPluginClient`. */
export interface TypedPluginClientOptions<TRpcs extends RpcMapConstraint<TRpcs> = RpcMethodMap> {
  /** Fallback timeout in milliseconds applied when neither per-call nor per-method timeout is set. */
  defaultTimeoutMs?: number;
  /** Per-method timeout overrides in milliseconds keyed by RPC method name. */
  methodTimeouts?: Partial<Record<keyof TRpcs & string, number>>;
}

/** Zero-re-render, compile-time-typed plugin RPC and event client. */
export interface TypedPluginClient<
  TRpcs extends RpcMapConstraint<TRpcs> = RpcMethodMap,
  TEvents extends object = EventPayloadMap,
> {
  /**
   * Invokes a typed plugin backend JSON-RPC method with timeout precedence:
   * per-call `options.timeoutMs` -> `methodTimeouts[method]` -> `defaultTimeoutMs` -> transport default.
   */
  invoke<M extends keyof TRpcs & string>(
    method: M,
    ...args: RpcInvokeArgs<TRpcs[M]['params']>
  ): Promise<TRpcs[M]['result']>;

  /**
   * Subscribes to a typed plugin-scoped event via `bridge.onPluginEvent` and returns an unsubscribe handle.
   */
  onEvent<E extends keyof TEvents & string>(
    event: E,
    handler: (payload: TEvents[E]) => void,
  ): () => void;
}

function resolveInvokeOptions<TRpcs extends RpcMapConstraint<TRpcs>>(
  method: keyof TRpcs & string,
  callOptions: InvokeOptions | undefined,
  clientOptions: TypedPluginClientOptions<TRpcs> | undefined,
): InvokeOptions | undefined {
  const timeoutMs =
    callOptions?.timeoutMs ??
    clientOptions?.methodTimeouts?.[method] ??
    clientOptions?.defaultTimeoutMs;
  return timeoutMs !== undefined ? { timeoutMs } : undefined;
}

/**
 * Creates a lightweight, zero-re-render, compile-time-typed plugin client over a `BridgeClient`.
 * Designed to pair directly with generated `*RpcMethodMap` and `*EventPayloadMap` contracts.
 */
export function createTypedPluginClient<
  TRpcs extends RpcMapConstraint<TRpcs>,
  TEvents extends object = EventPayloadMap,
>(
  bridge: TypedPluginBridge,
  options?: TypedPluginClientOptions<TRpcs>,
): TypedPluginClient<TRpcs, TEvents> {
  const defaultTimeoutMs = options?.defaultTimeoutMs;
  const methodTimeouts = options?.methodTimeouts ? { ...options.methodTimeouts } : undefined;
  const snapshot: TypedPluginClientOptions<TRpcs> | undefined =
    defaultTimeoutMs !== undefined || methodTimeouts !== undefined
      ? { defaultTimeoutMs, methodTimeouts }
      : undefined;

  return {
    invoke<M extends keyof TRpcs & string>(
      method: M,
      ...args: RpcInvokeArgs<TRpcs[M]['params']>
    ): Promise<TRpcs[M]['result']> {
      const [params, callOptions] = args as [TRpcs[M]['params'] | undefined, InvokeOptions?];
      const invokeOpts = resolveInvokeOptions(method, callOptions, snapshot);
      return bridge.invokePlugin<TRpcs[M]['result']>(method, params, invokeOpts);
    },

    onEvent<E extends keyof TEvents & string>(
      event: E,
      handler: (payload: TEvents[E]) => void,
    ): () => void {
      return bridge.onPluginEvent<TEvents[E]>(event, handler);
    },
  };
}

/**
 * React hook returning a memoized, referentially stable `TypedPluginClient` bound to `useBridge()`.
 * Allocates zero `useState` hooks, avoiding re-render overhead across multi-method plugin clients.
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
 * allocations or component re-renders. Complements `usePluginRpc` when callers manage loading or
 * error state externally.
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
