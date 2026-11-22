import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BridgeRpcError,
  createBridge,
  createDeferredBridgeDisposer,
  HostTransport,
  MockTransport,
  PLUGIN_INVOKE_WIRE_TIMEOUT_MARGIN_MS,
} from '../src/index.ts';

class FakeHostWindow extends EventTarget {
  constructor(origin = 'https://demo.plugins.sideveil.local') {
    super();
    this.location = { origin, search: '' };
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
  }
}

test('DeferredBridgeDisposer survives React 19 StrictMode mount -> cleanup -> remount and disposes on real unmount', async () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new FakeHostWindow();
  fakeWindow.__POCHITA_HOST__ = {
    postMessage: (msg) => {
      const req = JSON.parse(msg);
      queueMicrotask(() => {
        fakeWindow.dispatchEvent(
          new MessageEvent('message', {
            origin: fakeWindow.location.origin,
            data: JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }),
          }),
        );
      });
    },
  };
  globalThis.window = fakeWindow;

  try {
    const disposer = createDeferredBridgeDisposer();
    const bridge = createBridge({
      forceEnv: 'host',
      pluginId: 'demo',
      allowedOrigins: [fakeWindow.location.origin],
      timeoutMs: 1500,
    });

    // StrictMode mount #1 -> cleanup #1 -> remount #2 in the same synchronous turn
    disposer.retain(bridge);
    disposer.scheduleDispose(bridge);
    disposer.retain(bridge);

    // Wait past microtask queue; bridge must still be live and invoke() must succeed
    await Promise.resolve();
    const res = await bridge.invoke('daemon.ping');
    assert.deepEqual(res, { ok: true });

    // Real unmount: scheduleDispose without subsequent retain disposes after microtask
    disposer.scheduleDispose(bridge);
    await Promise.resolve();
    await assert.rejects(() => bridge.invoke('daemon.ping'), /HostTransport has been disposed/);
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport allows WebMessagePort reinstall and flushes queued messages', async () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new FakeHostWindow();
  globalThis.window = fakeWindow;

  try {
    const transport = new HostTransport({
      allowedOrigins: [fakeWindow.location.origin],
      timeoutMs: 1500,
    });

    // Queue an RPC before any port is attached; reinstall/attach must flush it
    const queuedPromise = transport.invoke('daemon.queued');

    const ch1 = new MessageChannel();
    const ch1Received = [];
    ch1.port1.onmessage = (ev) => {
      const req = JSON.parse(String(ev.data));
      ch1Received.push(req.method);
      ch1.port1.postMessage(
        JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { port: 1, method: req.method } }),
      );
    };
    ch1.port1.start();

    fakeWindow.dispatchEvent(
      new MessageEvent('message', { origin: '', source: null, data: '', ports: [ch1.port2] }),
    );
    assert.deepEqual(await queuedPromise, { port: 1, method: 'daemon.queued' });
    assert.deepEqual(ch1Received, ['daemon.queued']);

    // Reinstall a brand-new WebMessagePort while port #1 is already bound
    const ch2 = new MessageChannel();
    const ch2Received = [];
    ch2.port1.onmessage = (ev) => {
      const req = JSON.parse(String(ev.data));
      ch2Received.push(req.method);
      ch2.port1.postMessage(
        JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { port: 2, method: req.method } }),
      );
    };
    ch2.port1.start();

    fakeWindow.dispatchEvent(
      new MessageEvent('message', { origin: '', source: null, data: '', ports: [ch2.port2] }),
    );

    const res2 = await transport.invoke('daemon.afterReinstall');
    assert.deepEqual(res2, { port: 2, method: 'daemon.afterReinstall' });
    assert.deepEqual(ch2Received, ['daemon.afterReinstall']);
    assert.equal(ch1Received.length, 1);

    ch1.port1.close();
    ch1.port2.close();
    ch2.port1.close();
    ch2.port2.close();
    transport.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport rejects failed RPCs with structured BridgeRpcError', async () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new FakeHostWindow();
  fakeWindow.__POCHITA_HOST__ = {
    postMessage: (msg) => {
      const req = JSON.parse(msg);
      queueMicrotask(() => {
        fakeWindow.dispatchEvent(
          new MessageEvent('message', {
            origin: fakeWindow.location.origin,
            data: JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              error: {
                code: -32011,
                message: 'Plugin backend timed out',
                data: { timeoutMs: 4000 },
              },
            }),
          }),
        );
      });
    },
  };
  globalThis.window = fakeWindow;

  try {
    const transport = new HostTransport({
      allowedOrigins: [fakeWindow.location.origin],
      timeoutMs: 1500,
    });

    await assert.rejects(
      () => transport.invoke('plugin.invoke', { method: 'slow.op' }),
      (err) => {
        assert.ok(err instanceof BridgeRpcError);
        assert.equal(err.name, 'BridgeRpcError');
        assert.equal(err.code, -32011);
        assert.equal(err.method, 'plugin.invoke');
        assert.deepEqual(err.data, { timeoutMs: 4000 });
        assert.match(err.message, /Plugin backend timed out \(code -32011\)/);
        return true;
      },
    );

    transport.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport and MockTransport isolate throwing event listeners using snapshot iteration', () => {
  const originalWindow = globalThis.window;
  const fakeWindow = new FakeHostWindow();
  globalThis.window = fakeWindow;

  try {
    const host = new HostTransport({ allowedOrigins: [fakeWindow.location.origin] });
    const hostCalls = [];
    let unsubHostThird = () => {};

    host.subscribe('telemetry', () => {
      hostCalls.push('first-throws');
      throw new Error('boom');
    });
    host.subscribe('telemetry', (payload) => {
      hostCalls.push(`second:${payload.v}`);
      unsubHostThird();
    });
    unsubHostThird = host.subscribe('telemetry', (payload) => {
      hostCalls.push(`third:${payload.v}`);
    });

    fakeWindow.dispatchEvent(
      new MessageEvent('message', {
        origin: fakeWindow.location.origin,
        data: JSON.stringify({ event: 'telemetry', payload: { v: 1 } }),
      }),
    );
    assert.deepEqual(hostCalls, ['first-throws', 'second:1', 'third:1']);
    host.dispose();

    const mock = new MockTransport();
    const mockCalls = [];
    mock.subscribe('ping', () => {
      mockCalls.push('first-throws');
      throw new Error('mock boom');
    });
    mock.subscribe('ping', (payload) => {
      mockCalls.push(`second:${payload}`);
    });
    mock.emit('ping', 'ok');
    assert.deepEqual(mockCalls, ['first-throws', 'second:ok']);
    mock.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('createBridge isolates onPluginEvent and onPluginBackendState by pluginId and deduplicates scoped/direct delivery', async () => {
  assert.equal(PLUGIN_INVOKE_WIRE_TIMEOUT_MARGIN_MS, 2000);
  const mockTransport = new MockTransport();
  const bridge = createBridge({
    forceEnv: 'mock',
    pluginId: 'plugin.alpha',
    mockTransport,
  });

  const receivedEvents = [];
  const receivedStates = [];

  const unsubEvent = bridge.onPluginEvent('metrics', (payload) => {
    receivedEvents.push(payload);
  });
  const unsubState = bridge.onPluginBackendState((state) => {
    receivedStates.push(state);
  });

  // Foreign plugin events must be ignored
  mockTransport.emit('plugin.event', {
    pluginId: 'plugin.beta',
    event: 'metrics',
    payload: { fps: 30 },
  });
  mockTransport.emit('plugin.backendState', {
    pluginId: 'plugin.beta',
    state: 'offline',
  });
  assert.equal(receivedEvents.length, 0);
  assert.equal(receivedStates.length, 0);

  // Matching plugin event followed immediately by direct event must only deliver once
  mockTransport.emit('plugin.event', {
    pluginId: 'plugin.alpha',
    event: 'metrics',
    payload: { fps: 120 },
  });
  mockTransport.emit('metrics', { fps: 120 });
  assert.deepEqual(receivedEvents, [{ fps: 120 }]);

  // Subsequent direct event on next microtask still delivers
  await Promise.resolve();
  mockTransport.emit('metrics', { fps: 90 });
  assert.deepEqual(receivedEvents, [{ fps: 120 }, { fps: 90 }]);

  // Matching backend state delivers
  mockTransport.emit('plugin.backendState', {
    pluginId: 'plugin.alpha',
    state: 'online',
  });
  assert.deepEqual(receivedStates, ['online']);

  unsubEvent();
  unsubState();
  bridge.dispose();
});
