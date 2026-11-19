import { createContext, createElement, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { detectRuntime } from './detect.ts';
import { HostTransport } from './host.ts';
import { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic, shellQuote } from './ksu.ts';
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
} from './types.ts';

/**
 * Creates a runtime-aware bridge client supporting embedded WebView hosts,
 * KernelSU WebUI, and browser mock preview modes behind a single interface.
 */
export function createBridge(options: BridgeOptions = {}): BridgeClient {
  const env = options.forceEnv ?? detectRuntime();
  const mockNamespace = options.mockNamespace ?? 'default';
  const transport =
    env === 'host'
      ? new HostTransport({ wsUrl: options.wsUrl, timeoutMs: options.timeoutMs })
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
      try {
        const res = await transport.invoke<{ content: string | null }>('fs.read', { path });
        return res.content;
      } catch {
        return null;
      }
    }
    return mockReadFile(mockNamespace, path);
  };

  const writeFileAtomic = async (path: string, content: string): Promise<ExecResult> => {
    if (env === 'ksu') {
      return ksuWriteFileAtomic(path, content);
    }
    if (env === 'host' && transport) {
      return transport.invoke<ExecResult>('fs.writeAtomic', { path, content });
    }
    return mockWriteFile(mockNamespace, path, content);
  };

  const invoke = async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    if (env === 'host' && transport) {
      return transport.invoke<T>(method, params);
    }
    if (env === 'ksu') {
      const res = await ksuExec(
        `echo ${shellQuote(JSON.stringify({ method, params: params ?? null }))}`,
      );
      return res as unknown as T;
    }
    return runMockRpc(mockNamespace, method, params, options.onMockRpc) as Promise<T>;
  };

  const toast = (message: string): void => {
    if (env === 'ksu' && ksuToast(message)) {
      return;
    }
    if (env === 'host' && transport) {
      void transport.invoke('ui.toast', { message }).catch(() => {});
    }
  };

  const sendContainerAction = async (action: ContainerAction): Promise<void> => {
    if (env === 'host' && transport) {
      await transport.sendContainerAction(action);
      return;
    }
    if (env === 'browser') {
      dispatchMockContainerAction(action, options.onMockContainerAction);
    }
  };

  const onHostEvent = (event: string, listener: HostEventListener): (() => void) => {
    if (transport) {
      return transport.subscribe(event, listener);
    }
    return () => {};
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
  const bridge = useMemo(() => client ?? createBridge(options), [client, options]);

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
