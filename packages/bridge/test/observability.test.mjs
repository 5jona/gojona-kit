import assert from 'node:assert/strict';
import test from 'node:test';
import { BridgeRpcError, createBridge, HostTransport, MockTransport } from '../src/index.ts';

test('HostTransport emits trace events for rpc, event.in, port.installed, and port.replaced, and reports diagnostics', async () => {
  const originalWindow = globalThis.window;

  class FakeWindow extends EventTarget {
    constructor() {
      super();
      this.location = { origin: 'https://demo.plugins.sideveil.local', search: '' };
      this.setTimeout = setTimeout;
      this.clearTimeout = clearTimeout;
      this.__POCHITA_HOST__ = {
        postMessage: () => {},
      };
    }
  }

  const fakeWindow = new FakeWindow();
  globalThis.window = fakeWindow;

  try {
    const traces = [];
    const transport = new HostTransport({
      allowedOrigins: ['https://demo.plugins.sideveil.local'],
      timeoutMs: 1000,
      onTrace: (entry) => traces.push(entry),
    });

    assert.equal(transport.getDiagnostics('demo').channelKind, 'js-interface');

    // First native port transfer -> port.installed
    const bindResponder = (port) => {
      port.onmessage = (ev) => {
        const req = JSON.parse(String(ev.data));
        if (req.method === 'fail.method') {
          port.postMessage(
            JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              error: { code: -32001, message: 'Boom' },
            }),
          );
        } else {
          port.postMessage(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }));
        }
      };
      port.start();
    };

    const ch1 = new MessageChannel();
    bindResponder(ch1.port1);

    fakeWindow.dispatchEvent(
      new MessageEvent('message', { origin: '', source: null, data: '', ports: [ch1.port2] }),
    );
    assert.equal(transport.getDiagnostics('demo').channelKind, 'port');
    assert.ok(traces.some((t) => t.kind === 'port.installed'));

    // Second native port transfer -> port.replaced
    const ch2 = new MessageChannel();
    bindResponder(ch2.port1);
    fakeWindow.dispatchEvent(
      new MessageEvent('message', { origin: '', source: null, data: '', ports: [ch2.port2] }),
    );
    assert.ok(traces.some((t) => t.kind === 'port.replaced'));

    // Successful RPC
    const okRes = await transport.invoke('daemon.ping');
    assert.deepEqual(okRes, { ok: true });
    assert.ok(traces.some((t) => t.kind === 'rpc.start' && t.method === 'daemon.ping'));
    assert.ok(traces.some((t) => t.kind === 'rpc.ok' && t.method === 'daemon.ping'));

    // Failing RPC records lastError and rpc.error trace
    await assert.rejects(() => transport.invoke('fail.method'), BridgeRpcError);
    assert.ok(traces.some((t) => t.kind === 'rpc.error' && t.code === -32001));

    // Incoming host event
    ch2.port1.postMessage(JSON.stringify({ event: 'panel.opened', payload: { id: 1 } }));
    await new Promise((r) => setTimeout(r, 15));
    assert.ok(traces.some((t) => t.kind === 'event.in' && t.event === 'panel.opened'));

    const diag = transport.getDiagnostics('demo');
    assert.equal(diag.env, 'host');
    assert.equal(diag.pluginId, 'demo');
    assert.equal(diag.pendingCount, 0);
    assert.deepEqual(diag.pendingMethods, []);
    assert.ok(diag.lastError?.includes('Boom'));
    assert.equal(diag.disposed, false);
    assert.ok(diag.traceCount >= 6);
    assert.ok(transport.getRecentTraces(3).length <= 3);

    ch1.port1.close();
    ch1.port2.close();
    ch2.port1.close();
    ch2.port2.close();
    transport.dispose();
    assert.equal(transport.getDiagnostics('demo').disposed, true);
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('MockTransport supports latencyMs, InvokeOptions.timeoutMs, fault injection, and diagnostics', async () => {
  const traces = [];
  const transport = new MockTransport({
    latencyMs: 30,
    handlers: {
      'slow.op': async () => {
        await new Promise((r) => setTimeout(r, 120));
        return { done: true };
      },
      'fast.op': () => ({ fast: true }),
    },
    onTrace: (entry) => traces.push(entry),
  });

  // Successful call with simulated latency
  const fastPromise = transport.invoke('fast.op');
  assert.equal(transport.getDiagnostics().pendingCount, 1);
  assert.deepEqual(transport.getDiagnostics().pendingMethods, ['fast.op']);
  const fast = await fastPromise;
  assert.deepEqual(fast, { fast: true });
  assert.equal(transport.getDiagnostics().pendingCount, 0);

  // Per-call timeoutMs aborts slow handler
  await assert.rejects(
    () => transport.invoke('slow.op', undefined, { timeoutMs: 25 }),
    /timed out after 25ms/,
  );
  assert.ok(transport.getDiagnostics().lastError?.includes('timed out'));

  // Fault injection + clearFaults
  transport.injectError('fast.op', new BridgeRpcError(-32010, 'fast.op', 'Injected failure'));
  await assert.rejects(() => transport.invoke('fast.op'), BridgeRpcError);
  assert.ok(traces.some((t) => t.kind === 'rpc.error' && t.code === -32010));

  transport.clearFaults('fast.op');
  const recovered = await transport.invoke('fast.op');
  assert.deepEqual(recovered, { fast: true });

  transport.dispose();
  assert.equal(transport.getDiagnostics().disposed, true);
});

test('createBridge installs frozen window.__POCHITA_DEBUG__ with emitHostEvent only in mock env and cleans up on dispose', () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { origin: 'https://demo.plugins.sideveil.local', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };

  try {
    // Mock env exposes emitHostEvent
    const mockBridge = createBridge({ forceEnv: 'mock', pluginId: 'demo.mock' });
    const mockDebug = globalThis.window.__POCHITA_DEBUG__;
    assert.ok(mockDebug);
    assert.equal(Object.isFrozen(mockDebug), true);
    assert.equal(typeof mockDebug.getDiagnostics, 'function');
    assert.equal(typeof mockDebug.getRecentTraces, 'function');
    assert.equal(typeof mockDebug.inspectThemeTokens, 'function');
    assert.equal(typeof mockDebug.emitHostEvent, 'function');

    let received = null;
    mockBridge.onHostEvent('test.ping', (payload) => {
      received = payload;
    });
    mockDebug.emitHostEvent('test.ping', { hello: 'world' });
    assert.deepEqual(received, { hello: 'world' });
    assert.equal(mockDebug.getDiagnostics().env, 'mock');
    mockBridge.dispose();
    assert.equal(globalThis.window.__POCHITA_DEBUG__, undefined);

    // Host env must NOT expose emitHostEvent
    const hostBridge = createBridge({ forceEnv: 'host', pluginId: 'demo.host' });
    const hostDebug = globalThis.window.__POCHITA_DEBUG__;
    assert.ok(hostDebug);
    assert.equal(hostDebug.emitHostEvent, undefined);
    assert.equal(hostDebug.getDiagnostics().env, 'host');
    hostBridge.dispose();
    assert.equal(globalThis.window.__POCHITA_DEBUG__, undefined);
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('HostTransport replays sticky hydration events to late React useEffect subscribers', () => {
  const originalWindow = globalThis.window;
  const listeners = new Set();
  globalThis.window = {
    location: { href: 'https://strata.manager.plugins.sideveil.local/web/index.html', search: '' },
    __POCHITA_HOST__: {
      postMessage: () => {},
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };

  try {
    const bridge = createBridge({ forceEnv: 'host', pluginId: 'strata.manager' });
    const deliver = (msg) => {
      for (const fn of listeners) fn({ data: JSON.stringify(msg) });
    };
    // Simulate host pushing initial state immediately on host.attach BEFORE useEffect subscribes
    deliver({
      event: 'plugin.backendState',
      payload: { pluginId: 'strata.manager', state: 'online' },
    });
    deliver({ event: 'theme.paletteUpdated', payload: { cssTokens: { '--accent': '#516190' } } });
    deliver({ event: 'panel.backPressed', payload: { timestampMs: 1 } });

    const seenStates = [];
    const seenPalettes = [];
    let backPressCount = 0;
    bridge.onPluginBackendState((s) => seenStates.push(s));
    bridge.onThemePalette((p) => seenPalettes.push(p.cssTokens['--accent']));
    bridge.onBackPressed(() => {
      backPressCount += 1;
    });

    assert.deepEqual(seenStates, ['online']);
    assert.deepEqual(seenPalettes, ['#516190']);
    // Transient action events must NOT be replayed
    assert.equal(backPressCount, 0);
    bridge.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});

test('MockTransport replays sticky hydration events and browser forceEnv exposes emitHostEvent', async () => {
  const mockTransport = new MockTransport();
  mockTransport.emit('plugin.backendState', { pluginId: 'demo.mock', state: 'online' });
  mockTransport.emit('panel.backPressed', { timestampMs: 1 });

  const states = [];
  let backCount = 0;
  const unsubState = mockTransport.subscribe('plugin.backendState', (p) => states.push(p.state));
  const unsubBack = mockTransport.subscribe('panel.backPressed', () => {
    backCount += 1;
  });

  assert.deepEqual(states, ['online']);
  assert.equal(backCount, 0);
  unsubState();
  unsubBack();

  // Dispose clears sticky cache
  mockTransport.dispose();
  const afterDisposeStates = [];
  mockTransport.subscribe('plugin.backendState', (p) => afterDisposeStates.push(p.state));
  assert.deepEqual(afterDisposeStates, []);

  // forceEnv: 'browser' exposes emitHostEvent on debug handle
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: { origin: 'https://demo.plugins.sideveil.local', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  try {
    const browserBridge = createBridge({ forceEnv: 'browser', pluginId: 'demo.browser' });
    assert.equal(typeof globalThis.window.__POCHITA_DEBUG__?.emitHostEvent, 'function');
    browserBridge.dispose();

    // HostTransport timeout works even when window.setTimeout is omitted
    const bareHost = new HostTransport({ timeoutMs: 15 });
    await assert.rejects(() => bareHost.invoke('no.window.timer'), /timed out after 15ms/);
    bareHost.dispose();
  } finally {
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  }
});
