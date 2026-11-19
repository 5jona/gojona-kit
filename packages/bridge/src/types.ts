export type RuntimeEnv = 'host' | 'ksu' | 'mock' | 'browser';

export interface ExecResult {
  errno: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ContainerThemeSyncPayload {
  themeId: string;
  colorScheme: 'light' | 'dark';
  wantsNativeBlur: boolean;
  cornerRadiusPx: number;
}

export type ContainerAction =
  | { type: 'dismiss' }
  | { type: 'requestImeFocus'; focused: boolean }
  | { type: 'setPreferredSize'; widthDp: number; heightDp: number }
  | { type: 'syncTheme'; payload: ContainerThemeSyncPayload };

export interface RpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: unknown;
}

export interface RpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface HostEvent {
  event: string;
  payload?: unknown;
}

export type HostEventListener = (payload: unknown) => void;

export type MockExecHandler = (
  cmd: string,
  options?: ExecOptions,
) => ExecResult | Promise<ExecResult>;

export type MockRpcHandler = (
  method: string,
  params?: unknown,
) => unknown | Promise<unknown>;

export interface EmbeddedHostGlobal {
  postMessage?: (message: string) => void;
  wsUrl?: string;
  version?: string;
  pluginId?: string;
  getVersion?: () => string;
  getPluginId?: () => string;
}

export interface KsuHostGlobal {
  exec: (cmd: string, optionsJson: string, callbackName: string) => void;
  toast?: (message: string) => void;
}

export interface WriteFileAtomicOptions {
  /** Explicit octal file mode (e.g. '0644' or '0600'). Defaults to '0644'. */
  mode?: string;
  /** Explicit owner:group (e.g. '1000:1000'). */
  owner?: string;
  /** Preserve existing target file owner and mode when overwriting (defaults to true). */
  preserveMetadata?: boolean;
}

export interface BridgeOptions {
  /** Force a specific runtime environment (useful in preview sandboxes). */
  forceEnv?: RuntimeEnv;
  /** Allow `?env=host|ksu|mock|browser` query parameter override (defaults to DEV only when native globals are absent). */
  allowUrlOverride?: boolean;
  /** Legacy alias for allowUrlOverride */
  allowQueryOverride?: boolean;
  /** Allowed window.postMessage origins in embedded host mode (defaults to current window.location.origin). */
  allowedOrigins?: string[];
  /** Optional custom WebSocket endpoint when running in embedded host mode. */
  wsUrl?: string;
  /** Storage namespace prefix used by browser mock persistence. */
  mockNamespace?: string;
  /** Default timeout in milliseconds for exec and RPC requests. */
  timeoutMs?: number;
  /** Custom exec fallback handler in browser mock mode. */
  onMockExec?: MockExecHandler;
  /** Custom RPC fallback handler in browser mock mode. */
  onMockRpc?: MockRpcHandler;
  /** Optional custom RPC handler when `invoke()` is called in KernelSU mode. */
  onKsuRpc?: MockRpcHandler;
  /** Optional observer invoked whenever container actions occur in browser mock mode. */
  onMockContainerAction?: (action: ContainerAction) => void;
}

export interface BridgeClient {
  readonly env: RuntimeEnv;
  exec: (cmd: string, options?: ExecOptions) => Promise<ExecResult>;
  readFile: (path: string) => Promise<string | null>;
  writeFileAtomic: (
    path: string,
    content: string,
    options?: WriteFileAtomicOptions,
  ) => Promise<ExecResult>;
  invoke: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  toast: (message: string) => void;
  sendContainerAction: (action: ContainerAction) => Promise<void>;
  onHostEvent: (event: string, listener: HostEventListener) => () => void;
  dispose: () => void;
}

declare global {
  interface Window {
    ksu?: KsuHostGlobal;
    __POCHITA_HOST__?: EmbeddedHostGlobal;
  }
}
