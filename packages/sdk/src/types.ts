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
    PluginBackendState,
} from '@pochita/bridge';

export const BUILTIN_DIAG_PLUGIN_ID = 'sideveil.diagnostic';

export type PluginCapability = 'storage' | 'toast' | 'system-exec' | 'native-hud';

export type PluginBackendKind = 'none' | 'uds-native' | 'uds-app';

export type PluginSurfaceBackdrop = ContainerBackdrop;
export type PluginPresentationMode = ContainerPresentationMode;
export type HudBackdropKind = ContainerBackdrop;
export type HudTextAlign = 'start' | 'center' | 'end';

export type HudPrimitive =
    | {
        kind: 'roundedPill';
        x: number;
        y: number;
        w: number;
        h: number;
        radius?: number;
        fillArgb: number;
        strokeArgb?: number;
        strokeWidth?: number;
    }
    | {
        kind: 'progressBar';
        x: number;
        y: number;
        w: number;
        h: number;
        radius?: number;
        value: number;
        trackArgb: number;
        fillStartArgb: number;
        fillEndArgb?: number;
    }
    | {
        kind: 'sparkline';
        x: number;
        y: number;
        w: number;
        h: number;
        values: number[];
        min?: number;
        max?: number;
        strokeArgb: number;
        strokeWidth?: number;
        fillTopArgb?: number;
        fillBottomArgb?: number;
        smooth?: boolean;
    }
    | {
        kind: 'radialGauge';
        cx: number;
        cy: number;
        radius: number;
        thickness: number;
        value: number;
        startAngleDeg?: number;
        sweepAngleDeg?: number;
        trackArgb: number;
        fillStartArgb: number;
        fillEndArgb?: number;
    }
    | {
        kind: 'crosshair';
        cx: number;
        cy: number;
        size: number;
        gap?: number;
        thickness?: number;
        colorArgb: number;
        outlineArgb?: number;
    }
    | {
        kind: 'path';
        d: string;
        fillArgb?: number;
        strokeArgb?: number;
        strokeWidth?: number;
    };

export interface HudTextOverlay {
    x: number;
    y: number;
    text: string;
    sizeSp?: number;
    colorArgb: number;
    align?: HudTextAlign;
    bold?: boolean;
    tabularNums?: boolean;
    maxWidthDp?: number;
}

export interface NativeHudScene {
    pluginId?: string;
    widthDp: number;
    heightDp: number;
    cornerRadiusDp?: number;
    backdrop?: HudBackdropKind;
    clickThrough?: boolean;
    anchorXPercent?: number;
    anchorYPercent?: number;
    primitives: HudPrimitive[];
    texts?: HudTextOverlay[];
}

export interface PluginTriggers {
    packages: string[];
    global: boolean;
    priority: number;
}

export interface PluginSurfacePrefs {
    backdrop: PluginSurfaceBackdrop;
    presentation?: PluginPresentationMode;
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
    setPresentationMode: (mode: ContainerPresentationMode) => Promise<void>;
    setPinnedBounds: (bounds: ContainerPinnedBounds) => Promise<void>;
    setEdgeStatus: (status: ContainerEdgeStatus | null) => Promise<void>;
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
            presentation: manifest.surface?.presentation ?? 'drawer',
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
    ContainerEdgeStatus,
    ContainerPinnedBounds,
    ContainerPresentationMode,
    ContainerThemeSyncPayload,
    DynamicThemePalettePayload,
    PluginBackendState,
};
