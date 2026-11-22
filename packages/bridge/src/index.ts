export {
  BridgeProvider,
  type BridgeProviderProps,
  createDeferredBridgeDisposer,
  type DeferredBridgeDisposer,
  useBridge,
} from './BridgeProvider.tsx';
export { createBridge, PLUGIN_INVOKE_WIRE_TIMEOUT_MARGIN_MS } from './createBridge.ts';

export { type DetectRuntimeOptions, detectPluginId, detectRuntime } from './detect.ts';
export { BridgeRpcError, HostTransport, type HostTransportOptions } from './host.ts';
export { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic, shellQuote } from './ksu.ts';
export {
  MockTransport,
  type MockTransportOptions,
  registerMockExec,
  registerMockRpc,
} from './mock.ts';
export {
  type ContainerThemeSyncOptions,
  createThemeSyncDeduplicator,
  type ThemeSyncDeduplicator,
  useContainerThemeSync,
} from './themeSync.ts';
export {
  BridgeTracer,
  createTraceStore,
  DEFAULT_TRACE_BUFFER_SIZE,
  sanitizeTraceValue,
} from './trace.ts';
export {
  DEFAULT_TRACE_MAX_ARRAY_LENGTH,
  DEFAULT_TRACE_MAX_DEPTH,
  DEFAULT_TRACE_MAX_OBJECT_KEYS,
  DEFAULT_TRACE_MAX_STRING_LENGTH,
  type SanitizeTraceOptions,
  TRACE_REDACTED_VALUE,
} from './traceSanitize.ts';
export type {
  BridgeChannelKind,
  BridgeClient,
  BridgeDiagnosticsSnapshot,
  BridgeOptions,
  BridgeTraceEvent,
  BridgeTraceInput,
  BridgeTraceKind,
  BridgeTraceListener,
  BridgeTracePhase,
  BridgeTraceStatus,
  BridgeTraceStore,
  BridgeTraceStoreOptions,
  BridgeTraceTransport,
  ContainerAction,
  ContainerBackdrop,
  ContainerEdgeStatus,
  ContainerPinnedBounds,
  ContainerPresentationMode,
  ContainerThemeSyncPayload,
  DynamicThemePalettePayload,
  EmbeddedHostGlobal,
  ExecOptions,
  ExecResult,
  HostEvent,
  HostEventListener,
  InvokeOptions,
  KsuHostGlobal,
  MockExecHandler,
  MockRpcHandler,
  PluginBackendState,
  PluginBackendStatePayload,
  PluginScopedEventPayload,
  PochitaDebugHandle,
  RpcRequest,
  RpcResponse,
  RuntimeEnv,
  WriteFileAtomicOptions,
} from './types.ts';
