import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { detectPluginId, detectRuntime } from './detect.ts';
import { HostTransport } from './host.ts';
import { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic } from './ksu.ts';
import { MockTransport, runMockExec, runMockRpc } from './mock.ts';
import type {
  BridgeClient,
  BridgeOptions,
  ContainerAction,
  ExecOptions,
  ExecResult,
  HostEventListener,
  PluginBackendState,
  WriteFileAtomicOptions,
} from './types.ts';

/**
 * Creates a runtime-aware bridge client supporting embedded WebView hosts,
 * KernelSU WebUI, and browser mock preview modes behind a single interface.
 */
export function createBridge(options: BridgeOptions = {}): BridgeClient {
  const allowUrlOverride = options.allowUrlOverride ?? options.allowQueryOverride;
  const env = options.forceEnv ?? detectRuntime({ allowUrlOverride });
  const pluginId = detectPluginId(options.pluginId);
  const mockNamespace = options.mockNamespace ?? 'default';
  const hostTransport =
    env === 'host'
      ? new HostTransport({
        wsUrl: options.wsUrl,
        timeoutMs: options.timeoutMs,
        allowedOrigins: options.allowedOrigins,
      })
      : null;
  const ownsMockTransport = !options.mockTransport;
  const mockTransport =
    env === 'mock' || env === 'browser'
      ? (options.mockTransport ??
        new MockTransport({
          namespace: mockNamespace,
          persistToLocalStorage: true,
          onExec: options.onMockExec,
          onRpc: options.onMockRpc,
          onPluginInvoke: options.onMockPluginInvoke,
          onContainerAction: options.onMockContainerAction,
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

  const invoke = async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    if (hostTransport) {
      return hostTransport.invoke<T>(method, params);
    }
    if (env === 'ksu') {
      if (options.onKsuRpc) {
        return (await options.onKsuRpc(method, params)) as T;
      }
      throw new Error(
        `JSON-RPC invoke("${method}") is not supported in KernelSU mode unless onKsuRpc is provided`,
      );
    }
    return mockTransport
      ? mockTransport.invoke<T>(method, params)
      : (runMockRpc(mockNamespace, method, params, options.onMockRpc) as Promise<T>);
  };

  const invokePlugin = async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    if (hostTransport) {
      return hostTransport.invoke<T>('plugin.invoke', { method, params });
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
      return mockTransport.invokePlugin<T>(method, params);
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
      void hostTransport.invoke('ui.toast', { message }).catch(() => { });
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
    return () => { };
  };

  const onPluginEvent = <T = unknown>(
    event: string,
    listener: (payload: T) => void,
  ): (() => void) => {
    const unsubScoped = onHostEvent('plugin.event', (data) => {
      if (data && typeof data === 'object') {
        const payloadObj = data as { pluginId?: string; event?: string; payload?: T };
        if (payloadObj.event === event) {
          listener(payloadObj.payload as T);
        }
      }
    });
    const unsubDirect = onHostEvent(event, (data) => {
      listener(data as T);
    });
    return () => {
      unsubScoped();
      unsubDirect();
    };
  };

  const onPluginBackendState = (listener: (state: PluginBackendState) => void): (() => void) => {
    return onHostEvent('plugin.backendState', (data) => {
      if (data && typeof data === 'object') {
        const payloadObj = data as {
          pluginId?: string;
          state?: PluginBackendState;
        };
        if (payloadObj.state) {
          listener(payloadObj.state);
        }
      }
    });
  };

  const onBackPressed = (listener: () => void): (() => void) => {
    return onHostEvent('panel.backPressed', () => {
      listener();
    });
  };

  const dispose = (): void => {
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
    dispose,
  };
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
  });
  callbacksRef.current = {
    onMockExec: options?.onMockExec,
    onMockRpc: options?.onMockRpc,
    onMockPluginInvoke: options?.onMockPluginInvoke,
    onKsuRpc: options?.onKsuRpc,
    onMockContainerAction: options?.onMockContainerAction,
  };

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
    return () => {
      if (!client) {
        bridge.dispose();
      }
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
