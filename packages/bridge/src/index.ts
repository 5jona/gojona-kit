export { BridgeProvider, createBridge, useBridge } from './createBridge.ts';

export { type DetectRuntimeOptions, detectPluginId, detectRuntime } from './detect.ts';
export { HostTransport } from './host.ts';
export { ksuExec, ksuReadFile, ksuToast, ksuWriteFileAtomic, shellQuote } from './ksu.ts';
export { MockTransport, registerMockExec, registerMockRpc } from './mock.ts';
export {
  type ContainerThemeSyncOptions,
  createThemeSyncDeduplicator,
  type ThemeSyncDeduplicator,
  useContainerThemeSync,
} from './themeSync.ts';
export type {
  BridgeClient,
  BridgeOptions,
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
  RpcRequest,
  RpcResponse,
  RuntimeEnv,
  WriteFileAtomicOptions,
} from './types.ts';
