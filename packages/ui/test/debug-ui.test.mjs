import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BridgeTraceInspector,
  filterTraceEntries,
  isTraceError,
  isTraceSlow,
  summarizeTraceEntries,
} from '../dist/components/BridgeTraceInspector.js';
import {
  filterLogEntries,
  formatLogEntriesText,
  LogConsole,
} from '../dist/components/LogConsole.js';

const SAMPLE_LOGS = [
  {
    id: '1',
    timestamp: '10:00:01',
    level: 'info',
    source: 'bridge',
    tag: 'init',
    message: 'Bridge ready',
  },
  {
    id: '2',
    timestamp: '10:00:02',
    level: 'warn',
    source: 'rpc',
    message: 'Slow response detected',
  },
  {
    id: '3',
    timestamp: '10:00:03',
    level: 'error',
    source: 'daemon',
    tag: 'net',
    message: 'Connection refused',
  },
  { id: '4', timestamp: '10:00:04', level: 'debug', message: 'Heartbeat tick' },
];

const SAMPLE_TRACES = [
  {
    id: 't1',
    kind: 'rpc.ok',
    phase: 'response',
    timestamp: 1700000000000,
    timestampMs: 1700000000000,
    transport: 'port',
    method: 'daemon.ping',
    durationMs: 12,
    ok: true,
    status: 'ok',
    payloadPreview: { pong: true },
  },
  {
    id: 't2',
    kind: 'rpc.ok',
    phase: 'response',
    timestamp: 1700000001000,
    timestampMs: 1700000001000,
    transport: 'host',
    method: 'plugin.invoke',
    durationMs: 420,
    ok: true,
    status: 'ok',
  },
  {
    id: 't3',
    kind: 'rpc.error',
    phase: 'timeout',
    timestamp: 1700000002000,
    timestampMs: 1700000002000,
    transport: 'mock',
    method: 'storage.sync',
    durationMs: 800,
    ok: false,
    status: 'timeout',
    errorCode: -32011,
    errorMessage: 'RPC timed out',
  },
];

test('filterLogEntries and formatLogEntriesText handle level filtering and case-insensitive search', () => {
  assert.equal(filterLogEntries(SAMPLE_LOGS).length, 4);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { level: 'error' }).length, 1);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { level: 'debug' }).length, 1);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { query: 'BRIDGE' }).length, 1);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { query: 'NET' }).length, 1);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { level: 'warn', query: 'slow' }).length, 1);
  assert.equal(filterLogEntries(SAMPLE_LOGS, { level: 'error', query: 'slow' }).length, 0);

  const formatted = formatLogEntriesText([SAMPLE_LOGS[0], SAMPLE_LOGS[3]]);
  assert.equal(formatted, '[10:00:01] [bridge/init] Bridge ready\n[10:00:04] Heartbeat tick');
});

test('LogConsole preserves backward compatibility and renders optional search/filter/export controls', () => {
  // Backward-compatible minimal props
  const minimalHtml = renderToStaticMarkup(
    createElement(LogConsole, {
      entries: [],
      'data-testid': 'legacy-console',
    }),
  );
  assert.ok(minimalHtml.includes('data-pochita="log-console"'));
  assert.ok(minimalHtml.includes('data-testid="legacy-console"'));
  assert.ok(minimalHtml.includes('诊断日志 (0)'));
  assert.ok(minimalHtml.includes('暂无日志记录'));
  assert.ok(!minimalHtml.includes('aria-label="搜索日志"'));
  assert.ok(!minimalHtml.includes('aria-label="日志级别筛选"'));

  // Enhanced props
  const enhancedHtml = renderToStaticMarkup(
    createElement(LogConsole, {
      entries: SAMPLE_LOGS,
      searchable: true,
      filterable: true,
      onExport: () => {},
      onClear: () => {},
      emptyMessage: '无日志',
    }),
  );
  assert.ok(enhancedHtml.includes('aria-label="搜索日志"'));
  assert.ok(enhancedHtml.includes('aria-label="日志级别筛选"'));
  assert.ok(enhancedHtml.includes('全部'));
  assert.ok(enhancedHtml.includes('错误'));
  assert.ok(enhancedHtml.includes('警告'));
  assert.ok(enhancedHtml.includes('信息'));
  assert.ok(enhancedHtml.includes('调试'));
  assert.ok(enhancedHtml.includes('aria-label="导出日志"'));
  assert.ok(enhancedHtml.includes('[bridge/init]'));
  assert.ok(enhancedHtml.includes('data-log-level="debug"'));
});

test('bridgeTraceUtils summarizes and filters trace entries accurately', () => {
  assert.equal(isTraceError(SAMPLE_TRACES[0]), false);
  assert.equal(isTraceError(SAMPLE_TRACES[2]), true);
  assert.equal(isTraceSlow(SAMPLE_TRACES[0], 300), false);
  assert.equal(isTraceSlow(SAMPLE_TRACES[1], 300), true);

  const summary = summarizeTraceEntries(SAMPLE_TRACES, 300);
  assert.deepEqual(summary, { total: 3, errors: 1, slow: 2 });

  assert.equal(filterTraceEntries(SAMPLE_TRACES, { filter: 'all' }).length, 3);
  assert.equal(filterTraceEntries(SAMPLE_TRACES, { filter: 'error' }).length, 1);
  assert.equal(
    filterTraceEntries(SAMPLE_TRACES, { filter: 'slow', slowThresholdMs: 300 }).length,
    2,
  );
  assert.equal(filterTraceEntries(SAMPLE_TRACES, { query: 'ping' }).length, 1);
  assert.equal(filterTraceEntries(SAMPLE_TRACES, { filter: 'slow', query: 'storage' }).length, 1);
});

test('BridgeTraceInspector renders summary badges, filter controls, actions, and rows', () => {
  const html = renderToStaticMarkup(
    createElement(BridgeTraceInspector, {
      entries: SAMPLE_TRACES,
      slowThresholdMs: 300,
      onClear: () => {},
      'data-testid': 'trace-inspector',
    }),
  );
  assert.ok(html.includes('data-pochita="bridge-trace-inspector"'));
  assert.ok(html.includes('data-testid="trace-inspector"'));
  assert.ok(html.includes('共 3 条'));
  assert.ok(html.includes('错误 1'));
  assert.ok(html.includes('慢请求 2'));
  assert.ok(html.includes('全部'));
  assert.ok(html.includes('仅错误'));
  assert.ok(html.includes('慢请求'));
  assert.ok(html.includes('复制 JSON'));
  assert.ok(html.includes('清空'));
  assert.ok(html.includes('daemon.ping'));
  assert.ok(html.includes('420ms'));
  assert.ok(html.includes('aria-expanded="false"'));

  const emptyHtml = renderToStaticMarkup(
    createElement(BridgeTraceInspector, {
      entries: [],
      emptyMessage: '当前无追踪事件',
    }),
  );
  assert.ok(emptyHtml.includes('当前无追踪事件'));
});
