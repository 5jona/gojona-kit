import {
  type ContainerBackdrop,
  type ContainerPresentationMode,
  type PluginBackendState,
  SIDEVEIL_BUILTIN_DIAGNOSTIC,
  SIDEVEIL_TIMEOUT_BOUNDS,
} from '@pochita/bridge';

export const BUILTIN_DIAG_PLUGIN_ID = SIDEVEIL_BUILTIN_DIAGNOSTIC.ID;

export const PLUGIN_EVENT_LAGGED_EVENT = SIDEVEIL_TIMEOUT_BOUNDS.PLUGIN_EVENT_LAGGED_SUBEVENT;
export const MIN_PLUGIN_INVOKE_TIMEOUT_MS = SIDEVEIL_TIMEOUT_BOUNDS.MIN_PLUGIN_INVOKE_MS;
export const DEFAULT_PLUGIN_INVOKE_TIMEOUT_MS = SIDEVEIL_TIMEOUT_BOUNDS.DEFAULT_PLUGIN_INVOKE_MS;
export const MAX_PLUGIN_INVOKE_TIMEOUT_MS = SIDEVEIL_TIMEOUT_BOUNDS.MAX_PLUGIN_INVOKE_MS;

/**
 * Resolves the canonical isolated WebView origin for a SideVeil plugin.
 */
export function resolvePluginOrigin(pluginId: string): string {
  return `https://${pluginId}.plugins.sideveil.local`;
}

export type PluginCapability =
  | 'storage'
  | 'toast'
  | 'system-exec'
  | 'native-hud'
  | 'clipboard'
  | 'haptics'
  | 'telemetry'
  | 'inter-plugin-bus'
  | 'network-loopback'
  | 'network-lan'
  | 'network-context';

export type PluginBackendKind = 'none' | 'uds-native' | 'uds-app';

export type PluginSurfaceBackdrop = ContainerBackdrop;
export type PluginPresentationMode = ContainerPresentationMode;

export interface PluginTriggers {
  packages: string[];
  activities?: string[];
  global: boolean;
  priority: number;
}

export interface PluginSurfacePrefs {
  backdrop: PluginSurfaceBackdrop;
  presentation?: PluginPresentationMode;
  crossOriginIsolated?: boolean;
  keepAlive?: boolean;
  widthDp?: number;
  heightPercent?: number;
}

export interface PluginEmbedPrefs {
  url: string;
  remoteUrl?: string;
  lanSsids?: string[];
  allowedOrigins?: string[];
  allowCleartext?: boolean;
  wideViewport?: boolean;
  allowZoom?: boolean;
  webHistoryBack?: boolean;
  textZoom?: number;
  showToolbar?: boolean;
  keepAliveGraceSec?: number;
}

export interface PluginNetworkPrefs {
  allowedOrigins?: string[];
  allowCleartext?: boolean;
  spaFallback?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  icon?: string;
  triggers?: Partial<PluginTriggers>;
  entry?: string;
  embed?: PluginEmbedPrefs;
  network?: PluginNetworkPrefs;
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
  entry?: string;
  embed?: PluginEmbedPrefs;
  network?: PluginNetworkPrefs;
  builtin: boolean;
  enabled: boolean;
  priority: number;
  packages: string[];
  activities?: string[];
  global: boolean;
  hasScopeOverride: boolean;
  devServerUrl?: string;
  backend: PluginBackendKind;
  backendState: PluginBackendState;
  capabilities: PluginCapability[];
  surface: PluginSurfacePrefs;
}

export interface PluginOverrideEntry {
  enabled?: boolean;
  priority?: number;
  packagesOverride?: string[];
  globalOverride?: boolean;
  devServerUrl?: string;
  embedUrl?: string;
  remoteUrl?: string;
  lanSsids?: string[];
  allowedOrigins?: string[];
  allowCleartext?: boolean;
  keepAlive?: boolean;
  wideViewport?: boolean;
  allowZoom?: boolean;
  webHistoryBack?: boolean;
  textZoom?: number;
  showToolbar?: boolean;
  keepAliveGraceSec?: number;
  widthDp?: number;
  heightPercent?: number;
}

export interface PluginOverridesFile {
  overrides: Record<string, PluginOverrideEntry>;
  mruByPackage: Record<string, string>;
}

/**
 * Type-safe helper for defining a SideVeil plugin manifest with sensible defaults.
 */
export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return {
    ...manifest,
    ...(manifest.embed !== undefined ? { embed: { ...manifest.embed } } : {}),
    ...(manifest.network !== undefined ? { network: { ...manifest.network } } : {}),
    backend: manifest.backend ?? 'none',
    capabilities: manifest.capabilities ?? [],
    triggers: {
      packages: manifest.triggers?.packages ?? [],
      ...(manifest.triggers?.activities !== undefined
        ? { activities: manifest.triggers.activities }
        : {}),
      global: manifest.triggers?.global ?? false,
      priority: manifest.triggers?.priority ?? 0,
    },
    surface: {
      backdrop: manifest.surface?.backdrop ?? 'native-glass',
      presentation: manifest.surface?.presentation ?? 'drawer',
      ...(manifest.surface?.crossOriginIsolated !== undefined
        ? { crossOriginIsolated: manifest.surface.crossOriginIsolated }
        : {}),
      ...(manifest.surface?.keepAlive !== undefined
        ? { keepAlive: manifest.surface.keepAlive }
        : {}),
      widthDp: manifest.surface?.widthDp,
      heightPercent: manifest.surface?.heightPercent,
    },
  };
}
