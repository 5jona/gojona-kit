import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { detectRuntime } from './detect.ts';
import { HostTransport } from './host.ts';
import { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic } from './ksu.ts';
import {
  dispatchMockContainerAction,
  mockReadFile,
  mockWriteFile,
  runMockExec,
  runMockRpc,
} from './mock.ts';
import type {
  BridgeClient,
  BridgeOptions,
  ContainerAction,
  ExecOptions,
  ExecResult,
  HostEventListener,
  WriteFileAtomicOptions,
} from './types.ts';

/**
 * Creates a runtime-aware bridge client supporting embedded WebView hosts,
 * KernelSU WebUI, and browser mock preview modes behind a single interface.
 */
export function createBridge(options: BridgeOptions = {}): BridgeClient {
  const allowUrlOverride = options.allowUrlOverride ?? options.allowQueryOverride;
  const env =
    options.forceEnv ?? detectRuntime({ allowUrlOverride });
  const mockNamespace = options.mockNamespace ?? 'default';
  const transport =
    env === 'host'
      ? new HostTransport({
        wsUrl: options.wsUrl,
        timeoutMs: options.timeoutMs,
        allowedOrigins: options.allowedOrigins,
      })
      : null;

  const exec = async (cmd: string, execOpts?: ExecOptions): Promise<ExecResult> => {
    if (env === 'ksu') {
      return ksuExec(cmd, { timeoutMs: options.timeoutMs, ...execOpts });
    }
    if (env === 'host' && transport) {
      return transport.invoke<ExecResult>('system.exec', { cmd, options: execOpts });
    }
    return runMockExec(mockNamespace, cmd, execOpts, options.onMockExec);
  };

  const readFile = async (path: string): Promise<string | null> => {
    if (env === 'ksu') {
      return ksuReadFile(path);
    }
    if (env === 'host' && transport) {
      const res = await transport.invoke<{ content: string | null }>('fs.read', { path });
      return res?.content ?? null;
    }
    return mockReadFile(mockNamespace, path);
  };

  const writeFileAtomic = async (
    path: string,
    content: string,
    writeOpts?: WriteFileAtomicOptions,
  ): Promise<ExecResult> => {
    if (env === 'ksu') {
      return ksuWriteFileAtomic(path, content, writeOpts);
    }
    if (env === 'host' && transport) {
      return transport.invoke<ExecResult>('fs.writeAtomic', { path, content, options: writeOpts });
    }
    return mockWriteFile(mockNamespace, path, content);
  };

  const invoke = async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    if (env === 'host' && transport) {
      return transport.invoke<T>(method, params);
    }
    if (env === 'ksu') {
      if (options.onKsuRpc) {
        return (await options.onKsuRpc(method, params)) as T;
      }
      throw new Error(
        `JSON-RPC invoke("${method}") is not supported in KernelSU mode unless onKsuRpc is provided`,
      );
    }
    return runMockRpc(mockNamespace, method, params, options.onMockRpc) as Promise<T>;
  };

  const toast = (message: string): void => {
    if (env === 'ksu' && ksuToast(message)) {
      return;
    }
    if (env === 'host' && transport) {
      void transport.invoke('ui.toast', { message }).catch(() => { });
    }
  };

  const sendContainerAction = async (action: ContainerAction): Promise<void> => {
    if (env === 'host' && transport) {
      await transport.sendContainerAction(action);
      return;
    }
    if (env === 'browser' || env === 'mock') {
      dispatchMockContainerAction(action, options.onMockContainerAction);
    }
  };

  const onHostEvent = (event: string, listener: HostEventListener): (() => void) => {
    if (transport) {
      return transport.subscribe(event, listener);
    }
    return () => { };
  };

  const dispose = (): void => {
    transport?.dispose();
  };

  return {
    env,
    exec,
    readFile,
    writeFileAtomic,
    invoke,
    toast,
    sendContainerAction,
    onHostEvent,
    dispose,
  };
}

const BridgeContext = createContext<BridgeClient | null>(null);

export interface BridgeProviderProps {
  options?: BridgeOptions;
  client?: BridgeClient;
  children: ReactNode;
}

export function BridgeProvider({ options, client, children }: BridgeProviderProps) {
  const callbacksRef = useRef({
    onMockExec: options?.onMockExec,
    onMockRpc: options?.onMockRpc,
    onKsuRpc: options?.onKsuRpc,
    onMockContainerAction: options?.onMockContainerAction,
  });
  callbacksRef.current = {
    onMockExec: options?.onMockExec,
    onMockRpc: options?.onMockRpc,
    onKsuRpc: options?.onKsuRpc,
    onMockContainerAction: options?.onMockContainerAction,
  };

  const forceEnv = options?.forceEnv;
  const allowUrlOverride = options?.allowUrlOverride ?? options?.allowQueryOverride;
  const wsUrl = options?.wsUrl;
  const mockNamespace = options?.mockNamespace;
  const timeoutMs = options?.timeoutMs;
  const allowedOriginsKey = options?.allowedOrigins?.join('\u0000') ?? '';

  const bridge = useMemo(() => {
    if (client) return client;
    return createBridge({
      forceEnv,
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
    forceEnv,
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
