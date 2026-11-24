import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBridge, MockTransport } from '@gojona/bridge/core';
import {
  createSideVeilClient,
  PLUGIN_CAPABILITY_VALUES,
  PLUGIN_ORIGIN_VALUES,
  SIDEVEIL_ERROR_CODES,
  SIDEVEIL_METHODS,
  SIDEVEIL_PROTOCOL_VERSIONS,
} from '../src/core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = path.resolve(__dirname, '..');

function collectRuntimeImports(entryFile, visited = new Set()) {
  const abs = path.resolve(entryFile);
  if (visited.has(abs)) return { files: visited, external: new Set() };
  visited.add(abs);
  const external = new Set();
  const source = fs.readFileSync(abs, 'utf8');
  const specMatches = source.matchAll(
    /(?:^|\n)\s*(import|export)\s+(?!type\b)[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g,
  );
  for (const match of specMatches) {
    const spec = match[2];
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(abs), spec);
      if (fs.existsSync(target)) {
        const sub = collectRuntimeImports(target, visited);
        for (const ext of sub.external) external.add(ext);
      }
    } else {
      external.add(spec);
    }
  }
  return { files: visited, external };
}

test('@gojona/sideveil-sdk/core (src/core.ts and built dist/core.js) has zero React or @gojona/ui imports', async () => {
  const srcGraph = collectRuntimeImports(path.join(SDK_ROOT, 'src/core.ts'));
  assert.equal(srcGraph.external.has('react'), false, 'src/core.ts must not import react');
  assert.equal(
    Array.from(srcGraph.external).some((pkg) => pkg.startsWith('@gojona/ui')),
    false,
    'src/core.ts must not import @gojona/ui',
  );
  assert.equal(
    srcGraph.external.has('@gojona/bridge'),
    false,
    'src/core.ts must import @gojona/bridge/core (not root React entry)',
  );

  assert.equal(SIDEVEIL_PROTOCOL_VERSIONS.PROTOCOL_VERSION, 1);
  assert.equal(SIDEVEIL_ERROR_CODES.QUOTA_EXCEEDED, -32006);
  assert.ok(PLUGIN_ORIGIN_VALUES.includes('bundled'));
  assert.ok(PLUGIN_CAPABILITY_VALUES.includes('network-internet'));

  const distCorePath = path.join(SDK_ROOT, 'dist/core.js');
  if (fs.existsSync(distCorePath)) {
    const distGraph = collectRuntimeImports(distCorePath);
    assert.equal(distGraph.external.has('react'), false, 'dist/core.js must not import react');
    assert.equal(
      Array.from(distGraph.external).some((pkg) => pkg.startsWith('@gojona/ui')),
      false,
      'dist/core.js must not import @gojona/ui',
    );
    assert.equal(
      distGraph.external.has('@gojona/bridge'),
      false,
      'dist/core.js must import @gojona/bridge/core (not root React entry)',
    );
    const distMod = await import(distCorePath);
    assert.equal(typeof distMod.createSideVeilClient, 'function');
    assert.equal(typeof distMod.definePluginManifest, 'function');
  }
});

test('createSideVeilClient dispatches typed sandbox and control RPCs and host events over MockTransport', async () => {
  const calls = [];
  const actions = [];
  const mockTransport = new MockTransport({
    namespace: 'sdk-core-client-test',
    onContainerAction: (action) => actions.push(action),
    onPluginInvoke: (method, params) => {
      calls.push({ kind: 'plugin', method, params });
      return { handled: method };
    },
    handlers: {
      [SIDEVEIL_METHODS.TELEMETRY_SNAPSHOT]: () => ({
        cpuPercent: 21.5,
        memUsedMb: 4096,
        memTotalMb: 12288,
        socTempC: 37.2,
        uptimeSec: 1200,
      }),
      [SIDEVEIL_METHODS.CLIPBOARD_GET]: () => ({ text: 'copied-value' }),
      [SIDEVEIL_METHODS.CLIPBOARD_SET]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.CLIPBOARD_SET, params });
        return { ok: true };
      },
      [SIDEVEIL_METHODS.HAPTICS_TRIGGER]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.HAPTICS_TRIGGER, params });
        return { ok: true };
      },
      [SIDEVEIL_METHODS.NETWORK_CONTEXT]: () => ({
        transport: 'wifi',
        vpnActive: false,
        validated: true,
        metered: false,
        ssid: 'LabWiFi',
      }),
      [SIDEVEIL_METHODS.HUD_UPDATE_SCENE]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.HUD_UPDATE_SCENE, params });
        return { ok: true };
      },
      [SIDEVEIL_METHODS.HUD_DISMISS]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.HUD_DISMISS, params });
        return { ok: true };
      },
      [SIDEVEIL_METHODS.PLUGIN_BUS_PUBLISH]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.PLUGIN_BUS_PUBLISH, params });
        return { ok: true };
      },
      [SIDEVEIL_METHODS.PLUGINS_GRANT_CAPABILITIES]: (params) => {
        calls.push({ kind: 'rpc', method: SIDEVEIL_METHODS.PLUGINS_GRANT_CAPABILITIES, params });
        return { plugins: [], matchedPluginIds: [], activePluginId: null, foregroundPackage: '' };
      },
      [SIDEVEIL_METHODS.PLUGINS_DAEMON_LOGS]: (params) => ({
        pluginId: params.pluginId,
        lines: ['[stderr] daemon online'],
      }),
      [SIDEVEIL_METHODS.PLUGINS_INSPECT_ARCHIVE]: () => ({
        manifest: {
          schemaVersion: 1,
          apiVersion: 1,
          id: 'demo.vanilla',
          name: 'Vanilla Demo',
          version: '1.1.0',
          entry: 'web/index.html',
          capabilities: ['toast', 'storage', 'network-lan'],
        },
        existingVersion: '1.0.0',
        isUpgrade: true,
        capabilities: [
          {
            capability: 'toast',
            risk: 'low',
            requiresApproval: false,
            isNew: false,
            alreadyGranted: true,
          },
          {
            capability: 'storage',
            risk: 'medium',
            requiresApproval: true,
            isNew: false,
            alreadyGranted: true,
          },
          {
            capability: 'network-lan',
            risk: 'medium',
            requiresApproval: true,
            isNew: true,
            alreadyGranted: false,
          },
        ],
        hasDaemon: false,
        daemonAlreadyApproved: false,
        warnings: ['New medium-risk capability requested'],
      }),
    },
  });

  const bridge = createBridge({
    forceEnv: 'mock',
    pluginId: 'demo.vanilla',
    mockTransport,
  });
  const client = createSideVeilClient(bridge);

  // Storage JSON helpers
  await client.storage.writeJson('/prefs.json', { count: 3 });
  assert.deepEqual(await client.storage.readJson('prefs.json'), { count: 3 });

  // Sandbox RPCs
  const tel = await client.telemetry.snapshot();
  assert.equal(tel.cpuPercent, 21.5);
  assert.equal(await client.clipboard.get(), 'copied-value');
  await client.clipboard.set('hello');
  await client.haptics.trigger('click');
  assert.equal((await client.network.context()).ssid, 'LabWiFi');

  // HUD + bus + backend + container
  await client.hud.updateScene({ widthDp: 180, heightDp: 64, primitives: [] });
  assert.deepEqual(await client.hud.dismiss(), { ok: true });
  await client.bus.publish('alerts', { level: 'info' });
  assert.deepEqual(await client.backend.invoke('pingBackend', { seq: 1 }), {
    handled: 'pingBackend',
  });
  await client.container.setPresentationMode('pinned');
  await client.container.dismiss();
  assert.deepEqual(
    actions.map((a) => a.type),
    ['setPresentationMode', 'dismiss'],
  );

  // Events
  const busReceived = [];
  const unsubBus = client.bus.onMessage('alerts', (ev) => busReceived.push(ev));
  mockTransport.emit('plugin.busMessage', {
    fromPluginId: 'peer.plugin',
    topic: 'alerts',
    payload: { ok: true },
  });
  assert.equal(busReceived.length, 1);
  unsubBus();

  // Control plane plugin RPCs
  await client.plugins.grantCapabilities({ pluginId: 'demo.vanilla', grantAllPending: true });
  const daemonLogs = await client.plugins.daemonLogs('demo.vanilla', 50);
  assert.deepEqual(daemonLogs.lines, ['[stderr] daemon online']);
  const inspected = await client.plugins.inspectArchive({ path: '/sdcard/demo.svp' });
  assert.equal(inspected.isUpgrade, true);
  assert.equal(inspected.daemonAlreadyApproved, false);
  assert.equal(inspected.capabilities.length, 3);
  assert.equal(inspected.capabilities[2].isNew, true);
  assert.equal(inspected.warnings.length, 1);

  // Handshake
  const readyPromise = client.waitForReady(500);
  mockTransport.emit('host.ready', {
    protocolVersion: 1,
    apiVersion: 1,
    pluginId: 'demo.vanilla',
    grantedCapabilities: ['storage', 'toast'],
  });
  assert.equal((await readyPromise).protocolVersion, 1);

  client.dispose();
  bridge.dispose();
  mockTransport.dispose();
});
