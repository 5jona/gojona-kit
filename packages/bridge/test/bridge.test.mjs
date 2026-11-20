import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBridge,
  createThemeSyncDeduplicator,
  detectPluginId,
  detectRuntime,
  HostTransport,
  MockTransport,
  shellQuote,
} from '../src/index.ts';

test('shellQuote properly escapes single quotes and shell metacharacters', () => {
  assert.equal(shellQuote(''), "''");
  assert.equal(shellQuote('simple'), "'simple'");
  assert.equal(shellQuote("don't"), "'don'\\''t'");
  assert.equal(shellQuote("'quoted'"), "''\\''quoted'\\'''");
  assert.equal(
    shellQuote('danger; rm -rf / $VAR `whoami` $(id) "double"'),
    '\'danger; rm -rf / $VAR `whoami` $(id) "double"\'',
  );
});

test('detectRuntime resolves mock by default and respects allowUrlOverride constraints', () => {
  const originalWindow = globalThis.window;

  try {
    delete globalThis.window;
    assert.equal(detectRuntime(), 'mock');

    // Simulate mock window environment
    globalThis.window = {
      location: { search: '?env=ksu' },
    };

    // Default without url override enabled should not trust query in non-DEV
    assert.equal(detectRuntime(), 'mock');

    // Explicitly disabling URL override should never honor query params
    assert.equal(detectRuntime({ allowUrlOverride: false }), 'mock');

    // Explicitly enabling URL override honors ?env=ksu
    assert.equal(detectRuntime({ allowUrlOverride: true }), 'ksu');

    // Explicitly enabling URL override honors ?env=host
    globalThis.window.location.search = '?env=host';
    assert.equal(detectRuntime({ allowUrlOverride: true }), 'host');

    // Native globals take precedence over fallback
    globalThis.window.location.search = '';
    globalThis.window.ksu = { exec: () => {} };
    assert.equal(detectRuntime({ allowUrlOverride: false }), 'ksu');

    globalThis.window.__POCHITA_HOST__ = {};
    assert.equal(detectRuntime({ allowUrlOverride: false }), 'host');
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('MockTransport handles built-in ping, custom RPC handlers, fs storage, and event subscriptions', async () => {
  let state = { themeId: 'coloros-glass', blurRadiusPx: 160 };
  const transport = new MockTransport({
    initialFiles: { '/etc/seed.json': '{"seeded":true}' },
    handlers: {
      'state.get': () => ({ ...state }),
      'state.patch': (params) => {
        state = { ...state, ...(params ?? {}) };
        return { ...state };
      },
    },
  });

  // built-in ping
  const ping = await transport.invoke('daemon.ping');
  assert.equal(ping.pong, true);
  assert.equal(typeof ping.timestampMs, 'number');

  // custom handlers
  const initial = await transport.invoke('state.get');
  assert.equal(initial.themeId, 'coloros-glass');

  const patched = await transport.invoke('state.patch', {
    themeId: 'modern-saas-dark',
    blurRadiusPx: 240,
  });
  assert.equal(patched.themeId, 'modern-saas-dark');
  assert.equal(patched.blurRadiusPx, 240);

  const unsubHandler = transport.registerHandler('custom.echo', (p) => ({ echoed: p }));
  assert.deepEqual(await transport.invoke('custom.echo', 'hello'), { echoed: 'hello' });
  unsubHandler();

  // readFile / writeFile
  assert.equal(await transport.readFile('/etc/seed.json'), '{"seeded":true}');
  assert.equal(await transport.readFile('/tmp/state.json'), null);
  const writeRes = await transport.writeFile('/tmp/state.json', '{"saved":true}');
  assert.equal(writeRes.errno, 0);
  assert.equal(await transport.readFile('/tmp/state.json'), '{"saved":true}');

  // subscribe / unsubscribe handler equality cleanup
  let receivedCount = 0;
  let lastPayload = null;
  const listener = (payload) => {
    receivedCount += 1;
    lastPayload = payload;
  };

  assert.equal(transport.getListenerCount('panel.stateChanged'), 0);
  const unsubscribe = transport.subscribe('panel.stateChanged', listener);
  assert.equal(transport.getListenerCount('panel.stateChanged'), 1);

  transport.emit('panel.stateChanged', { open: true });
  assert.equal(receivedCount, 1);
  assert.deepEqual(lastPayload, { open: true });

  // Unsubscribe cleanly cleans up the listener set
  unsubscribe();
  assert.equal(transport.getListenerCount('panel.stateChanged'), 0);

  transport.emit('panel.stateChanged', { open: false });
  assert.equal(receivedCount, 1);
});

test('HostTransport rejects untrusted origins and accepts valid responses/events from trusted origin', async () => {
  const originalWindow = globalThis.window;

  class FakeWindow extends EventTarget {
    constructor() {
      super();
      this.location = { origin: 'https://appassets.androidplatform.net', search: '' };
      this.setTimeout = setTimeout;
      this.clearTimeout = clearTimeout;
      this.lastSentPayload = null;
      this.__POCHITA_HOST__ = {
        postMessage: (msg) => {
          this.lastSentPayload = msg;
        },
      };
    }
  }

  const fakeWindow = new FakeWindow();
  globalThis.window = fakeWindow;

  try {
    const trustedOrigin = 'https://appassets.androidplatform.net';
    const untrustedOrigin = 'https://malicious.example.com';
    const transport = new HostTransport({
      allowedOrigins: [trustedOrigin],
      timeoutMs: 1500,
    });

    // Verify event filtering by origin
    let trustedEventPayload = null;
    let eventCallCount = 0;
    const unsub = transport.subscribe('daemon.state', (payload) => {
      eventCallCount += 1;
      trustedEventPayload = payload;
    });

    // Untrusted origin event should be silently dropped
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: untrustedOrigin,
        data: JSON.stringify({ event: 'daemon.state', payload: { forged: true } }),
      }),
    );
    assert.equal(eventCallCount, 0);
    assert.equal(trustedEventPayload, null);

    // Trusted origin event should be processed
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: trustedOrigin,
        data: JSON.stringify({ event: 'daemon.state', payload: { verified: true } }),
      }),
    );
    assert.equal(eventCallCount, 1);
    assert.deepEqual(trustedEventPayload, { verified: true });

    unsub();

    // Verify RPC response filtering by origin
    const invokePromise = transport.invoke('daemon.ping');
    assert.ok(fakeWindow.lastSentPayload);
    const sentReq = JSON.parse(fakeWindow.lastSentPayload);
    const reqId = sentReq.id;

    // Untrusted origin attempt to resolve RPC should be ignored
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: untrustedOrigin,
        data: JSON.stringify({
          jsonrpc: '2.0',
          id: reqId,
          result: { forged: true },
        }),
      }),
    );

    // Valid response from trusted origin fulfills the RPC
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: trustedOrigin,
        data: JSON.stringify({
          jsonrpc: '2.0',
          id: reqId,
          result: { pong: true, daemonUptimeMs: 42000 },
        }),
      }),
    );

    const rpcResult = await invokePromise;
    assert.deepEqual(rpcResult, { pong: true, daemonUptimeMs: 42000 });

    transport.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport accepts native WebView MessagePort transfer even when allowedOrigins is configured', async () => {
  const originalWindow = globalThis.window;

  class FakeWindow extends EventTarget {
    constructor() {
      super();
      this.location = {
        origin: 'https://sideveil.diagnostic.plugins.sideveil.local',
        search: '',
      };
      this.setTimeout = setTimeout;
      this.clearTimeout = clearTimeout;
    }
  }

  const fakeWindow = new FakeWindow();
  globalThis.window = fakeWindow;

  try {
    const transport = new HostTransport({
      allowedOrigins: ['https://sideveil.diagnostic.plugins.sideveil.local'],
      timeoutMs: 1500,
    });

    const channel = new MessageChannel();
    const hostPort = channel.port1;
    const pagePort = channel.port2;
    const receivedOnHost = [];

    hostPort.onmessage = (ev) => {
      const parsed = JSON.parse(String(ev.data));
      receivedOnHost.push(parsed);
      hostPort.postMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: { pong: true, viaPort: true },
        }),
      );
    };
    hostPort.start();

    // Untrusted origin attempting port transfer must be rejected
    const bogusChannel = new MessageChannel();
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://malicious.example.com',
        source: null,
        data: '',
        ports: [bogusChannel.port2],
      }),
    );

    // Native Android WebView postWebMessage delivers origin="" and source=null
    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: '',
        source: null,
        data: '',
        ports: [pagePort],
      }),
    );

    const res = await transport.invoke('daemon.ping');
    assert.deepEqual(res, { pong: true, viaPort: true });
    assert.equal(receivedOnHost.length, 1);
    assert.equal(receivedOnHost[0].method, 'daemon.ping');

    hostPort.close();
    pagePort.close();
    bogusChannel.port1.close();
    bogusChannel.port2.close();
    transport.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('createThemeSyncDeduplicator deduplicates consecutive identical payloads, respects includeAppearanceHints, and resets', () => {
  const sent = [];
  const deduplicator = createThemeSyncDeduplicator((payload) => {
    sent.push(payload);
  });

  const payloadA = {
    themeId: 'coloros-glass',
    colorScheme: 'dark',
    wantsNativeBlur: true,
    cornerRadiusPx: 24,
  };

  // First call emits
  deduplicator.sync(payloadA);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], payloadA);

  // Consecutive identical call suppressed
  deduplicator.sync({ ...payloadA });
  assert.equal(sent.length, 1);

  // Emits on change
  const payloadB = {
    themeId: 'modern-saas-dark',
    colorScheme: 'dark',
    wantsNativeBlur: false,
    cornerRadiusPx: 14,
  };
  deduplicator.sync(payloadB);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], payloadB);

  // Suppressed again
  deduplicator.sync(payloadB);
  assert.equal(sent.length, 2);

  // reset() allows re-emitting identical payload
  deduplicator.reset();
  deduplicator.sync(payloadB);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[2], payloadB);

  // includeAppearanceHints: false strips hints and deduplicates based only on themeId + colorScheme
  const sentStripped = [];
  const strippedDeduplicator = createThemeSyncDeduplicator(
    (payload) => {
      sentStripped.push(payload);
    },
    { includeAppearanceHints: false },
  );

  strippedDeduplicator.sync({
    themeId: 'coloros-glass',
    colorScheme: 'light',
    wantsNativeBlur: true,
    cornerRadiusPx: 24,
  });

  assert.equal(sentStripped.length, 1);
  assert.deepEqual(sentStripped[0], {
    themeId: 'coloros-glass',
    colorScheme: 'light',
  });
  assert.equal(Object.hasOwn(sentStripped[0], 'wantsNativeBlur'), false);
  assert.equal(Object.hasOwn(sentStripped[0], 'cornerRadiusPx'), false);

  // Changing only appearance hints does not emit since hints are stripped
  strippedDeduplicator.sync({
    themeId: 'coloros-glass',
    colorScheme: 'light',
    wantsNativeBlur: false,
    cornerRadiusPx: 0,
  });
  assert.equal(sentStripped.length, 1);

  // Changing colorScheme emits new stripped payload
  strippedDeduplicator.sync({
    themeId: 'coloros-glass',
    colorScheme: 'dark',
    wantsNativeBlur: false,
    cornerRadiusPx: 0,
  });
  assert.equal(sentStripped.length, 2);
  assert.deepEqual(sentStripped[1], {
    themeId: 'coloros-glass',
    colorScheme: 'dark',
  });
});

test('detectPluginId detects id from override, window.__POCHITA_HOST__, and query params', () => {
  const originalWindow = globalThis.window;

  try {
    delete globalThis.window;
    assert.equal(detectPluginId(), null);
    assert.equal(detectPluginId('custom.plugin'), 'custom.plugin');

    globalThis.window = {
      location: { search: '?pluginId=query.plugin' },
    };
    assert.equal(detectPluginId(), 'query.plugin');

    globalThis.window.__POCHITA_HOST__ = {
      pluginId: 'global.plugin',
    };
    assert.equal(detectPluginId(), 'global.plugin');

    globalThis.window.__POCHITA_HOST__.getPluginId = () => 'func.plugin';
    assert.equal(detectPluginId(), 'func.plugin');

    // Explicit override takes precedence over window
    assert.equal(detectPluginId('override.plugin'), 'override.plugin');
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('createBridge supports pluginId, invokePlugin, onPluginEvent, onPluginBackendState, onBackPressed, and container actions', async () => {
  const containerActions = [];
  const customPluginCalls = [];

  const bridge = createBridge({
    forceEnv: 'mock',
    pluginId: 'sideveil.diagnostic',
    onMockPluginInvoke: (method, params) => {
      customPluginCalls.push({ method, params });
      return { ok: true, method };
    },
    onMockContainerAction: (action) => {
      containerActions.push(action);
    },
  });

  assert.equal(bridge.pluginId, 'sideveil.diagnostic');

  // invokePlugin
  const res = await bridge.invokePlugin('status.get', { detailed: true });
  assert.deepEqual(res, { ok: true, method: 'status.get' });
  assert.equal(customPluginCalls.length, 1);
  assert.equal(customPluginCalls[0].method, 'status.get');

  // container actions
  await bridge.sendContainerAction({ type: 'dismiss' });
  await bridge.sendContainerAction({ type: 'setBackIntercept', enabled: true });
  await bridge.sendContainerAction({
    type: 'setSurfaceBackdrop',
    backdrop: 'native-glass',
  });
  await bridge.sendContainerAction({
    type: 'setPreferredSize',
    widthDp: 360,
    heightPercent: 80,
  });

  assert.equal(containerActions.length, 4);
  assert.deepEqual(containerActions[0], { type: 'dismiss' });
  assert.deepEqual(containerActions[1], { type: 'setBackIntercept', enabled: true });
  assert.deepEqual(containerActions[2], {
    type: 'setSurfaceBackdrop',
    backdrop: 'native-glass',
  });
  assert.deepEqual(containerActions[3], {
    type: 'setPreferredSize',
    widthDp: 360,
    heightPercent: 80,
  });

  bridge.dispose();
});
