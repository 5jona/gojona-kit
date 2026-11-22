export interface BridgeTraceEntry {
  id?: string;
  kind?: string;
  phase?: 'request' | 'response' | 'error' | 'event' | 'lifecycle' | 'timeout' | string;
  timestamp?: number;
  timestampMs?: number;
  transport?: string;
  method?: string;
  event?: string;
  durationMs?: number;
  ok?: boolean;
  status?: string;
  code?: number;
  errorCode?: number | string;
  error?: string;
  errorMessage?: string;
  payloadPreview?: unknown;
}

export type BridgeTraceFilter = 'all' | 'error' | 'slow';

export const DEFAULT_SLOW_THRESHOLD_MS = 300;

export const TRACE_FILTER_OPTIONS: ReadonlyArray<{ value: BridgeTraceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '仅错误' },
  { value: 'slow', label: '慢请求' },
];

export function isTraceError(entry: BridgeTraceEntry): boolean {
  return (
    entry.ok === false ||
    entry.phase === 'error' ||
    entry.phase === 'timeout' ||
    entry.status === 'error' ||
    entry.status === 'timeout' ||
    entry.kind === 'rpc.error' ||
    Boolean(entry.errorMessage || entry.error)
  );
}

export function isTraceSlow(
  entry: BridgeTraceEntry,
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
): boolean {
  return typeof entry.durationMs === 'number' && entry.durationMs >= slowThresholdMs;
}

export function getTraceLabel(entry: BridgeTraceEntry): string {
  return entry.method ?? entry.event ?? entry.kind ?? entry.phase ?? 'trace';
}

export function getTraceTimestampMs(entry: BridgeTraceEntry): number | null {
  if (typeof entry.timestampMs === 'number') return entry.timestampMs;
  if (typeof entry.timestamp === 'number') return entry.timestamp;
  return null;
}

export function formatTraceTimestamp(entry: BridgeTraceEntry): string {
  const ts = getTraceTimestampMs(entry);
  if (ts === null) return '--:--:--';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export interface TraceSummary {
  total: number;
  errors: number;
  slow: number;
}

export function summarizeTraceEntries(
  entries: readonly BridgeTraceEntry[],
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
): TraceSummary {
  let errors = 0;
  let slow = 0;
  for (const entry of entries) {
    if (isTraceError(entry)) errors += 1;
    if (isTraceSlow(entry, slowThresholdMs)) slow += 1;
  }
  return { total: entries.length, errors, slow };
}

export interface TraceFilterCriteria {
  filter?: BridgeTraceFilter;
  query?: string;
  slowThresholdMs?: number;
}

export function filterTraceEntries(
  entries: readonly BridgeTraceEntry[],
  criteria: TraceFilterCriteria = {},
): BridgeTraceEntry[] {
  const filter = criteria.filter ?? 'all';
  const slowThresholdMs = criteria.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS;
  const normalizedQuery = criteria.query?.trim().toLowerCase() ?? '';

  return entries.filter((entry) => {
    if (filter === 'error' && !isTraceError(entry)) return false;
    if (filter === 'slow' && !isTraceSlow(entry, slowThresholdMs)) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      entry.method,
      entry.event,
      entry.kind,
      entry.phase,
      entry.transport,
      entry.errorMessage ?? entry.error,
    ]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function formatTracePayload(payloadPreview: unknown): string {
  if (payloadPreview === undefined) return '';
  if (typeof payloadPreview === 'string') return payloadPreview;
  try {
    return JSON.stringify(payloadPreview, null, 2);
  } catch {
    return String(payloadPreview);
  }
}

export function resolveTracePhaseBadge(entry: BridgeTraceEntry): {
  label: string;
  variant: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
} {
  const phase = entry.phase ?? entry.kind ?? 'trace';
  if (phase === 'timeout' || entry.status === 'timeout') {
    return { label: '超时', variant: 'danger' };
  }
  if (isTraceError(entry)) {
    return { label: '错误', variant: 'danger' };
  }
  if (phase === 'response' || entry.kind === 'rpc.ok') {
    return { label: '响应', variant: 'success' };
  }
  if (phase === 'request' || entry.kind === 'rpc.start') {
    return { label: '请求', variant: 'accent' };
  }
  if (phase === 'event' || entry.kind === 'event.in') {
    return { label: '事件', variant: 'neutral' };
  }
  if (phase === 'lifecycle') {
    return { label: '生命周期', variant: 'warning' };
  }
  return { label: String(phase), variant: 'neutral' };
}
