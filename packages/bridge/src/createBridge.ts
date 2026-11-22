import { detectPluginId, detectRuntime } from './detect.ts';
import { HostTransport } from './host.ts';
import { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic } from './ksu.ts';
import { MockTransport, runMockExec, runMockRpc } from './mock.ts';
import { createBridgeEventSubscriptions } from './rpcError.ts';
import {
  BridgeTracer,
  createTraceStore,
  installPochitaDebugHandle,
  uninstallPochitaDebugHandle,
} from './trace.ts';
import type {
  BridgeClient,
  BridgeDiagnosticsSnapshot,
  BridgeOptions,
  BridgeTraceListener,
  ContainerAction,
  ExecOptions,
  ExecResult,
  HostEventListener,
  InvokeOptions,
  WriteFileAtomicOptions,
} from './types.ts';

export {
  BridgeProvider,
  type BridgeProviderProps,
  useBridge,
} from './BridgeProvider.tsx';

/**
 * Extra client-side wire margin added to `plugin.invoke` timeouts so `sideveild`'s
 * structured `-32011` timeout error arrives before the local JS fallback timer fires.
 */
export const PLUGIN_INVOKE_WIRE_TIMEOUT_MARGIN_MS = 2000;

/**
 * Creates a runtime-aware bridge client supporting embedded WebView hosts,
 * KernelSU WebUI, and browser mock preview modes behind a single interface.
 */
export function createBridge(options: BridgeOptions = {}): BridgeClient {
  const allowUrlOverride = options.allowUrlOverride ?? options.allowQueryOverride;
  const env = options.forceEnv ?? detectRuntime({ allowUrlOverride });
  const pluginId = detectPluginId(options.pluginId);
  const mockNamespace = options.mockNamespace ?? 'default';
  let ksuDisposed = false;

  const ownsMockTransport = !options.mockTransport;
  const sharedTraceStore =
    options.traceStore ??
    ((env === 'mock' || env === 'browser') && options.mockTransport
      ? options.mockTransport.getTraceStore()
      : createTraceStore({ maxEntries: options.traceBufferSize }));
  const unsubscribeOnTrace = options.onTrace ? sharedTraceStore.subscribe(options.onTrace) : null;

  const hostTransport =
    env === 'host'
      ? new HostTransport({
          wsUrl: options.wsUrl,
          timeoutMs: options.timeoutMs,
          allowedOrigins: options.allowedOrigins,
          traceStore: sharedTraceStore,
        })
      : null;
  const mockTransport =
    env === 'mock' || env === 'browser'
      ? (options.mockTransport ??
        new MockTransport({
          namespace: mockNamespace,
          persistToLocalStorage: true,
          timeoutMs: options.timeoutMs,
          onExec: options.onMockExec,
          onRpc: options.onMockRpc,
          onPluginInvoke: options.onMockPluginInvoke,
          onContainerAction: options.onMockContainerAction,
          traceStore: sharedTraceStore,
        }))
      : null;

  const exec = async (cmd: string, execOpts?: ExecOptions): Promise<ExecResult> => {
    if (env === 'ksu') {
      return ksuExec(cmd, { timeoutMs: options.timeoutMs, ...execOpts });
    }
    if (hostTransport) {
      return hostTransport.invoke<ExecResult>('system.exec', { cmd, options: execOpts });
    }
    return mockTransport
      ? mockTransport.exec(cmd, execOpts)
      : runMockExec(mockNamespace, cmd, execOpts, options.onMockExec);
  };

  const readFile = async (path: string): Promise<string | null> => {
    if (env === 'ksu') {
      return ksuReadFile(path);
    }
    if (hostTransport) {
      const res = await hostTransport.invoke<{ content: string | null }>('fs.read', { path });
      return res?.content ?? null;
    }
    return mockTransport ? mockTransport.readFile(path) : null;
  };

  const writeFileAtomic = async (
    path: string,
    content: string,
    writeOpts?: WriteFileAtomicOptions,
  ): Promise<ExecResult> => {
    if (env === 'ksu') {
      return ksuWriteFileAtomic(path, content, writeOpts);
    }
    if (hostTransport) {
      return hostTransport.invoke<ExecResult>('fs.writeAtomic', {
        path,
        content,
        options: writeOpts,
      });
    }
    return mockTransport
      ? mockTransport.writeFile(path, content)
      : { errno: -1, stdout: '', stderr: 'No mock transport available' };
  };

  const invoke = async <T = unknown>(
    method: string,
    params?: unknown,
    callOpts?: InvokeOptions,
  ): Promise<T> => {
    if (hostTransport) {
      return hostTransport.invoke<T>(method, params, callOpts?.timeoutMs);
    }
    if (env === 'ksu') {
      const ksuTracer = new BridgeTracer(undefined, undefined, sharedTraceStore);
      const startedAt = Date.now();
      ksuTracer.rpcStart('ksu', undefined, method, startedAt, params);
      try {
        if (!options.onKsuRpc) {
          throw new Error(
            `JSON-RPC invoke("${method}") is not supported in KernelSU mode unless onKsuRpc is provided`,
          );
        }
        const res = (await options.onKsuRpc(method, params)) as T;
        ksuTracer.rpcOk('ksu', undefined, method, startedAt, res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ksuTracer.rpcError('ksu', undefined, method, startedAt, msg);
        throw err;
      }
    }
    return mockTransport
      ? mockTransport.invoke<T>(method, params, callOpts)
      : (runMockRpc(mockNamespace, method, params, options.onMockRpc) as Promise<T>);
  };

  const invokePlugin = async <T = unknown>(
    method: string,
    params?: unknown,
    callOpts?: InvokeOptions,
  ): Promise<T> => {
    if (hostTransport) {
      const timeoutMs = callOpts?.timeoutMs;
      const invokePayload =
        timeoutMs !== undefined ? { method, params, timeoutMs } : { method, params };
      const wireTimeoutMs =
        timeoutMs !== undefined ? timeoutMs + PLUGIN_INVOKE_WIRE_TIMEOUT_MARGIN_MS : undefined;
      return hostTransport.invoke<T>('plugin.invoke', invokePayload, wireTimeoutMs);
    }
    if (env === 'ksu') {
      if (options.onMockPluginInvoke) {
        return (await options.onMockPluginInvoke(method, params)) as T;
      }
      if (options.onKsuRpc) {
        return (await options.onKsuRpc(`plugin.invoke:${method}`, params)) as T;
      }
      throw new Error(
        `invokePlugin("${method}") is not supported in KernelSU mode unless onMockPluginInvoke or onKsuRpc is provided`,
      );
    }
    if (mockTransport) {
      return mockTransport.invokePlugin<T>(method, params, callOpts);
    }
    return runMockRpc(
      mockNamespace,
      `plugin.invoke:${method}`,
      params,
      options.onMockRpc,
    ) as Promise<T>;
  };

  const toast = (message: string): void => {
    if (env === 'ksu' && ksuToast(message)) {
      return;
    }
    if (hostTransport) {
      void hostTransport.invoke('ui.toast', { message }).catch(() => {});
    }
  };

  const sendContainerAction = async (action: ContainerAction): Promise<void> => {
    if (hostTransport) {
      await hostTransport.sendContainerAction(action);
      return;
    }
    mockTransport?.sendContainerAction(action);
  };

  const onHostEvent = (event: string, listener: HostEventListener): (() => void) => {
    if (hostTransport) {
      return hostTransport.subscribe(event, listener);
    }
    if (mockTransport) {
      return mockTransport.subscribe(event, listener);
    }
    return () => {};
  };

  const { onPluginEvent, onPluginBackendState, onBackPressed, onThemePalette } =
    createBridgeEventSubscriptions(pluginId, onHostEvent);

  const getDiagnostics = (): BridgeDiagnosticsSnapshot => {
    if (hostTransport) {
      return hostTransport.getDiagnostics(pluginId);
    }
    if (mockTransport) {
      return mockTransport.getDiagnostics(pluginId, env);
    }
    return {
      env,
      pluginId,
      channelKind: 'ksu',
      pendingCount: 0,
      pendingMethods: [],
      lastError: sharedTraceStore.getLastError(),
      disposed: ksuDisposed,
      traceCount: sharedTraceStore.getTraceCount(),
    };
  };

  const getTraceEntries = (limit?: number) => sharedTraceStore.getEntries(limit);
  const clearTraceEntries = () => sharedTraceStore.clear();
  const subscribeTrace = (listener: BridgeTraceListener) => sharedTraceStore.subscribe(listener);

  const debugHandle = installPochitaDebugHandle({
    env,
    getDiagnostics,
    getRecentTraces: getTraceEntries,
    emitMockHostEvent:
      env === 'mock' && mockTransport
        ? (event, payload) => mockTransport.emit(event, payload)
        : undefined,
  });

  const dispose = (): void => {
    ksuDisposed = true;
    unsubscribeOnTrace?.();
    uninstallPochitaDebugHandle(debugHandle);
    hostTransport?.dispose();
    if (ownsMockTransport) {
      mockTransport?.dispose();
    }
  };

  return {
    env,
    pluginId,
    exec,
    readFile,
    writeFileAtomic,
    invoke,
    invokePlugin,
    toast,
    sendContainerAction,
    onHostEvent,
    onPluginEvent,
    onPluginBackendState,
    onBackPressed,
    onThemePalette,
    getDiagnostics,
    getTraceEntries,
    clearTraceEntries,
    subscribeTrace,
    dispose,
  };
}
