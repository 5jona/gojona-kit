import type {
  ContainerPresentationMode,
  NetworkTransportKind,
  PluginAppearanceSnapshot,
  PluginColorMode,
  ScopeChangedState,
} from './types.ts';

export type HapticKind = 'tick' | 'click' | 'heavy' | 'cancel';

export interface ContainerPresentationChangedPayload {
  mode: ContainerPresentationMode;
}

export interface ContainerClickThroughChangedPayload {
  clickThrough: boolean;
}

const VALID_PRESENTATION_MODES: ReadonlySet<string> = new Set<ContainerPresentationMode>([
  'drawer',
  'peek',
  'pinned',
  'wide',
  'native-hud',
]);

const VALID_TRANSPORTS = new Set<NetworkTransportKind>([
  'wifi',
  'cellular',
  'ethernet',
  'other',
  'none',
]);

/** Safely parses a `container.presentationChanged` host event payload. */
export function parsePresentationChangedEvent(payload: unknown): ContainerPresentationMode | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as Partial<ContainerPresentationChangedPayload>).mode;
  return typeof candidate === 'string' && VALID_PRESENTATION_MODES.has(candidate)
    ? (candidate as ContainerPresentationMode)
    : null;
}

/** Safely parses a `container.clickThroughChanged` host event payload. */
export function parseClickThroughChangedEvent(payload: unknown): boolean | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as Partial<ContainerClickThroughChangedPayload>).clickThrough;
  return typeof candidate === 'boolean' ? candidate : null;
}

/** Validates and extracts visibility boolean from a `panel.visibility` host event payload. */
export function parsePanelVisibilityEvent(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object') return null;
  const visible = (raw as { visible?: unknown }).visible;
  return typeof visible === 'boolean' ? visible : null;
}

/**
 * Validates and extracts scope transition fields from a `scope.changed` host event payload.
 * Reads canonical `active` with backward-compatible fallback to `scopeActive`.
 */
export function parseScopeChangedEvent(raw: unknown): ScopeChangedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as {
    foregroundPackage?: unknown;
    foregroundActivity?: unknown;
    active?: unknown;
    scopeActive?: unknown;
  };
  if (typeof record.foregroundPackage !== 'string') return null;
  const active =
    typeof record.active === 'boolean'
      ? record.active
      : typeof record.scopeActive === 'boolean'
        ? record.scopeActive
        : false;
  return {
    foregroundPackage: record.foregroundPackage,
    foregroundActivity:
      typeof record.foregroundActivity === 'string' ? record.foregroundActivity : '',
    active,
    scopeActive: active,
  };
}

/** Validates a `NetworkContextSnapshot` returned by `network.context` or `network.contextChanged`. */
export function parseNetworkContextSnapshot(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const transport = record.transport;
  if (typeof transport !== 'string' || !VALID_TRANSPORTS.has(transport as NetworkTransportKind)) {
    return null;
  }
  return {
    transport: transport as NetworkTransportKind,
    vpnActive: Boolean(record.vpnActive),
    validated: Boolean(record.validated),
    metered: Boolean(record.metered),
    ...(record.interfaceName !== undefined
      ? { interfaceName: typeof record.interfaceName === 'string' ? record.interfaceName : null }
      : {}),
    ...(record.ssid !== undefined
      ? { ssid: typeof record.ssid === 'string' ? record.ssid : null }
      : {}),
    ...(record.gateway !== undefined
      ? { gateway: typeof record.gateway === 'string' ? record.gateway : null }
      : {}),
    ...(record.localIpv4 !== undefined
      ? { localIpv4: typeof record.localIpv4 === 'string' ? record.localIpv4 : null }
      : {}),
  };
}

/** Extracts the dropped event count from a `plugin.eventLagged` scoped event payload. */
export function parsePluginEventLaggedPayload(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (!raw || typeof raw !== 'object') return null;
  const dropped = (raw as { dropped?: unknown }).dropped;
  if (typeof dropped === 'number' && Number.isFinite(dropped) && dropped >= 0) {
    return Math.floor(dropped);
  }
  return null;
}

/** Extracts `panel.themeId` and `panel.colorMode` from a raw SideVeil daemon config object. */
export function extractPluginAppearance(rawConfig: unknown): PluginAppearanceSnapshot {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { themeId: null, colorMode: null };
  }
  const panel = (rawConfig as { panel?: unknown }).panel;
  if (!panel || typeof panel !== 'object') {
    return { themeId: null, colorMode: null };
  }
  const p = panel as { themeId?: unknown; colorMode?: unknown };
  const themeId =
    typeof p.themeId === 'string' && p.themeId.trim().length > 0 ? p.themeId.trim() : null;
  const colorMode: PluginColorMode | null =
    p.colorMode === 'system' || p.colorMode === 'light' || p.colorMode === 'dark'
      ? p.colorMode
      : null;
  return { themeId, colorMode };
}

/** Pure helper computing whether periodic telemetry polling should stay active. */
export function shouldPollTelemetry(
  intervalMs: number,
  panelVisible: boolean,
  documentHidden: boolean,
): boolean {
  return intervalMs > 0 && panelVisible && !documentHidden;
}
