import type {
  ContainerAction,
  ExecOptions,
  ExecResult,
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
  return () => customExecHandlers.delete(namespace);
}

/**
 * Registers a reusable browser mock RPC handler keyed by namespace.
 */
export function registerMockRpc(namespace: string, handler: MockRpcHandler): () => void {
  customRpcHandlers.set(namespace, handler);
  return () => customRpcHandlers.delete(namespace);
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
