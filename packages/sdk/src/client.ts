import {
  type BridgeClient,
  type BridgeOptions,
  createBridge,
  parseHostHandshake,
  SIDEVEIL_EVENTS,
  SIDEVEIL_METHODS,
} from '@gojona/bridge/core';
import type {
  PluginArchiveInspectionResult,
  PluginDaemonLogsResult,
  PluginGrantCapabilitiesParams,
  PluginInspectArchiveParams,
  PluginInstallParams,
  SideVeilClient,
} from './clientTypes.ts';
import { PLUGIN_EVENT_LAGGED_EVENT } from './manifest.ts';
import {
  type HapticKind,
  parseNetworkContextSnapshot,
  parsePanelVisibilityEvent,
  parsePluginEventLaggedPayload,
  parseScopeChangedEvent,
} from './parsers.ts';
import type {
  DaemonHealth,
  DaemonStatus,
  HudDismissResult,
  NativeHudScene,
  NetworkContextSnapshot,
  PanelVisibilityPayload,
  PingResult,
  PluginAuditReport,
  PluginBusEventPayload,
  PluginsSnapshotPayload,
  TelemetrySnapshot,
} from './types.ts';

function isBridgeClient(value: BridgeClient | BridgeOptions | undefined): value is BridgeClient {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'invoke' in value &&
      typeof value.invoke === 'function' &&
      'sendContainerAction' in value,
  );
}

/**
 * Creates a complete, framework-agnostic SideVeil client covering all sandbox and
 * control-plane JSON-RPC methods and host events with zero React or UI dependencies.
 */
export function createSideVeilClient(
  bridgeOrOptions?: BridgeClient | BridgeOptions,
): SideVeilClient {
  const ownsBridge = !isBridgeClient(bridgeOrOptions);
  const bridge = isBridgeClient(bridgeOrOptions) ? bridgeOrOptions : createBridge(bridgeOrOptions);

  return {
    bridge,
    getHandshake: () => bridge.getHostHandshake(),
    waitForReady: (timeoutMs?: number) => bridge.waitForHostReady(timeoutMs),
    dispose: () => {
      if (ownsBridge) bridge.dispose();
    },

    storage: {
      read: (path) => bridge.readFile(path.replace(/^\/+/, '')),
      writeAtomic: (path, content, options) =>
        bridge.writeFileAtomic(path.replace(/^\/+/, ''), content, options),
      readJson: async <T = unknown>(path: string): Promise<T | null> => {
        const raw = await bridge.readFile(path.replace(/^\/+/, ''));
        return raw === null ? null : (JSON.parse(raw) as T);
      },
      writeJson: (path, value, options) =>
        bridge.writeFileAtomic(path.replace(/^\/+/, ''), JSON.stringify(value, null, 2), options),
    },

    ui: {
      toast: async (message) => {
        if (bridge.env === 'host') {
          await bridge.invoke(SIDEVEIL_METHODS.UI_TOAST, { message });
          return;
        }
        bridge.toast(message);
      },
    },

    clipboard: {
      get: async () => {
        const res = await bridge.invoke<{ text?: unknown }>(SIDEVEIL_METHODS.CLIPBOARD_GET);
        return typeof res?.text === 'string' ? res.text : '';
      },
      set: async (text) => {
        await bridge.invoke(SIDEVEIL_METHODS.CLIPBOARD_SET, { text });
      },
    },

    haptics: {
      trigger: async (kind: HapticKind = 'tick') => {
        await bridge.invoke(SIDEVEIL_METHODS.HAPTICS_TRIGGER, { kind });
      },
    },

    telemetry: {
      snapshot: () => bridge.invoke<TelemetrySnapshot>(SIDEVEIL_METHODS.TELEMETRY_SNAPSHOT),
    },

    system: {
      exec: (cmd, options) => bridge.exec(cmd, options),
    },

    network: {
      context: () => bridge.invoke<NetworkContextSnapshot>(SIDEVEIL_METHODS.NETWORK_CONTEXT),
    },

    hud: {
      updateScene: async (scene: NativeHudScene) => {
        await bridge.invoke(SIDEVEIL_METHODS.HUD_UPDATE_SCENE, {
          ...scene,
          pluginId: scene.pluginId ?? bridge.pluginId ?? undefined,
        });
      },
      dismiss: (pluginId) =>
        bridge.invoke<HudDismissResult>(SIDEVEIL_METHODS.HUD_DISMISS, {
          pluginId: pluginId ?? bridge.pluginId ?? undefined,
        }),
    },

    bus: {
      publish: async (topic, payload) => {
        await bridge.invoke(SIDEVEIL_METHODS.PLUGIN_BUS_PUBLISH, { topic, payload });
      },
      onMessage: <T = unknown>(topic: string, handler: (event: PluginBusEventPayload<T>) => void) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.PLUGIN_BUS_MESSAGE, (raw) => {
          if (raw && typeof raw === 'object') {
            const msg = raw as PluginBusEventPayload<T>;
            if (msg.topic === topic) handler(msg);
          }
        }),
    },

    backend: {
      invoke: (method, params, options) => bridge.invokePlugin(method, params, options),
      onEvent: (event, handler) => bridge.onPluginEvent(event, handler),
      onState: (handler) => bridge.onPluginBackendState(handler),
      onLagged: (handler) =>
        bridge.onPluginEvent(PLUGIN_EVENT_LAGGED_EVENT, (raw) => {
          const dropped = parsePluginEventLaggedPayload(raw);
          if (dropped !== null) handler(dropped);
        }),
    },

    container: {
      action: (action) => bridge.sendContainerAction(action),
      dismiss: () => bridge.sendContainerAction({ type: 'dismiss' }),
      requestImeFocus: (focused) =>
        bridge.sendContainerAction({ type: 'requestImeFocus', focused }),
      setPreferredSize: (size) => bridge.sendContainerAction({ type: 'setPreferredSize', ...size }),
      setBackIntercept: (enabled) =>
        bridge.sendContainerAction({ type: 'setBackIntercept', enabled }),
      setSurfaceBackdrop: (backdrop) =>
        bridge.sendContainerAction({ type: 'setSurfaceBackdrop', backdrop }),
      setPresentationMode: (mode) =>
        bridge.sendContainerAction({ type: 'setPresentationMode', mode }),
      setPinnedBounds: (bounds) =>
        bridge.sendContainerAction({ type: 'setPinnedBounds', ...bounds }),
      setEdgeStatus: (status) => bridge.sendContainerAction({ type: 'setEdgeStatus', status }),
      syncTheme: (payload) => bridge.sendContainerAction({ type: 'syncTheme', payload }),
    },

    events: {
      onHostReady: (handler) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.HOST_READY, (raw) => {
          const parsed = parseHostHandshake(raw);
          if (parsed) handler(parsed);
        }),
      onThemePalette: (handler) => bridge.onThemePalette(handler),
      onPanelVisibility: (handler) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.PANEL_VISIBILITY, (raw) => {
          const visible = parsePanelVisibilityEvent(raw);
          if (visible !== null) {
            const state = (raw as Partial<PanelVisibilityPayload>).state ?? 'closed';
            handler({ visible, state });
          }
        }),
      onScopeChanged: (handler) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.SCOPE_CHANGED, (raw) => {
          const parsed = parseScopeChangedEvent(raw);
          if (parsed) handler(parsed);
        }),
      onNetworkContext: (handler) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.NETWORK_CONTEXT_CHANGED, (raw) => {
          const parsed = parseNetworkContextSnapshot(raw);
          if (parsed) handler(parsed);
        }),
      onAppearanceChanged: (handler) =>
        bridge.onHostEvent(SIDEVEIL_EVENTS.APPEARANCE_CHANGED, (raw) => {
          if (raw && typeof raw === 'object') handler(raw as Record<string, unknown>);
        }),
      onBackPressed: (handler) => bridge.onBackPressed(handler),
    },

    daemon: {
      ping: () => bridge.invoke<PingResult>(SIDEVEIL_METHODS.DAEMON_PING),
      status: () => bridge.invoke<DaemonStatus>(SIDEVEIL_METHODS.DAEMON_STATUS),
      health: () => bridge.invoke<DaemonHealth>(SIDEVEIL_METHODS.DAEMON_HEALTH),
      logs: (params) => bridge.invoke(SIDEVEIL_METHODS.DAEMON_LOGS, params),
      logsClear: () => bridge.invoke(SIDEVEIL_METHODS.DAEMON_LOGS_CLEAR),
      restartHost: () => bridge.invoke(SIDEVEIL_METHODS.HOST_RESTART),
    },

    config: {
      get: <T = Record<string, unknown>>() => bridge.invoke<T>(SIDEVEIL_METHODS.CONFIG_GET),
      reload: <T = Record<string, unknown>>() => bridge.invoke<T>(SIDEVEIL_METHODS.CONFIG_RELOAD),
      patchAppearance: (patch) => bridge.invoke(SIDEVEIL_METHODS.CONFIG_PATCH_APPEARANCE, patch),
      patchEdge: (patch) => bridge.invoke(SIDEVEIL_METHODS.CONFIG_PATCH_EDGE, patch),
    },

    plugins: {
      list: () => bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_LIST),
      reload: () => bridge.invoke(SIDEVEIL_METHODS.PLUGINS_RELOAD),
      select: (pluginId, packageName) =>
        bridge.invoke(SIDEVEIL_METHODS.PLUGINS_SELECT, { pluginId, packageName }),
      setEnabled: (pluginId, enabled) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_SET_ENABLED, {
          pluginId,
          enabled,
        }),
      setPriority: (pluginId, priority) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_SET_PRIORITY, {
          pluginId,
          priority,
        }),
      setScopeOverride: (params) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_SET_SCOPE_OVERRIDE, params),
      setDevUrl: (params) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_SET_DEV_URL, params),
      setEmbedConfig: (params) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_SET_EMBED_CONFIG, params),
      createWebEmbed: (params) => bridge.invoke(SIDEVEIL_METHODS.PLUGINS_CREATE_WEB_EMBED, params),
      inspectArchive: (params: PluginInspectArchiveParams) =>
        bridge.invoke<PluginArchiveInspectionResult>(
          SIDEVEIL_METHODS.PLUGINS_INSPECT_ARCHIVE,
          params,
        ),
      install: (params: PluginInstallParams) =>
        bridge.invoke(SIDEVEIL_METHODS.PLUGINS_INSTALL, params),
      uninstall: (pluginId) => bridge.invoke(SIDEVEIL_METHODS.PLUGINS_UNINSTALL, { pluginId }),
      grantCapabilities: (params: PluginGrantCapabilitiesParams) =>
        bridge.invoke<PluginsSnapshotPayload>(SIDEVEIL_METHODS.PLUGINS_GRANT_CAPABILITIES, params),
      audit: () => bridge.invoke<PluginAuditReport>(SIDEVEIL_METHODS.PLUGINS_AUDIT),
      daemonLogs: (pluginId, limit) =>
        bridge.invoke<PluginDaemonLogsResult>(SIDEVEIL_METHODS.PLUGINS_DAEMON_LOGS, {
          pluginId,
          ...(limit !== undefined ? { limit } : {}),
        }),
      reloadWebView: (pluginId) =>
        bridge.invoke<{ ok: boolean }>(SIDEVEIL_METHODS.PLUGINS_RELOAD_WEBVIEW, { pluginId }),
    },

    panel: {
      open: (params) => bridge.invoke(SIDEVEIL_METHODS.PANEL_OPEN, params),
      close: () => bridge.invoke(SIDEVEIL_METHODS.PANEL_CLOSE),
      toggle: () => bridge.invoke(SIDEVEIL_METHODS.PANEL_TOGGLE),
    },

    debug: {
      inspectUi: () => bridge.invoke(SIDEVEIL_METHODS.DEBUG_INSPECT_UI),
      cdpStatus: () => bridge.invoke(SIDEVEIL_METHODS.DEBUG_CDP_STATUS),
      setWebViewDebugging: (enabled) =>
        bridge.invoke(SIDEVEIL_METHODS.DEBUG_SET_WEBVIEW_DEBUGGING, { enabled }),
      resetFrameMetrics: () => bridge.invoke(SIDEVEIL_METHODS.DEBUG_RESET_FRAME_METRICS),
    },
  };
}
