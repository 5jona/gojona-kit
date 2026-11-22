import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BridgeRpcError,
  createBridge,
  createTraceStore,
  DEFAULT_TRACE_BUFFER_SIZE,
  HostTransport,
  MockTransport,
  sanitizeTraceValue,
  TRACE_REDACTED_VALUE,
} from '../src/index.ts';

test('sanitizeTraceValue redacts sensitive keys recursively and bounds strings, depth, arrays, and cycles', () => {
  const longText = 'a'.repeat(320);
  const bigArray = Array.from({ length: 25 }, (_, i) => i);
  const cyclic = { name: 'root' };
  cyclic.self = cyclic;

  const input = {
    accessToken: 'tok_123',
    apiSecret: 'sec_456',
    password: 'pw',
    userPasswd: 'pw2',
    Authorization: 'Bearer xyz',
    cookieHeader: 'sid=abc',
    privateKey: 'pem-body',
    private_key: 'pem-body-2',
    safe: 'visible',
    longText,
    bigArray,
    nested: {
      level1: {
        level2: {
          level3: {
            level4: 'too-deep',
          },
        },
      },
      innerToken: 'secret-nested',
    },
    cyclic,
  };

  const sanitized = sanitizeTraceValue(input);
  assert.equal(sanitized.accessToken, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.apiSecret, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.password, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.userPasswd, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.Authorization, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.cookieHeader, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.privateKey, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.private_key, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.safe, 'visible');
  assert.equal(sanitized.longText.length, 257);
  assert.ok(sanitized.longText.endsWith('…'));
  assert.equal(sanitized.bigArray.length, 21);
  assert.equal(sanitized.bigArray[20], '… (+5 items)');
  assert.equal(sanitized.nested.innerToken, TRACE_REDACTED_VALUE);
  assert.equal(sanitized.nested.level1.level2.level3, '[MaxDepth]');
  assert.equal(sanitized.cyclic.self, '[Circular]');
});

test('createTraceStore enforces ring buffer capacity, supports clear, live subscribe, and JSON export', () => {
  const defaultStore = createTraceStore();
  assert.equal(defaultStore.maxEntries, DEFAULT_TRACE_BUFFER_SIZE);

  const store = createTraceStore({ maxEntries: 3 });
  const received = [];
  const unsub = store.subscribe((entry) => received.push(entry));

  store.push({ phase: 'request', transport: 'mock', method: 'm1', payloadPreview: { token: 'x' } });
  store.push({ phase: 'response', transport: 'mock', method: 'm1', durationMs: 12 });
  store.push({ phase: 'event', transport: 'port', event: 'panel.show' });
  store.push({
    phase: 'error',
    transport: 'host',
    method: 'm2',
    errorMessage: 'boom',
    errorCode: -32000,
  });

  assert.equal(store.getTraceCount(), 4);
  assert.equal(received.length, 4);
  assert.equal(received[0].payloadPreview.token, TRACE_REDACTED_VALUE);
  assert.equal(received[0].kind, 'rpc.start');
  assert.equal(received[3].ok, false);
  assert.equal(received[3].status, 'error');
  assert.equal(received[3].code, -32000);
  assert.equal(received[3].errorCode, -32000);
  assert.equal(received[3].error, 'boom');
  assert.equal(received[3].errorMessage, 'boom');

  // Ring buffer evicted oldest entry (m1 request)
  const entries = store.getEntries();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].phase, 'response');
  assert.equal(entries[2].method, 'm2');

  const parsed = JSON.parse(store.exportJson());
  assert.equal(parsed.length, 3);
  assert.equal(parsed[2].errorMessage, 'boom');

  unsub();
  store.push({ phase: 'lifecycle', transport: 'port', kind: 'port.installed' });
  assert.equal(received.length, 4);

  store.clear();
  assert.equal(store.getEntries().length, 0);
  assert.equal(store.getTraceCount(), 5);
});

test('createBridge integrates traceStore, traceBufferSize, onTrace, subscribeTrace, timeout, and redaction', async () => {
  const externalStore = createTraceStore({ maxEntries: 10 });
  const onTraceSeen = [];
  const subscribedSeen = [];

  const bridge = createBridge({
    forceEnv: 'mock',
    traceStore: externalStore,
    onTrace: (entry) => onTraceSeen.push(entry),
    onMockRpc: async (method, params) => {
      if (method === 'auth.login') {
        return { ok: true, sessionToken: 'secret-session', user: params?.user };
      }
      if (method === 'slow.call') {
        await new Promise((r) => setTimeout(r, 80));
        return { ok: true };
      }
      if (method === 'fail.rpc') {
        throw new BridgeRpcError(-32050, method, 'Denied');
      }
      return { ok: true };
    },
  });

  const unsub = bridge.subscribeTrace((entry) => subscribedSeen.push(entry));

  const res = await bridge.invoke('auth.login', { user: 'alice', password: 'secret-password' });
  assert.equal(res.ok, true);

  await assert.rejects(
    () => bridge.invoke('slow.call', { id: 1 }, { timeoutMs: 20 }),
    /timed out after 20ms/,
  );

  await assert.rejects(() => bridge.invoke('fail.rpc'), BridgeRpcError);

  const entries = bridge.getTraceEntries();
  assert.equal(entries.length, 6);
  assert.equal(externalStore.getEntries().length, 6);
  assert.equal(onTraceSeen.length, 6);
  assert.equal(subscribedSeen.length, 6);

  const loginReq = entries.find((e) => e.method === 'auth.login' && e.phase === 'request');
  assert.equal(loginReq.transport, 'mock');
  assert.equal(loginReq.payloadPreview.password, TRACE_REDACTED_VALUE);
  assert.equal(loginReq.payloadPreview.user, 'alice');

  const loginRes = entries.find((e) => e.method === 'auth.login' && e.phase === 'response');
  assert.equal(loginRes.ok, true);
  assert.equal(typeof loginRes.durationMs, 'number');
  assert.equal(loginRes.payloadPreview.sessionToken, TRACE_REDACTED_VALUE);

  const timeoutEntry = entries.find((e) => e.method === 'slow.call' && e.phase === 'timeout');
  assert.ok(timeoutEntry);
  assert.equal(timeoutEntry.status, 'timeout');
  assert.equal(timeoutEntry.ok, false);
  assert.ok(timeoutEntry.durationMs >= 15);

  const errEntry = entries.find((e) => e.method === 'fail.rpc' && e.phase === 'error');
  assert.ok(errEntry);
  assert.equal(errEntry.errorCode, -32050);
  assert.ok(errEntry.errorMessage.includes('Denied'));

  bridge.clearTraceEntries();
  assert.equal(bridge.getTraceEntries().length, 0);

  unsub();
  bridge.dispose();
});

test('HostTransport tags port vs host transport and marks timeouts with phase=timeout', async () => {
  const originalWindow = globalThis.window;

  class FakeWindow extends EventTarget {
    constructor() {
      super();
      this.location = { origin: 'https://demo.plugins.sideveil.local', search: '' };
      this.setTimeout = setTimeout;
      this.clearTimeout = clearTimeout;
      this.__POCHITA_HOST__ = { postMessage: () => {} };
    }
  }

  const fakeWindow = new FakeWindow();
  globalThis.window = fakeWindow;

  try {
    const store = createTraceStore(20);
    const transport = new HostTransport({
      allowedOrigins: ['https://demo.plugins.sideveil.local'],
      timeoutMs: 20,
      traceStore: store,
    });

    // Without port attached -> transport is 'host', times out with phase: 'timeout'
    await assert.rejects(
      () => transport.invoke('never.replies', { authToken: 'abc' }),
      /timed out/,
    );
    const hostTraces = store.getEntries();
    assert.equal(hostTraces[0].transport, 'host');
    assert.equal(hostTraces[0].payloadPreview.authToken, TRACE_REDACTED_VALUE);
    assert.equal(hostTraces[1].phase, 'timeout');
    assert.equal(hostTraces[1].transport, 'host');

    // Attach port -> transport switches to 'port'
    const ch = new MessageChannel();
    ch.port1.onmessage = (ev) => {
      const req = JSON.parse(String(ev.data));
      ch.port1.postMessage(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }));
    };
    ch.port1.start();

    fakeWindow.dispatchEvent(
      new MessageEvent('message', { origin: '', source: null, data: '', ports: [ch.port2] }),
    );
    await transport.invoke('port.ping', { seq: 1 });

    const portRes = store
      .getEntries()
      .find((e) => e.method === 'port.ping' && e.phase === 'response');
    assert.ok(portRes);
    assert.equal(portRes.transport, 'port');
    assert.equal(portRes.ok, true);

    ch.port1.close();
    ch.port2.close();
    transport.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('MockTransport traceBufferSize bounds retained entries', async () => {
  const transport = new MockTransport({ traceBufferSize: 2 });
  await transport.invoke('ping');
  await transport.invoke('ping');
  assert.equal(transport.getRecentTraces().length, 2);
  assert.equal(transport.getDiagnostics().traceCount, 4);
  transport.dispose();
});
