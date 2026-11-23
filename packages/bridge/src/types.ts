export type {
  BridgeTraceEvent,
  BridgeTraceInput,
  BridgeTraceKind,
  BridgeTraceListener,
  BridgeTracePhase,
  BridgeTraceStatus,
  BridgeTraceStore,
  BridgeTraceStoreOptions,
  BridgeTraceTransport,
} from './traceTypes.ts';

import type { BridgeTraceEvent, BridgeTraceListener, BridgeTraceStore } from './traceTypes.ts';

export type RuntimeEnv = 'host' | 'ksu' | 'mock' | 'browser';
export type BridgeChannelKind = 'port' | 'js-interface' | 'ws' | 'ksu' | 'mock';
export type PluginBackendState = 'none' | 'online' | 'offline';
export type ContainerBackdrop = 'native-glass' | 'transparent' | 'opaque';
export type ContainerPresentationMode = 'drawer' | 'peek' | 'pinned' | 'wide' | 'native-hud';

export interface BridgeDiagnosticsSnapshot {
  env: RuntimeEnv;
  pluginId: string | null;
  channelKind: BridgeChannelKind;
  pendingCount: number;
  pendingMethods: string[];
  lastError: string | null;
  disposed: boolean;
  traceCount: number;
}

export interface PochitaDebugHandle {
  readonly getDiagnostics: () => BridgeDiagnosticsSnapshot;
  readonly getRecentTraces: (limit?: number) => BridgeTraceEvent[];
  readonly inspectThemeTokens: () => Record<string, unknown>;
  readonly emitHostEvent?: (event: string, payload?: unknown) => void;
}

export interface ContainerPinnedBounds {
  widthDp?: number;
  heightDp?: number;
  xPercent?: number;
  yPercent?: number;
  clickThrough?: boolean;
}

export interface ContainerEdgeStatus {
  badgeText?: string;
  accentColor?: string;
  pulse?: boolean;
  progress?: number;
  clear?: boolean;
}

export interface GlassTintOverride {
  tintTopArgb: number;
  tintBottomArgb: number;
  rimArgb: number;
  accentArgb: number;
  fallbackFillArgb: number;
  fallbackStrokeArgb: number;
}

export interface DynamicThemePalettePayload {
  themeId: string;
  isDark: boolean;
  seedArgb: number;
  lumaHint: number;
  glass?: GlassTintOverride;
  cssTokens: Record<string, string>;
}

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

export interface InvokeOptions {
  /** Optional per-call timeout in milliseconds overriding the transport default. */
  timeoutMs?: number;
}

export interface ContainerThemeSyncPayload {
  themeId: string;
  colorScheme: 'light' | 'dark';
  /**
   * Advisory hint indicating whether the web container requests native background blur.
   * Standalone embedded hosts may adjust their window backdrop blur accordingly,
   * whereas daemon-authoritative hosts may omit or ignore this hint.
   */
  wantsNativeBlur?: boolean;
  /**
   * Advisory hint specifying the preferred container corner radius in pixels.
   * Standalone embedded hosts may round native window/container corners,
   * whereas daemon-authoritative hosts may omit or ignore this hint.
   */
  cornerRadiusPx?: number;
}

export type ContainerAction =
  | { type: 'dismiss' }
  | { type: 'requestImeFocus'; focused: boolean }
  | {
      type: 'setPreferredSize';
      widthDp?: number;
      heightDp?: number;
      heightPercent?: number;
    }
  | { type: 'syncTheme'; payload: ContainerThemeSyncPayload }
  | { type: 'setBackIntercept'; enabled: boolean }
  | { type: 'setSurfaceBackdrop'; backdrop: ContainerBackdrop }
  | { type: 'setPresentationMode'; mode: ContainerPresentationMode }
  | ({ type: 'setPinnedBounds' } & ContainerPinnedBounds)
  | { type: 'setEdgeStatus'; status: ContainerEdgeStatus | null };

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

export type MockRpcHandler = (method: string, params?: unknown) => unknown | Promise<unknown>;

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

export interface PluginScopedEventPayload<T = unknown> {
  pluginId: string;
  event: string;
  payload?: T;
}

export interface PluginBackendStatePayload {
  pluginId: string;
  state: PluginBackendState;
}

/**
 * Structural contract for a shared `MockTransport` instance passed to `BridgeOptions.mockTransport`.
 */
export interface MockTransportLike {
  getTraceStore: () => BridgeTraceStore;
  exec: (cmd: string, options?: ExecOptions) => Promise<ExecResult>;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string) => Promise<ExecResult>;
  invoke: <T = unknown>(method: string, params?: unknown, options?: InvokeOptions) => Promise<T>;
  invokePlugin: <T = unknown>(
    method: string,
    params?: unknown,
    options?: InvokeOptions,
  ) => Promise<T>;
  sendContainerAction: (action: ContainerAction) => void;
  subscribe: (event: string, listener: HostEventListener) => () => void;
  emit: (event: string, payload?: unknown) => void;
  getDiagnostics: (pluginId?: string | null, env?: RuntimeEnv) => BridgeDiagnosticsSnapshot;
  dispose: () => void;
}

export interface BridgeOptions {
  /** Explicit plugin ID when running inside a plugin sandbox. */
  pluginId?: string;
  /** Force a specific runtime environment (useful in preview sandboxes). */
  forceEnv?: RuntimeEnv;
  /** Optional shared MockTransport instance used when running in `mock` or `browser` mode. */
  mockTransport?: MockTransportLike;
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
  /** Custom handler for plugin.invoke in browser mock mode. */
  onMockPluginInvoke?: (method: string, params?: unknown) => unknown | Promise<unknown>;
  /** Optional custom RPC handler when `invoke()` is called in KernelSU mode. */
  onKsuRpc?: MockRpcHandler;
  /** Optional observer invoked whenever container actions occur in browser mock mode. */
  onMockContainerAction?: (action: ContainerAction) => void;
  /** Optional observer invoked for bridge RPC, event, and port lifecycle trace events. */
  onTrace?: BridgeTraceListener;
  /** Optional ring-buffer capacity for structured bridge traces (defaults to 200). */
  traceBufferSize?: number;
  /** Optional external trace store so UI inspectors can subscribe live across bridge calls. */
  traceStore?: BridgeTraceStore;
}

export interface BridgeClient {
  readonly env: RuntimeEnv;
  readonly pluginId: string | null;
  exec: (cmd: string, options?: ExecOptions) => Promise<ExecResult>;
  readFile: (path: string) => Promise<string | null>;
  writeFileAtomic: (
    path: string,
    content: string,
    options?: WriteFileAtomicOptions,
  ) => Promise<ExecResult>;
  invoke: <T = unknown>(method: string, params?: unknown, options?: InvokeOptions) => Promise<T>;
  invokePlugin: <T = unknown>(
    method: string,
    params?: unknown,
    options?: InvokeOptions,
  ) => Promise<T>;
  toast: (message: string) => void;
  sendContainerAction: (action: ContainerAction) => Promise<void>;
  onHostEvent: (event: string, listener: HostEventListener) => () => void;
  onPluginEvent: <T = unknown>(event: string, listener: (payload: T) => void) => () => void;
  onPluginBackendState: (listener: (state: PluginBackendState) => void) => () => void;
  onBackPressed: (listener: () => void) => () => void;
  onThemePalette: (listener: (palette: DynamicThemePalettePayload) => void) => () => void;
  getDiagnostics: () => BridgeDiagnosticsSnapshot;
  getTraceEntries: (limit?: number) => BridgeTraceEvent[];
  clearTraceEntries: () => void;
  subscribeTrace: (listener: BridgeTraceListener) => () => void;
  dispose: () => void;
}

declare global {
  interface Window {
    ksu?: KsuHostGlobal;
    __POCHITA_HOST__?: EmbeddedHostGlobal;
    __POCHITA_DEBUG__?: PochitaDebugHandle;
  }
}
