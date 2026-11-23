import type {
  BridgeClient,
  BridgeOptions,
  ContainerAction,
  ContainerBackdrop,
  ContainerEdgeStatus,
  ContainerPinnedBounds,
  ContainerPresentationMode,
  ContainerThemeSyncPayload,
  DynamicThemePalettePayload,
  GlassTintOverride,
  InvokeOptions,
  PluginBackendState,
  PluginBackendStatePayload,
  PluginScopedEventPayload,
} from '@pochita/bridge';
import type { PluginDescriptor, PluginManifest } from './manifest.ts';

export type {
  HudBackdropKind,
  HudPrimitive,
  HudTextAlign,
  HudTextOverlay,
  NativeHudScene,
} from './hud.ts';
export {
  BUILTIN_DIAG_PLUGIN_ID,
  DEFAULT_PLUGIN_INVOKE_TIMEOUT_MS,
  definePluginManifest,
  MAX_PLUGIN_INVOKE_TIMEOUT_MS,
  MIN_PLUGIN_INVOKE_TIMEOUT_MS,
  PLUGIN_EVENT_LAGGED_EVENT,
  type PluginBackendKind,
  type PluginCapability,
  type PluginDescriptor,
  type PluginEmbedPrefs,
  type PluginManifest,
  type PluginNetworkPrefs,
  type PluginOverrideEntry,
  type PluginOverridesFile,
  type PluginPresentationMode,
  type PluginSummary,
  type PluginSurfaceBackdrop,
  type PluginSurfacePrefs,
  type PluginTriggers,
  resolvePluginOrigin,
} from './manifest.ts';

export type NetworkTransportKind = 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none';

export interface NetworkContextSnapshot {
  transport: NetworkTransportKind;
  vpnActive: boolean;
  validated: boolean;
  metered: boolean;
  interfaceName?: string | null;
  ssid?: string | null;
  gateway?: string | null;
  localIpv4?: string | null;
}

export interface PanelVisibilityState {
  visible: boolean;
  state?: string;
}

export interface ScopeChangedState {
  foregroundPackage: string;
  foregroundActivity: string;
  active: boolean;
  scopeActive: boolean;
}

export interface PluginsSnapshotPayload {
  plugins: PluginDescriptor[];
  matchedPluginIds: string[];
  activePluginId: string | null;
  foregroundPackage: string;
  foregroundActivity?: string;
}

export interface PluginAuditEntry {
  timestampMs: number;
  pluginId: string;
  action: string;
  allowed: boolean;
  detail: string;
}

export interface HostPluginDiagnosticsPayload {
  warmPluginIds: string[];
  activeHudPluginId?: string | null;
  hostNativeHeapKb?: number | null;
  hostPssKb?: number | null;
  webviewCrashCount?: number;
}

export interface PluginAuditReport {
  entries: PluginAuditEntry[];
  diagnostics: HostPluginDiagnosticsPayload;
}

export interface TelemetrySnapshot {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  socTempC: number | null;
  uptimeSec: number;
}

export interface PluginBusEventPayload<T = unknown> {
  fromPluginId: string;
  topic: string;
  payload?: T;
}

export interface GraphicsCapabilities {
  webgpu: boolean;
  webgpuAdapterReady: boolean;
  gpuAdapterInfo: string | null;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  webgl2: boolean;
  devicePixelRatio: number;
}

export interface PluginActiveChangedPayload {
  pluginId: string;
  foregroundPackage: string;
  matchedPluginIds: string[];
}

export interface PluginContextValue {
  pluginId: string;
  manifest?: PluginManifest;
  bridge: BridgeClient;
  backendState: PluginBackendState;
}

export interface PluginRpcState<TResult = unknown> {
  data: TResult | null;
  loading: boolean;
  error: Error | null;
}

export interface UsePluginStorageResult<T> {
  value: T | null;
  loading: boolean;
  error: Error | null;
  setValue: (value: T) => Promise<void>;
  reload: () => Promise<void>;
}

export interface UseContainerActionApi {
  dismiss: () => Promise<void>;
  requestImeFocus: (focused: boolean) => Promise<void>;
  setPreferredSize: (size: {
    widthDp?: number;
    heightDp?: number;
    heightPercent?: number;
  }) => Promise<void>;
  setBackIntercept: (enabled: boolean) => Promise<void>;
  setSurfaceBackdrop: (backdrop: ContainerBackdrop) => Promise<void>;
  setPresentationMode: (mode: ContainerPresentationMode) => Promise<void>;
  setPinnedBounds: (bounds: ContainerPinnedBounds) => Promise<void>;
  setEdgeStatus: (status: ContainerEdgeStatus | null) => Promise<void>;
  syncTheme: (payload: ContainerThemeSyncPayload) => Promise<void>;
}

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
  GlassTintOverride,
  InvokeOptions,
  PluginBackendState,
  PluginBackendStatePayload,
  PluginScopedEventPayload,
};
