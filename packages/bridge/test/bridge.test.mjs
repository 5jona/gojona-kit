import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shellQuote,
  detectRuntime,
  HostTransport,
  MockTransport,
  createThemeSyncDeduplicator,
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
