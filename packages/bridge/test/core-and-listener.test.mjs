import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createBridge,
  createThemeSyncDeduplicator,
  detectPluginId,
  HostTransport,
  MockTransport,
  parseHostHandshake,
} from '../src/core.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = path.resolve(__dirname, '..');

function collectLocalImports(entryFile, visited = new Set()) {
  const abs = path.resolve(entryFile);
  if (visited.has(abs)) return { files: visited, external: new Set() };
  visited.add(abs);
  const external = new Set();
  const source = fs.readFileSync(abs, 'utf8');
  const specMatches = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g,
  );
  for (const match of specMatches) {
    const spec = match[1];
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(abs), spec);
      if (fs.existsSync(target)) {
        const sub = collectLocalImports(target, visited);
        for (const ext of sub.external) external.add(ext);
      }
    } else {
      external.add(spec);
    }
  }
  return { files: visited, external };
}

class FakeWebMessageListener extends EventTarget {
  constructor(onOutbound) {
    super();
    this.onOutbound = onOutbound;
    this.addedListeners = 0;
    this.removedListeners = 0;
  }

  addEventListener(type, listener, options) {
    if (type === 'message') this.addedListeners += 1;
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (type === 'message') this.removedListeners += 1;
    super.removeEventListener(type, listener, options);
  }

  postMessage(message) {
    this.onOutbound?.(message);
  }

  deliverFromHost(payload) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.dispatchEvent(new MessageEvent('message', { data, origin: '', source: null }));
  }
}

class FakeHostWindow extends EventTarget {
  constructor(hostname = 'example.vello-scope.plugins.sideveil.local', search = '') {
    super();
    this.location = {
      origin: `https://${hostname}`,
      hostname,
      search,
    };
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
  }
}

test('@gojona/bridge/core (src/core.ts and built dist/core.js) has zero React imports', async () => {
  const srcGraph = collectLocalImports(path.join(BRIDGE_ROOT, 'src/core.ts'));
  assert.equal(srcGraph.external.has('react'), false, 'src/core.ts must not depend on react');
  assert.equal(
    Array.from(srcGraph.files).some((file) => file.endsWith('BridgeProvider.tsx')),
    false,
    'src/core.ts must not transitively import BridgeProvider.tsx',
  );

  // Pure deduplicator works without React
  const sent = [];
  const dedup = createThemeSyncDeduplicator((payload) => sent.push(payload));
  dedup.sync({ themeId: 'coloros-glass', colorScheme: 'dark' });
  dedup.sync({ themeId: 'coloros-glass', colorScheme: 'dark' });
  assert.equal(sent.length, 1);

  // Compiled dist/core.js also loads cleanly in pure Node with zero React references
  const distCorePath = path.join(BRIDGE_ROOT, 'dist/core.js');
  if (fs.existsSync(distCorePath)) {
    const distGraph = collectLocalImports(distCorePath);
    assert.equal(distGraph.external.has('react'), false, 'dist/core.js must not depend on react');
    const distMod = await import(distCorePath);
    assert.equal(typeof distMod.createBridge, 'function');
    assert.equal(typeof distMod.HostTransport, 'function');
    assert.equal(typeof distMod.detectPluginId, 'function');
    assert.equal(typeof distMod.createThemeSyncDeduplicator, 'function');
  }
});

test('detectPluginId resolves <pluginId>.plugins.sideveil.local when WebMessageListener lacks getPluginId', () => {
  const originalWindow = globalThis.window;
  try {
    const fakeWindow = new FakeHostWindow('com.example.weather.plugins.sideveil.local');
    fakeWindow.__POCHITA_HOST__ = new FakeWebMessageListener();
    globalThis.window = fakeWindow;

    assert.equal(detectPluginId(), 'com.example.weather');

    // Malformed / bare hostnames are ignored cleanly
    fakeWindow.location.hostname = '.plugins.sideveil.local';
    assert.equal(detectPluginId(), null);

    fakeWindow.location.hostname = 'localhost';
    fakeWindow.location.search = '?pluginId=dev.fallback';
    assert.equal(detectPluginId(), 'dev.fallback');
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport and createBridge support WebViewCompat WebMessageListener, host.ready handshake, and dispose cleanup', async () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new FakeHostWindow('localhost');
  const outbound = [];
  const listenerObj = new FakeWebMessageListener((raw) => {
    outbound.push(raw);
    const msg = JSON.parse(raw);
    if (msg.event === 'host.attach') {
      return;
    }
    queueMicrotask(() => {
      listenerObj.deliverFromHost({
        jsonrpc: '2.0',
        id: msg.id,
        result: { echoed: msg.method, params: msg.params },
      });
    });
  });
  fakeWindow.__POCHITA_HOST__ = listenerObj;
  globalThis.window = fakeWindow;

  try {
    const bridge = createBridge({ forceEnv: 'host', timeoutMs: 1000 });
    assert.equal(bridge.env, 'host');
    assert.equal(bridge.pluginId, null);
    assert.equal(bridge.getHostHandshake(), null);
    assert.equal(bridge.getDiagnostics().channelKind, 'web-message-listener');
    assert.equal(listenerObj.addedListeners, 1);
    assert.equal(outbound.length, 1);
    assert.deepEqual(JSON.parse(outbound[0]), {
      event: 'host.attach',
      channel: 'listener',
      protocolVersion: 1,
    });

    // Wait for host.ready before it arrives
    const readyPromise = bridge.waitForHostReady(1000);

    // Subscribe to a scoped plugin event before pluginId is known
    const scopedEvents = [];
    const unsubScoped = bridge.onPluginEvent('tick', (payload) => scopedEvents.push(payload));

    listenerObj.deliverFromHost({
      event: 'host.ready',
      payload: {
        protocolVersion: 1,
        apiVersion: 1,
        pluginId: 'thirdparty.clock',
        grantedCapabilities: ['storage', 'haptics'],
      },
    });

    const handshake = await readyPromise;
    assert.deepEqual(handshake, {
      protocolVersion: 1,
      apiVersion: 1,
      pluginId: 'thirdparty.clock',
      grantedCapabilities: ['storage', 'haptics'],
    });
    assert.equal(bridge.pluginId, 'thirdparty.clock');
    assert.deepEqual(bridge.getHostHandshake(), handshake);
    assert.deepEqual(await bridge.waitForHostReady(50), handshake);

    // Scoped event filtering now honors pluginId discovered from host.ready
    listenerObj.deliverFromHost({
      event: 'plugin.event',
      payload: { pluginId: 'other.plugin', event: 'tick', payload: { n: 1 } },
    });
    listenerObj.deliverFromHost({
      event: 'plugin.event',
      payload: { pluginId: 'thirdparty.clock', event: 'tick', payload: { n: 2 } },
    });
    assert.deepEqual(scopedEvents, [{ n: 2 }]);
    unsubScoped();

    // Outbound RPC and response over WebMessageListener
    const res = await bridge.invoke('telemetry.snapshot', { detail: true });
    assert.deepEqual(res, { echoed: 'telemetry.snapshot', params: { detail: true } });
    assert.equal(outbound.length, 2);

    // Late-arriving legacy WebMessagePort transfer from onPageFinished must NOT hijack
    // the active WebMessageListener channel (Android host closes its peer port on host.attach).
    let stalePortClosed = false;
    const stalePortSent = [];
    const stalePort = {
      onmessage: null,
      start() {},
      postMessage(msg) {
        stalePortSent.push(msg);
      },
      close() {
        stalePortClosed = true;
      },
    };
    const portTransferEvent = new Event('message');
    Object.defineProperties(portTransferEvent, {
      data: { value: '' },
      origin: { value: '' },
      source: { value: null },
      ports: { value: [stalePort] },
    });
    fakeWindow.dispatchEvent(portTransferEvent);
    assert.equal(stalePortClosed, true);
    assert.equal(bridge.getDiagnostics().channelKind, 'web-message-listener');

    const pluginRes = await bridge.invokePlugin('container.list');
    assert.deepEqual(pluginRes, {
      echoed: 'plugin.invoke',
      params: { method: 'container.list' },
    });
    assert.equal(stalePortSent.length, 0);
    assert.equal(outbound.length, 3);

    // Dispose detaches WebMessageListener cleanly
    bridge.dispose();
    assert.equal(listenerObj.removedListeners, 1);

    // Delivering events after dispose is ignored
    let afterDispose = 0;
    const directTransport = new HostTransport({ timeoutMs: 500 });
    directTransport.subscribe('ping.event', () => {
      afterDispose += 1;
    });
    const pendingWait = directTransport.waitForHostReady(500);
    directTransport.dispose();
    await assert.rejects(() => pendingWait, /disposed/);
    listenerObj.deliverFromHost({ event: 'ping.event', payload: {} });
    assert.equal(afterDispose, 0);
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('MockTransport + createBridge support host.ready handshake and parseHostHandshake validates fields', async () => {
  assert.equal(parseHostHandshake(null), null);
  assert.equal(parseHostHandshake({ protocolVersion: 1 }), null);

  const mockTransport = new MockTransport({ namespace: 'handshake-test' });
  const bridge = createBridge({ forceEnv: 'mock', mockTransport });

  const waiting = bridge.waitForHostReady(500);
  mockTransport.emit('host.ready', {
    protocolVersion: 1,
    apiVersion: 1,
    pluginId: 'mock.demo',
    grantedCapabilities: ['toast'],
  });
  const handshake = await waiting;
  assert.equal(handshake.pluginId, 'mock.demo');
  assert.equal(bridge.pluginId, 'mock.demo');
  assert.deepEqual(bridge.getHostHandshake()?.grantedCapabilities, ['toast']);

  bridge.dispose();
  mockTransport.dispose();
});
