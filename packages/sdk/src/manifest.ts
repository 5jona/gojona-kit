import {
  type ContainerBackdrop,
  type ContainerPresentationMode,
  SIDEVEIL_BUILTIN_DIAGNOSTIC,
  SIDEVEIL_TIMEOUT_BOUNDS,
} from '@gojona/bridge/core';
import type {
  PluginBackendKind,
  PluginBackendState,
  PluginCapability,
  PluginManifest,
  PluginRuntimeDescriptor,
} from './generated/sideveilPlugin.ts';

export {
  CAPABILITY_RISK_TIER_VALUES,
  type CapabilityRiskTier,
  PLUGIN_APPROVAL_STATUS_VALUES,
  PLUGIN_BACKEND_KIND_VALUES,
  PLUGIN_BACKEND_STATE_VALUES,
  PLUGIN_CAPABILITY_VALUES,
  PLUGIN_DAEMON_RESTART_POLICY_VALUES,
  PLUGIN_DAEMON_STATUS_VALUES,
  PLUGIN_ORIGIN_VALUES,
  PLUGIN_PRESENTATION_MODE_VALUES,
  PLUGIN_SURFACE_BACKDROP_VALUES,
  type PluginApprovalStatus,
  type PluginBackendKind,
  type PluginBackendState,
  type PluginCapability,
  type PluginDaemonRestartPolicy,
  type PluginDaemonSpec,
  type PluginDaemonStatus,
  type PluginEmbedPrefs,
  type PluginManifest,
  type PluginManifestEmbedPrefs,
  type PluginManifestNetworkPrefs,
  type PluginManifestSurfacePrefs,
  type PluginManifestTriggers,
  type PluginNetworkPrefs,
  type PluginOrigin,
  type PluginPresentationMode,
  type PluginRuntimeDescriptor,
  type PluginScopeOverride,
  type PluginSurfaceBackdrop,
  type PluginSurfacePrefs,
} from './generated/sideveilPlugin.ts';

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

export interface PluginTriggers {
  packages: string[];
  activities?: string[];
  global: boolean;
  priority: number;
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

/** Alias preserving backward compatibility with consumers importing `PluginDescriptor`. */
export type PluginDescriptor = PluginRuntimeDescriptor;

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
  grantedCapabilities?: PluginCapability[];
  daemonApproved?: boolean;
}

export interface PluginOverridesFile {
  overrides: Record<string, PluginOverrideEntry>;
  mruByPackage: Record<string, string>;
}

/**
 * Type-safe helper for defining a SideVeil plugin manifest with sensible defaults.
 */
export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  const backdrop: ContainerBackdrop = manifest.surface?.backdrop ?? 'native-glass';
  const presentation: ContainerPresentationMode = manifest.surface?.presentation ?? 'drawer';
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
      backdrop,
      presentation,
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
