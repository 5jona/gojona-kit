import type {
  ContainerAction,
  ExecOptions,
  ExecResult,
  HostEventListener,
  MockExecHandler,
  MockRpcHandler,
} from './types.ts';

const customExecHandlers = new Map<string, MockExecHandler>();
const customRpcHandlers = new Map<string, MockRpcHandler>();

/**
 * Registers a reusable browser mock exec handler keyed by namespace.
 */
export function registerMockExec(namespace: string, handler: MockExecHandler): () => void {
  customExecHandlers.set(namespace, handler);
  return () => {
    if (customExecHandlers.get(namespace) === handler) {
      customExecHandlers.delete(namespace);
    }
  };
}

/**
 * Registers a reusable browser mock RPC handler keyed by namespace.
 */
export function registerMockRpc(namespace: string, handler: MockRpcHandler): () => void {
  customRpcHandlers.set(namespace, handler);
  return () => {
    if (customRpcHandlers.get(namespace) === handler) {
      customRpcHandlers.delete(namespace);
    }
  };
}

function getFileStorageKey(namespace: string, path: string): string {
  return `pochita:mockfs:${namespace}:${path}`;
}

export function mockReadFile(namespace: string, path: string): string | null {
  try {
    return window.localStorage.getItem(getFileStorageKey(namespace, path));
  } catch {
    return null;
  }
}

export function mockWriteFile(namespace: string, path: string, content: string): ExecResult {
  try {
    window.localStorage.setItem(getFileStorageKey(namespace, path), content);
    return { errno: 0, stdout: 'OK', stderr: '' };
  } catch (err) {
    return { errno: -1, stdout: '', stderr: String(err) };
  }
}

export async function runMockExec(
  namespace: string,
  cmd: string,
  options: ExecOptions | undefined,
  overrideHandler?: MockExecHandler,
): Promise<ExecResult> {
  if (overrideHandler) {
    return overrideHandler(cmd, options);
  }
  const registered = customExecHandlers.get(namespace);
  if (registered) {
    return registered(cmd, options);
  }
  return {
    errno: 0,
    stdout: `[mock:${namespace}] executed: ${cmd}`,
    stderr: '',
  };
}

export async function runMockRpc(
  namespace: string,
  method: string,
  params: unknown,
  overrideHandler?: MockRpcHandler,
): Promise<unknown> {
  if (overrideHandler) {
    return overrideHandler(method, params);
  }
  const registered = customRpcHandlers.get(namespace);
  if (registered) {
    return registered(method, params);
  }
  return {
    mocked: true,
    namespace,
    method,
    params: params ?? null,
    timestamp: Date.now(),
  };
}

export function dispatchMockContainerAction(
  action: ContainerAction,
  callback?: (action: ContainerAction) => void,
): void {
  callback?.(action);
}

/**
 * Standalone mock transport simulating the host bridge and daemon endpoints
 * for testing and isolated browser execution.
 */
export class MockTransport {
  private readonly listeners = new Map<string, Set<HostEventListener>>();
  private readonly storage = new Map<string, string>();
  private config: Record<string, unknown>;
  private status: Record<string, unknown>;

  constructor(options: {
    initialConfig?: Record<string, unknown>;
    initialStatus?: Record<string, unknown>;
  } = {}) {
    this.config = options.initialConfig ?? {
      version: 1,
      enabled: true,
      panel: {
        themeId: 'coloros-glass',
        colorMode: 'dark',
        blurRadiusPx: 160,
      },
    };
    this.status = options.initialStatus ?? {
      pid: 14820,
      uid: 1000,
      uptimeMs: 184_200,
      enabled: true,
      panelState: 'open',
    };
  }

  async invoke<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (method === 'daemon.ping') {
      return { pong: true, daemonUptimeMs: 184_200, timestampMs: Date.now() } as T;
    }
    if (method === 'daemon.status') {
      return { ...this.status } as T;
    }
    if (method === 'config.get') {
      return { ...this.config } as T;
    }
    if (method === 'config.patchAppearance') {
      const patch = (params ?? {}) as Record<string, unknown>;
      const existingPanel = (this.config.panel as Record<string, unknown>) ?? {};
      this.config = {
        ...this.config,
        panel: { ...existingPanel, ...patch },
      };
      return { ...this.config } as T;
    }
    return runMockRpc('default', method, params) as Promise<T>;
  }

  async readFile(path: string): Promise<string | null> {
    return this.storage.get(path) ?? null;
  }

  async writeFile(path: string, content: string): Promise<ExecResult> {
    this.storage.set(path, content);
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
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(payload);
    }
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

