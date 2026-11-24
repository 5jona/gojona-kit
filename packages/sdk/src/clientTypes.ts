import type {
  BridgeClient,
  ContainerAction,
  ContainerBackdrop,
  ContainerEdgeStatus,
  ContainerPinnedBounds,
  ContainerPresentationMode,
  ContainerThemeSyncPayload,
  DynamicThemePalettePayload,
  ExecOptions,
  ExecResult,
  HostHandshakePayload,
  InvokeOptions,
  PluginBackendState,
  WriteFileAtomicOptions,
} from '@gojona/bridge/core';
import type { HapticKind } from './parsers.ts';
import type {
  CapabilityRiskTier,
  DaemonHealth,
  DaemonStatus,
  HostReadyPayload,
  HudDismissResult,
  NativeHudScene,
  NetworkContextSnapshot,
  PanelVisibilityPayload,
  PingResult,
  PluginAuditReport,
  PluginBusEventPayload,
  PluginCapability,
  PluginManifest,
  PluginsSnapshotPayload,
  ScopeChangedState,
  TelemetrySnapshot,
} from './types.ts';

export interface PluginGrantCapabilitiesParams {
  pluginId: string;
  capabilities?: PluginCapability[];
  grantAllPending?: boolean;
  revokeAll?: boolean;
  approveDaemon?: boolean;
}

export interface PluginInspectArchiveParams {
  path?: string;
  archiveBase64?: string;
  filename?: string;
}

export interface PluginCapabilityReviewItem {
  capability: PluginCapability;
  risk: CapabilityRiskTier;
  requiresApproval: boolean;
  isNew: boolean;
  alreadyGranted: boolean;
}

export interface PluginArchiveInspectionResult {
  manifest: PluginManifest;
  existingVersion?: string;
  isUpgrade: boolean;
  capabilities: PluginCapabilityReviewItem[];
  hasDaemon: boolean;
  daemonAlreadyApproved: boolean;
  warnings: string[];
}

export interface PluginInstallParams {
  sourceDir?: string;
  sourcePath?: string;
  archiveBase64?: string;
  filename?: string;
  grantedCapabilities?: PluginCapability[];
  approveDaemon?: boolean;
}

export interface PluginDaemonLogsResult {
  pluginId: string;
  lines: string[];
}

export interface SideVeilClient {
  readonly bridge: BridgeClient;
  getHandshake: () => HostHandshakePayload | null;
  waitForReady: (timeoutMs?: number) => Promise<HostHandshakePayload>;
  dispose: () => void;

  storage: {
    read: (path: string) => Promise<string | null>;
    writeAtomic: (
      path: string,
      content: string,
      options?: WriteFileAtomicOptions,
    ) => Promise<ExecResult>;
    readJson: <T = unknown>(path: string) => Promise<T | null>;
    writeJson: (
      path: string,
      value: unknown,
      options?: WriteFileAtomicOptions,
    ) => Promise<ExecResult>;
  };

  ui: {
    toast: (message: string) => Promise<void>;
  };

  clipboard: {
    get: () => Promise<string>;
    set: (text: string) => Promise<void>;
  };

  haptics: {
    trigger: (kind?: HapticKind) => Promise<void>;
  };

  telemetry: {
    snapshot: () => Promise<TelemetrySnapshot>;
  };

  system: {
    exec: (cmd: string, options?: ExecOptions) => Promise<ExecResult>;
  };

  network: {
    context: () => Promise<NetworkContextSnapshot>;
  };

  hud: {
    updateScene: (scene: NativeHudScene) => Promise<void>;
    dismiss: (pluginId?: string) => Promise<HudDismissResult>;
  };

  bus: {
    publish: <T = unknown>(topic: string, payload?: T) => Promise<void>;
    onMessage: <T = unknown>(
      topic: string,
      handler: (event: PluginBusEventPayload<T>) => void,
    ) => () => void;
  };

  backend: {
    invoke: <TResult = unknown, TParams = unknown>(
      method: string,
      params?: TParams,
      options?: InvokeOptions,
    ) => Promise<TResult>;
    onEvent: <T = unknown>(event: string, handler: (payload: T) => void) => () => void;
    onState: (handler: (state: PluginBackendState) => void) => () => void;
    onLagged: (handler: (dropped: number) => void) => () => void;
  };

  container: {
    action: (action: ContainerAction) => Promise<void>;
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
  };

  events: {
    onHostReady: (handler: (payload: HostReadyPayload) => void) => () => void;
    onThemePalette: (handler: (palette: DynamicThemePalettePayload) => void) => () => void;
    onPanelVisibility: (handler: (payload: PanelVisibilityPayload) => void) => () => void;
    onScopeChanged: (handler: (payload: ScopeChangedState) => void) => () => void;
    onNetworkContext: (handler: (snapshot: NetworkContextSnapshot) => void) => () => void;
    onAppearanceChanged: (handler: (payload: Record<string, unknown>) => void) => () => void;
    onBackPressed: (handler: () => void) => () => void;
  };

  daemon: {
    ping: () => Promise<PingResult>;
    status: () => Promise<DaemonStatus>;
    health: () => Promise<DaemonHealth>;
    logs: (params?: { sinceSeq?: number; limit?: number }) => Promise<unknown>;
    logsClear: () => Promise<unknown>;
    restartHost: () => Promise<unknown>;
  };

  config: {
    get: <T = Record<string, unknown>>() => Promise<T>;
    reload: <T = Record<string, unknown>>() => Promise<T>;
    patchAppearance: (patch: Record<string, unknown>) => Promise<unknown>;
    patchEdge: (patch: Record<string, unknown>) => Promise<unknown>;
  };

  plugins: {
    list: () => Promise<PluginsSnapshotPayload>;
    reload: () => Promise<unknown>;
    select: (pluginId: string, packageName?: string) => Promise<unknown>;
    setEnabled: (pluginId: string, enabled: boolean) => Promise<PluginsSnapshotPayload>;
    setPriority: (pluginId: string, priority: number) => Promise<PluginsSnapshotPayload>;
    setScopeOverride: (params: Record<string, unknown>) => Promise<PluginsSnapshotPayload>;
    setDevUrl: (params: {
      pluginId: string;
      devServerUrl?: string;
      clear?: boolean;
    }) => Promise<PluginsSnapshotPayload>;
    setEmbedConfig: (params: Record<string, unknown>) => Promise<PluginsSnapshotPayload>;
    createWebEmbed: (params: Record<string, unknown>) => Promise<unknown>;
    inspectArchive: (params: PluginInspectArchiveParams) => Promise<PluginArchiveInspectionResult>;
    install: (params: PluginInstallParams) => Promise<unknown>;
    uninstall: (pluginId: string) => Promise<unknown>;
    grantCapabilities: (params: PluginGrantCapabilitiesParams) => Promise<PluginsSnapshotPayload>;
    audit: () => Promise<PluginAuditReport>;
    daemonLogs: (pluginId: string, limit?: number) => Promise<PluginDaemonLogsResult>;
    reloadWebView: (pluginId: string) => Promise<{ ok: boolean }>;
  };

  panel: {
    open: (params?: Record<string, unknown>) => Promise<unknown>;
    close: () => Promise<unknown>;
    toggle: () => Promise<unknown>;
  };

  debug: {
    inspectUi: () => Promise<unknown>;
    cdpStatus: () => Promise<unknown>;
    setWebViewDebugging: (enabled: boolean) => Promise<unknown>;
    resetFrameMetrics: () => Promise<unknown>;
  };
}
