import type { BridgeClient, InvokeOptions } from '@gojona/bridge/core';

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
export type RpcMapConstraint<T> = { [K in keyof T]: RpcMethodSpec };

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
  defaultTimeoutMs?: number;
  methodTimeouts?: Partial<Record<keyof TRpcs & string, number>>;
}

/** Zero-re-render, compile-time-typed plugin RPC and event client. */
export interface TypedPluginClient<
  TRpcs extends RpcMapConstraint<TRpcs> = RpcMethodMap,
  TEvents extends object = EventPayloadMap,
> {
  invoke<M extends keyof TRpcs & string>(
    method: M,
    ...args: RpcInvokeArgs<TRpcs[M]['params']>
  ): Promise<TRpcs[M]['result']>;

  onEvent<E extends keyof TEvents & string>(
    event: E,
    handler: (payload: TEvents[E]) => void,
  ): () => void;
}

export function resolveInvokeOptions<TRpcs extends RpcMapConstraint<TRpcs>>(
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
