import assert from 'node:assert/strict';
import test from 'node:test';
import { createBridge, MockTransport } from '@pochita/bridge';
import React from 'react';
import {
  BridgeRpcError,
  createTypedPluginClient,
  usePluginInvoke,
  useTypedPluginClient,
} from '../src/index.ts';

function createRecordingBridge() {
  const calls = [];
  const listeners = new Map();
  let nextResult;
  let nextError = null;

  const bridge = {
    async invokePlugin(method, params, options) {
      calls.push({ method, params, options });
      if (nextError) {
        const err = nextError;
        nextError = null;
        throw err;
      }
      return nextResult;
    },
    onPluginEvent(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
  };

  return {
    bridge,
    calls,
    setNextResult: (val) => {
      nextResult = val;
    },
    setNextError: (err) => {
      nextError = err;
    },
    emit: (event, payload) => {
      for (const fn of listeners.get(event) ?? []) {
        fn(payload);
      }
    },
  };
}

test('createTypedPluginClient forwards params and resolves per-call > per-method > default timeout', async () => {
  const rec = createRecordingBridge();
  const client = createTypedPluginClient(rec.bridge, {
    defaultTimeoutMs: 4000,
    methodTimeouts: {
      'sync.run': 25000,
    },
  });

  // Omitted params uses defaultTimeoutMs
  rec.setNextResult({ ok: true });
  const pingRes = await client.invoke('core.ping');
  assert.deepEqual(pingRes, { ok: true });
  assert.deepEqual(rec.calls.at(-1), {
    method: 'core.ping',
    params: undefined,
    options: { timeoutMs: 4000 },
  });

  // Method-specific timeout overrides defaultTimeoutMs
  rec.setNextResult({ synced: 3 });
  const syncRes = await client.invoke('sync.run', { full: true });
  assert.deepEqual(syncRes, { synced: 3 });
  assert.deepEqual(rec.calls.at(-1), {
    method: 'sync.run',
    params: { full: true },
    options: { timeoutMs: 25000 },
  });

  // Per-call timeout overrides methodTimeouts
  rec.setNextResult({ synced: 1 });
  await client.invoke('sync.run', { full: false }, { timeoutMs: 9000 });
  assert.deepEqual(rec.calls.at(-1), {
    method: 'sync.run',
    params: { full: false },
    options: { timeoutMs: 9000 },
  });

  // Client without timeout options forwards undefined options
  const bareClient = createTypedPluginClient(rec.bridge);
  rec.setNextResult({ ok: true });
  await bareClient.invoke('core.ping');
  assert.deepEqual(rec.calls.at(-1), {
    method: 'core.ping',
    params: undefined,
    options: undefined,
  });
});

test('createTypedPluginClient subscribes and unsubscribes plugin-scoped events via bridge.onPluginEvent', () => {
  const mockTransport = new MockTransport();
  const bridge = createBridge({ forceEnv: 'mock', pluginId: 'com.example.alpha', mockTransport });
  const client = createTypedPluginClient(bridge);

  const received = [];
  const unsubscribe = client.onEvent('metrics.tick', (payload) => {
    received.push(payload);
  });

  try {
    // Matching pluginId scoped event is delivered
    mockTransport.emit('plugin.event', {
      pluginId: 'com.example.alpha',
      event: 'metrics.tick',
      payload: { seq: 1 },
    });
    // Event for another pluginId is ignored
    mockTransport.emit('plugin.event', {
      pluginId: 'com.example.beta',
      event: 'metrics.tick',
      payload: { seq: 2 },
    });
    assert.deepEqual(received, [{ seq: 1 }]);

    // Unsubscribe stops further delivery
    unsubscribe();
    mockTransport.emit('plugin.event', {
      pluginId: 'com.example.alpha',
      event: 'metrics.tick',
      payload: { seq: 3 },
    });
    assert.deepEqual(received, [{ seq: 1 }]);
  } finally {
    bridge.dispose();
    mockTransport.dispose();
  }
});

test('createTypedPluginClient propagates BridgeRpcError and arbitrary rejections verbatim', async () => {
  const rec = createRecordingBridge();
  const client = createTypedPluginClient(rec.bridge);

  const rpcErr = new BridgeRpcError(-32011, 'slow.op', 'plugin backend timed out', {
    retryable: true,
  });
  rec.setNextError(rpcErr);

  await assert.rejects(
    () => client.invoke('slow.op', {}),
    (err) => {
      assert.strictEqual(err, rpcErr);
      assert.equal(err.code, -32011);
      assert.equal(err.method, 'slow.op');
      assert.deepEqual(err.data, { retryable: true });
      return true;
    },
  );
});

function TypedClientProbe({ clientOptions, invokeTimeoutMs }) {
  const client = useTypedPluginClient(clientOptions);
  const invokeSingle = usePluginInvoke('op.single', { timeoutMs: invokeTimeoutMs });
  return { client, invokeSingle };
}

test('useTypedPluginClient and usePluginInvoke allocate zero useState hooks and stay referentially stable', async () => {
  const rec = createRecordingBridge();
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prevDispatcher = internals.H;

  let stateAllocations = 0;
  const refSlots = [];
  const memoSlots = [];
  let refCursor = 0;
  let memoCursor = 0;

  const depsEqual = (prev, next) =>
    prev !== undefined &&
    next !== undefined &&
    prev.length === next.length &&
    prev.every((v, i) => Object.is(v, next[i]));

  internals.H = {
    useContext: () => rec.bridge,
    useState: () => {
      stateAllocations++;
      throw new Error('useState must not be called by useTypedPluginClient or usePluginInvoke');
    },
    useRef: (init) => {
      const idx = refCursor++;
      if (!(idx in refSlots)) refSlots[idx] = { current: init };
      return refSlots[idx];
    },
    useMemo: (factory, deps) => {
      const idx = memoCursor++;
      const prev = memoSlots[idx];
      if (!prev || !depsEqual(prev.deps, deps)) {
        memoSlots[idx] = { value: factory(), deps };
      }
      return memoSlots[idx].value;
    },
    useCallback: (fn, deps) => {
      const idx = memoCursor++;
      const prev = memoSlots[idx];
      if (!prev || !depsEqual(prev.deps, deps)) {
        memoSlots[idx] = { value: fn, deps };
      }
      return memoSlots[idx].value;
    },
  };

  try {
    // Render 1
    refCursor = 0;
    memoCursor = 0;
    const { client: client1, invokeSingle: invoke1 } = TypedClientProbe({
      clientOptions: {
        defaultTimeoutMs: 3000,
        methodTimeouts: { 'op.a': 6000 },
      },
      invokeTimeoutMs: 2500,
    });

    // Render 2 with fresh inline options objects
    refCursor = 0;
    memoCursor = 0;
    const { client: client2, invokeSingle: invoke2 } = TypedClientProbe({
      clientOptions: {
        defaultTimeoutMs: 3000,
        methodTimeouts: { 'op.a': 12000 },
      },
      invokeTimeoutMs: 2500,
    });

    assert.equal(stateAllocations, 0);
    assert.strictEqual(client1, client2);
    assert.strictEqual(invoke1, invoke2);

    // Client picks up updated methodTimeouts without changing identity
    rec.setNextResult({ ok: true });
    await client2.invoke('op.a', { x: 1 });
    assert.deepEqual(rec.calls.at(-1), {
      method: 'op.a',
      params: { x: 1 },
      options: { timeoutMs: 12000 },
    });

    // usePluginInvoke forwards default timeout and per-call override
    rec.setNextResult({ count: 7 });
    const res = await invoke2({ q: 'hi' });
    assert.deepEqual(res, { count: 7 });
    assert.deepEqual(rec.calls.at(-1), {
      method: 'op.single',
      params: { q: 'hi' },
      options: { timeoutMs: 2500 },
    });

    rec.setNextResult({ count: 8 });
    await invoke2({ q: 'hi' }, { timeoutMs: 7500 });
    assert.deepEqual(rec.calls.at(-1), {
      method: 'op.single',
      params: { q: 'hi' },
      options: { timeoutMs: 7500 },
    });
  } finally {
    internals.H = prevDispatcher;
  }
});
