import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBridge, MockTransport } from '@pochita/bridge';
import React from 'react';
import {
  BridgeRpcError,
  BUILTIN_DIAG_PLUGIN_ID,
  createEdgeStatusController,
  DEFAULT_PLUGIN_INVOKE_TIMEOUT_MS,
  definePluginManifest,
  extractPluginAppearance,
  MAX_PLUGIN_INVOKE_TIMEOUT_MS,
  MIN_PLUGIN_INVOKE_TIMEOUT_MS,
  PLUGIN_EVENT_LAGGED_EVENT,
  parseClickThroughChangedEvent,
  parseNetworkContextSnapshot,
  parsePanelVisibilityEvent,
  parsePluginEventLaggedPayload,
  parsePresentationChangedEvent,
  parseScopeChangedEvent,
  resolvePluginOrigin,
  shouldPollTelemetry,
  useDynamicThemeState,
  useNetworkContext,
  usePanelVisibility,
  usePluginEventLagged,
  useScopeChanged,
} from '../src/index.ts';

test('BUILTIN_DIAG_PLUGIN_ID is canonical', () => {
  assert.equal(BUILTIN_DIAG_PLUGIN_ID, 'sideveil.diagnostic');
});

test('definePluginManifest fills default fields gracefully', () => {
  const manifest = definePluginManifest({
    id: 'com.example.sample',
    name: 'Sample Plugin',
    version: '1.2.0',
    entry: 'index.html',
  });

  assert.equal(manifest.id, 'com.example.sample');
  assert.equal(manifest.name, 'Sample Plugin');
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.backend, 'none');
  assert.deepEqual(manifest.capabilities, []);
  assert.deepEqual(manifest.triggers, {
    packages: [],
    global: false,
    priority: 0,
  });
  assert.deepEqual(manifest.surface, {
    backdrop: 'native-glass',
    presentation: 'drawer',
    widthDp: undefined,
    heightPercent: undefined,
  });
});

test('definePluginManifest preserves explicit properties', () => {
  const manifest = definePluginManifest({
    id: 'com.example.tweak',
    name: 'Tweak Engine',
    version: '2.0.0',
    entry: 'dist/index.html',
    backend: 'uds-native',
    capabilities: ['storage', 'toast', 'system-exec', 'native-hud'],
    triggers: {
      packages: ['com.android.settings'],
      activities: ['com.android.settings/.Settings'],
      global: false,
      priority: 50,
    },
    surface: {
      backdrop: 'opaque',
      presentation: 'pinned',
      crossOriginIsolated: true,
      widthDp: 400,
      heightPercent: 85,
    },
  });

  assert.equal(manifest.backend, 'uds-native');
  assert.deepEqual(manifest.capabilities, ['storage', 'toast', 'system-exec', 'native-hud']);
  assert.equal(manifest.triggers?.priority, 50);
  assert.deepEqual(manifest.triggers?.packages, ['com.android.settings']);
  assert.deepEqual(manifest.triggers?.activities, ['com.android.settings/.Settings']);
  assert.equal(manifest.surface?.backdrop, 'opaque');
  assert.equal(manifest.surface?.presentation, 'pinned');
  assert.equal(manifest.surface?.crossOriginIsolated, true);
  assert.equal(manifest.surface?.widthDp, 400);
  assert.equal(manifest.surface?.heightPercent, 85);
});

test('parsePresentationChangedEvent validates known presentation modes', () => {
  assert.equal(parsePresentationChangedEvent({ mode: 'pinned' }), 'pinned');
  assert.equal(parsePresentationChangedEvent({ mode: 'drawer' }), 'drawer');
  assert.equal(parsePresentationChangedEvent({ mode: 'native-hud' }), 'native-hud');
  assert.equal(parsePresentationChangedEvent({ mode: 'unknown' }), null);
  assert.equal(parsePresentationChangedEvent(null), null);
  assert.equal(parsePresentationChangedEvent({}), null);
});

test('parseClickThroughChangedEvent validates boolean clickThrough payloads', () => {
  assert.equal(parseClickThroughChangedEvent({ clickThrough: true }), true);
  assert.equal(parseClickThroughChangedEvent({ clickThrough: false }), false);
  assert.equal(parseClickThroughChangedEvent({ clickThrough: 'true' }), null);
  assert.equal(parseClickThroughChangedEvent(undefined), null);
});

test('extractPluginAppearance parses valid panel themeId and colorMode safely', () => {
  assert.deepEqual(
    extractPluginAppearance({ panel: { themeId: 'coloros-glass', colorMode: 'dark' } }),
    { themeId: 'coloros-glass', colorMode: 'dark' },
  );
  assert.deepEqual(
    extractPluginAppearance({ panel: { themeId: '  modern-saas-dark  ', colorMode: 'invalid' } }),
    { themeId: 'modern-saas-dark', colorMode: null },
  );
  assert.deepEqual(extractPluginAppearance(null), { themeId: null, colorMode: null });
  assert.deepEqual(extractPluginAppearance({}), { themeId: null, colorMode: null });
});

test('createEdgeStatusController only clears edge status on unmount if this instance set an active status', async () => {
  const sent = [];
  const bridge = {
    sendContainerAction: async (action) => {
      sent.push(action);
    },
  };

  // Unmount without ever setting status must NOT wipe another component's status
  const idleController = createEdgeStatusController(bridge);
  idleController.cleanupOnUnmount();
  assert.equal(sent.length, 0);

  // Setting a non-clear status then unmounting MUST clear status
  const activeController = createEdgeStatusController(bridge);
  await activeController.setStatus({ badgeText: 'REC', pulse: true });
  assert.equal(sent.length, 1);
  activeController.cleanupOnUnmount();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { type: 'setEdgeStatus', status: { clear: true } });

  // Explicitly clearing before unmount must NOT send a duplicate clear
  sent.length = 0;
  const clearedController = createEdgeStatusController(bridge);
  await clearedController.setStatus({ badgeText: '1' });
  await clearedController.clearStatus();
  clearedController.cleanupOnUnmount();
  assert.equal(sent.length, 2);
});

test('SDK re-exports BridgeRpcError and useDynamicThemeState cleanly', () => {
  const err = new BridgeRpcError(-32011, 'plugin.invoke', 'Plugin backend timeout', { ms: 3000 });
  assert.ok(err instanceof Error);
  assert.equal(err.code, -32011);
  assert.equal(err.method, 'plugin.invoke');
  assert.deepEqual(err.data, { ms: 3000 });
  assert.equal(typeof useDynamicThemeState, 'function');
});

test('SDK exports frozen Track B constants and resolvePluginOrigin', () => {
  assert.equal(PLUGIN_EVENT_LAGGED_EVENT, 'plugin.eventLagged');
  assert.equal(MIN_PLUGIN_INVOKE_TIMEOUT_MS, 1_000);
  assert.equal(DEFAULT_PLUGIN_INVOKE_TIMEOUT_MS, 8_000);
  assert.equal(MAX_PLUGIN_INVOKE_TIMEOUT_MS, 60_000);
  assert.equal(
    resolvePluginOrigin('com.example.ha'),
    'https://com.example.ha.plugins.sideveil.local',
  );
});

test('definePluginManifest preserves embed, network, keepAlive, and network capabilities without entry', () => {
  const manifest = definePluginManifest({
    id: 'com.example.zashboard',
    name: 'Zashboard',
    version: '1.0.0',
    embed: {
      url: 'http://127.0.0.1:9090/ui',
      allowedOrigins: ['http://127.0.0.1:9090'],
      allowCleartext: true,
      wideViewport: true,
      allowZoom: false,
      webHistoryBack: true,
    },
    network: {
      allowedOrigins: ['http://127.0.0.1:9090'],
      allowCleartext: true,
      spaFallback: true,
    },
    capabilities: ['network-loopback', 'network-lan', 'network-context'],
    surface: {
      backdrop: 'native-glass',
      presentation: 'drawer',
      keepAlive: true,
    },
  });

  assert.equal(manifest.entry, undefined);
  assert.deepEqual(manifest.embed, {
    url: 'http://127.0.0.1:9090/ui',
    allowedOrigins: ['http://127.0.0.1:9090'],
    allowCleartext: true,
    wideViewport: true,
    allowZoom: false,
    webHistoryBack: true,
  });
  assert.deepEqual(manifest.network, {
    allowedOrigins: ['http://127.0.0.1:9090'],
    allowCleartext: true,
    spaFallback: true,
  });
  assert.deepEqual(manifest.capabilities, ['network-loopback', 'network-lan', 'network-context']);
  assert.equal(manifest.surface?.keepAlive, true);
});

test('lifecycle and network event parsers validate payloads and hooks are exported', () => {
  assert.equal(parsePanelVisibilityEvent({ visible: true }), true);
  assert.equal(parsePanelVisibilityEvent({ visible: false }), false);
  assert.equal(parsePanelVisibilityEvent({ visible: 'yes' }), null);
  assert.equal(parsePanelVisibilityEvent(null), null);

  assert.deepEqual(
    parseScopeChangedEvent({
      foregroundPackage: 'com.example.app',
      foregroundActivity: 'com.example.app/.MainActivity',
      scopeActive: true,
    }),
    {
      foregroundPackage: 'com.example.app',
      foregroundActivity: 'com.example.app/.MainActivity',
      active: true,
      scopeActive: true,
    },
  );
  assert.deepEqual(
    parseScopeChangedEvent({
      foregroundPackage: 'com.example.app',
      foregroundActivity: 'com.example.app/.MainActivity',
      active: true,
    }),
    {
      foregroundPackage: 'com.example.app',
      foregroundActivity: 'com.example.app/.MainActivity',
      active: true,
      scopeActive: true,
    },
  );
  // Canonical record.active takes precedence when both fields are present
  assert.deepEqual(
    parseScopeChangedEvent({
      foregroundPackage: 'com.example.app',
      active: false,
      scopeActive: true,
    }),
    {
      foregroundPackage: 'com.example.app',
      foregroundActivity: '',
      active: false,
      scopeActive: false,
    },
  );
  assert.equal(parseScopeChangedEvent({ scopeActive: true }), null);

  assert.deepEqual(
    parseNetworkContextSnapshot({
      transport: 'wifi',
      vpnActive: true,
      validated: true,
      metered: false,
      interfaceName: 'wlan0',
      ssid: 'HomeNet',
      gateway: '192.168.1.1',
      localIpv4: '192.168.1.20',
    }),
    {
      transport: 'wifi',
      vpnActive: true,
      validated: true,
      metered: false,
      interfaceName: 'wlan0',
      ssid: 'HomeNet',
      gateway: '192.168.1.1',
      localIpv4: '192.168.1.20',
    },
  );
  assert.equal(parseNetworkContextSnapshot({ transport: 'bluetooth' }), null);
  assert.equal(parseNetworkContextSnapshot(null), null);

  assert.equal(parsePluginEventLaggedPayload({ dropped: 5 }), 5);
  assert.equal(parsePluginEventLaggedPayload(3.9), 3);
  assert.equal(parsePluginEventLaggedPayload({ dropped: -1 }), null);
  assert.equal(parsePluginEventLaggedPayload('bad'), null);

  assert.equal(typeof usePanelVisibility, 'function');
  assert.equal(typeof useScopeChanged, 'function');
  assert.equal(typeof useNetworkContext, 'function');
  assert.equal(typeof usePluginEventLagged, 'function');
});

test('shouldPollTelemetry pauses polling when interval is disabled, panel is hidden, or document is hidden', () => {
  assert.equal(shouldPollTelemetry(0, true, false), false);
  assert.equal(shouldPollTelemetry(-100, true, false), false);
  assert.equal(shouldPollTelemetry(1000, false, false), false);
  assert.equal(shouldPollTelemetry(1000, true, true), false);
  assert.equal(shouldPollTelemetry(1000, false, true), false);
  assert.equal(shouldPollTelemetry(1000, true, false), true);
});

test('usePluginStorage keeps initialValue out of reload dependency array to prevent infinite readFile loops', () => {
  const src = readFileSync(new URL('../src/storageHooks.ts', import.meta.url), 'utf8');
  assert.match(src, /const initialValueRef = useRef\(initialValue\)/);
  assert.match(src, /\}, \[bridge, cleanPath, isJson\]\);/);
  assert.doesNotMatch(src, /\[bridge, cleanPath, initialValue, isJson\]/);
});

function DynamicThemeProbe() {
  useDynamicThemeState(true);
  return null;
}

test('useDynamicThemeState enforces allowlisted CSS variables and clears stale keys absent from newer palette updates', () => {
  const originalDocument = globalThis.document;
  const styleProps = new Map();
  globalThis.document = {
    documentElement: {
      style: {
        setProperty: (k, v) => styleProps.set(k, v),
        removeProperty: (k) => styleProps.delete(k),
        getPropertyValue: (k) => styleProps.get(k) ?? '',
      },
    },
  };

  const mockTransport = new MockTransport();
  const bridge = createBridge({ forceEnv: 'mock', pluginId: 'demo', mockTransport });

  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prevDispatcher = internals.H;
  let latestTokens = {};
  let effectCleanup = null;

  internals.H = {
    useContext: () => ({ pluginId: 'demo', bridge, backendState: 'online' }),
    useState: () => [
      latestTokens,
      (next) => {
        latestTokens = typeof next === 'function' ? next(latestTokens) : next;
      },
    ],
    useEffect: (fn) => {
      effectCleanup = fn();
    },
  };

  try {
    DynamicThemeProbe();

    // 1st update: includes allowlisted --accent and --border-hairline plus non-allowlisted --untrusted-var
    mockTransport.emit('theme.paletteUpdated', {
      themeId: 'coloros-glass',
      isDark: true,
      seedArgb: 0xff0066ff,
      lumaHint: 0.5,
      cssTokens: {
        '--accent': '#112233',
        '--border-hairline': 'rgba(255, 255, 255, 0.2)',
        '--untrusted-var': '#ff00ff',
      },
    });

    assert.equal(styleProps.get('--accent'), '#112233');
    assert.equal(styleProps.get('--border-hairline'), 'rgba(255, 255, 255, 0.2)');
    assert.equal(styleProps.has('--untrusted-var'), false);
    assert.deepEqual(latestTokens, {
      '--accent': '#112233',
      '--border-hairline': 'rgba(255, 255, 255, 0.2)',
    });

    // 2nd update: omits --border-hairline; stale --border-hairline must be cleared from DOM and state
    mockTransport.emit('theme.paletteUpdated', {
      themeId: 'coloros-glass',
      isDark: true,
      seedArgb: 0xff3b82f6,
      lumaHint: 0.5,
      cssTokens: {
        '--accent': '#445566',
      },
    });

    assert.equal(styleProps.get('--accent'), '#445566');
    assert.equal(styleProps.has('--border-hairline'), false);
    assert.deepEqual(latestTokens, { '--accent': '#445566' });

    // Unmount cleanup clears remaining applied keys
    effectCleanup?.();
    assert.equal(styleProps.size, 0);
    assert.deepEqual(latestTokens, {});
  } finally {
    internals.H = prevDispatcher;
    bridge.dispose();
    mockTransport.dispose();
    if (originalDocument !== undefined) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }
});
