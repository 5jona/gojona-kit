import { dispatchEventListeners } from './events.ts';
import {
  dispatchMockContainerAction,
  mockReadFile,
  mockWriteFile,
  registerMockExec,
  registerMockRpc,
  runMockExec,
  runMockRpc,
} from './mockRegistry.ts';
import { BridgeRpcError } from './rpcError.ts';
import { BridgeTracer } from './trace.ts';
import type {
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  BridgeTraceListener,
  BridgeTraceStore,
  ContainerAction,
  ExecOptions,
  ExecResult,
  HostEventListener,
  InvokeOptions,
  MockExecHandler,
  MockRpcHandler,
  MockTransportLike,
  RuntimeEnv,
} from './types.ts';

export {
  dispatchMockContainerAction,
  mockReadFile,
  mockWriteFile,
  registerMockExec,
  registerMockRpc,
  runMockExec,
  runMockRpc,
};

export interface MockTransportOptions {
  namespace?: string;
  handlers?: Record<string, (params?: unknown) => unknown | Promise<unknown>>;
  initialFiles?: Record<string, string>;
  persistToLocalStorage?: boolean;
  latencyMs?: number;
  timeoutMs?: number;
  onExec?: MockExecHandler;
  onRpc?: MockRpcHandler;
  onPluginInvoke?: MockRpcHandler;
  onContainerAction?: (action: ContainerAction) => void;
  onTrace?: BridgeTraceListener;
  traceBufferSize?: number;
  traceStore?: BridgeTraceStore;
}

/**
 * Standalone mock transport simulating the host bridge, filesystem, exec, and RPC endpoints
 * for testing and isolated browser preview execution.
 */
export class MockTransport implements MockTransportLike {
  private readonly namespace: string;
  private readonly persistToLocalStorage: boolean;
  private readonly latencyMs: number;
  private readonly defaultTimeoutMs?: number;
  private readonly onExec?: MockExecHandler;
  private readonly onRpc?: MockRpcHandler;
  private readonly onPluginInvoke?: MockRpcHandler;
  private readonly onContainerAction?: (action: ContainerAction) => void;
  private readonly tracer: BridgeTracer;
  private readonly listeners = new Map<string, Set<HostEventListener>>();
  private readonly storage = new Map<string, string>();
  private readonly handlers = new Map<string, (params?: unknown) => unknown | Promise<unknown>>();
  private readonly faults = new Map<string, Error>();
  private readonly pending = new Map<string, string>();
  private reqSeq = 0;
  private disposed = false;

  constructor(options: MockTransportOptions = {}) {
    this.namespace = options.namespace ?? 'default';
    this.persistToLocalStorage = options.persistToLocalStorage ?? false;
    this.latencyMs = Math.max(0, options.latencyMs ?? 0);
    this.defaultTimeoutMs = options.timeoutMs;
    this.onExec = options.onExec;
    this.onRpc = options.onRpc;
    this.onPluginInvoke = options.onPluginInvoke;
    this.onContainerAction = options.onContainerAction;
    this.tracer = new BridgeTracer(options.onTrace, options.traceBufferSize, options.traceStore);
    if (options.initialFiles) {
      for (const [filePath, content] of Object.entries(options.initialFiles)) {
        this.storage.set(filePath, content);
      }
    }
    if (options.handlers) {
      for (const [method, handler] of Object.entries(options.handlers)) {
        this.handlers.set(method, handler);
      }
    }
  }

  registerHandler(
    method: string,
    handler: (params?: unknown) => unknown | Promise<unknown>,
  ): () => void {
    this.handlers.set(method, handler);
    return () => {
      if (this.handlers.get(method) === handler) {
        this.handlers.delete(method);
      }
    };
  }

  /**
   * Injects a deterministic error for a given RPC method until cleared via `clearFaults()`.
   */
  injectError(method: string, error: Error | string): void {
    this.faults.set(method, typeof error === 'string' ? new Error(error) : error);
  }

  /**
   * Clears a specific injected method fault, or all injected faults when omitted.
   */
  clearFaults(method?: string): void {
    if (method !== undefined) {
      this.faults.delete(method);
    } else {
      this.faults.clear();
    }
  }

  async exec(cmd: string, options?: ExecOptions): Promise<ExecResult> {
    return runMockExec(this.namespace, cmd, options, this.onExec);
  }

  private async runWithTiming<T>(
    method: string,
    params: unknown,
    options: InvokeOptions | undefined,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (this.disposed) {
      throw new Error('MockTransport has been disposed');
    }
    const id = `mock_${Date.now()}_${++this.reqSeq}`;
    const startedAt = Date.now();
    const waitMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    this.pending.set(id, method);
    this.tracer.rpcStart('mock', id, method, startedAt, params);

    const run = async (): Promise<T> => {
      if (this.latencyMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
      }
      const injected = this.faults.get(method);
      if (injected) throw injected;
      return execute();
    };

    let timedOut = false;
    try {
      let result: T;
      if (waitMs !== undefined && waitMs > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        result = await Promise.race([
          run().finally(() => {
            if (timer !== undefined) clearTimeout(timer);
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error(`RPC "${method}" timed out after ${waitMs}ms`));
            }, waitMs);
          }),
        ]);
      } else {
        result = await run();
      }
      this.tracer.rpcOk('mock', id, method, startedAt, result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.tracer.rpcError('mock', id, method, startedAt, error.message, {
        timedOut,
        ...(error instanceof BridgeRpcError ? { code: error.code } : {}),
      });
      throw error;
    } finally {
      this.pending.delete(id);
    }
  }

  async invoke<T = unknown>(method: string, params?: unknown, options?: InvokeOptions): Promise<T> {
    return this.runWithTiming(method, params, options, async () => {
      const custom = this.handlers.get(method);
      if (custom) return (await custom(params)) as T;
      if (this.onRpc) return (await this.onRpc(method, params)) as T;
      if (method === 'ping' || method === 'daemon.ping') {
        return { pong: true, timestampMs: Date.now() } as T;
      }
      return (await runMockRpc(this.namespace, method, params)) as T;
    });
  }

  async invokePlugin<T = unknown>(
    method: string,
    params?: unknown,
    options?: InvokeOptions,
  ): Promise<T> {
    if (this.onPluginInvoke) {
      return this.runWithTiming(`plugin.invoke:${method}`, params, options, async () => {
        const directFault = this.faults.get(method);
        if (directFault) throw directFault;
        return (await this.onPluginInvoke?.(method, params)) as T;
      });
    }
    return this.invoke<T>(`plugin.invoke:${method}`, params, options);
  }

  sendContainerAction(action: ContainerAction): void {
    dispatchMockContainerAction(action, this.onContainerAction);
  }

  async readFile(path: string): Promise<string | null> {
    if (this.storage.has(path)) {
      return this.storage.get(path) ?? null;
    }
    if (this.persistToLocalStorage) {
      return mockReadFile(this.namespace, path);
    }
    return null;
  }

  async writeFile(path: string, content: string): Promise<ExecResult> {
    this.storage.set(path, content);
    if (this.persistToLocalStorage && typeof window !== 'undefined' && window.localStorage) {
      return mockWriteFile(this.namespace, path, content);
    }
    return { errno: 0, stdout: 'OK', stderr: '' };
  }

  subscribe(event: string, listener: HostEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event: string, payload?: unknown): void {
    this.tracer.eventIn('mock', event, payload);
    dispatchEventListeners(this.listeners, event, payload);
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  getDiagnostics(
    pluginId: string | null = null,
    env: RuntimeEnv = 'mock',
  ): BridgeDiagnosticsSnapshot {
    return {
      env,
      pluginId,
      channelKind: 'mock',
      pendingCount: this.pending.size,
      pendingMethods: Array.from(this.pending.values()),
      lastError: this.tracer.getLastError(),
      disposed: this.disposed,
      traceCount: this.tracer.getTraceCount(),
    };
  }

  getRecentTraces(limit?: number): BridgeTraceEvent[] {
    return this.tracer.getRecentTraces(limit);
  }

  getTraceStore(): BridgeTraceStore {
    return this.tracer.getStore();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.pending.clear();
  }
}
