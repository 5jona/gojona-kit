import type {
  BridgeClient,
  BridgeOptions,
  ContainerAction,
  ContainerBackdrop,
  ContainerThemeSyncPayload,
  PluginBackendState,
} from '@pochita/bridge';

export const BUILTIN_DIAG_PLUGIN_ID = 'sideveil.diagnostic';

export type PluginCapability = 'storage' | 'toast' | 'system-exec';

export type PluginBackendKind = 'none' | 'uds-native' | 'uds-app';

export type PluginSurfaceBackdrop = ContainerBackdrop;

export interface PluginTriggers {
  packages: string[];
  global: boolean;
  priority: number;
}

export interface PluginSurfacePrefs {
  backdrop: PluginSurfaceBackdrop;
  widthDp?: number;
  heightPercent?: number;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  icon?: string;
  triggers?: Partial<PluginTriggers>;
  entry: string;
  backend?: PluginBackendKind;
  capabilities?: PluginCapability[];
  surface?: Partial<PluginSurfacePrefs>;
}

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  backend: PluginBackendKind;
  backendState: PluginBackendState;
  triggers: PluginTriggers;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  version: string;
  icon?: string;
  entry: string;
  builtin: boolean;
  enabled: boolean;
  priority: i32Number;
  packages: string[];
  global: boolean;
  hasScopeOverride: boolean;
  backend: PluginBackendKind;
  backendState: PluginBackendState;
  capabilities: PluginCapability[];
  surface: PluginSurfacePrefs;
}

type i32Number = number;

export interface PluginOverrideEntry {
  enabled?: boolean;
  priority?: number;
  packagesOverride?: string[];
  globalOverride?: boolean;
}

export interface PluginOverridesFile {
  overrides: Record<string, PluginOverrideEntry>;
  mruByPackage: Record<string, string>;
}

export interface PluginsSnapshotPayload {
  plugins: PluginDescriptor[];
  matchedPluginIds: string[];
  activePluginId: string | null;
  foregroundPackage: string;
}

export interface PluginActiveChangedPayload {
  pluginId: string;
  foregroundPackage: string;
  matchedPluginIds: string[];
}

export interface PluginBackendStatePayload {
  pluginId: string;
  state: PluginBackendState;
}

export interface PluginScopedEventPayload<T = unknown> {
  pluginId: string;
  event: string;
  payload?: T;
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
  syncTheme: (payload: ContainerThemeSyncPayload) => Promise<void>;
}

/**
 * Type-safe helper for defining a Sideveil plugin manifest with sensible defaults.
 */
export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return {
    ...manifest,
    backend: manifest.backend ?? 'none',
    capabilities: manifest.capabilities ?? [],
    triggers: {
      packages: manifest.triggers?.packages ?? [],
      global: manifest.triggers?.global ?? false,
      priority: manifest.triggers?.priority ?? 0,
    },
    surface: {
      backdrop: manifest.surface?.backdrop ?? 'native-glass',
      widthDp: manifest.surface?.widthDp,
      heightPercent: manifest.surface?.heightPercent,
    },
  };
}

export type {
  BridgeClient,
  BridgeOptions,
  ContainerAction,
  ContainerBackdrop,
  ContainerThemeSyncPayload,
  PluginBackendState,
};
