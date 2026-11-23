/**
 * Normalized bridge trace record consumed by `<BridgeTraceInspector>`.
 */
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

/**
 * Filter mode for `<BridgeTraceInspector>`.
 */
export type BridgeTraceFilter = 'all' | 'error' | 'slow';

/**
 * Default duration threshold in milliseconds above which an RPC trace entry is flagged as slow.
 */
export const DEFAULT_SLOW_THRESHOLD_MS = 300;

/**
 * Built-in filter pill options for `<BridgeTraceInspector>`.
 */
export const TRACE_FILTER_OPTIONS: ReadonlyArray<{ value: BridgeTraceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '仅错误' },
  { value: 'slow', label: '慢请求' },
];

/**
 * Determines whether a trace entry represents an RPC or transport error/timeout.
 */
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

/**
 * Determines whether a trace entry's duration meets or exceeds `slowThresholdMs`.
 */
export function isTraceSlow(
  entry: BridgeTraceEntry,
  slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
): boolean {
  return typeof entry.durationMs === 'number' && entry.durationMs >= slowThresholdMs;
}

/**
 * Returns the primary display label (`method`, `event`, `kind`, or `phase`) for a trace row.
 */
export function getTraceLabel(entry: BridgeTraceEntry): string {
  return entry.method ?? entry.event ?? entry.kind ?? entry.phase ?? 'trace';
}

/**
 * Extracts a numeric epoch timestamp in milliseconds from a trace entry.
 */
export function getTraceTimestampMs(entry: BridgeTraceEntry): number | null {
  if (typeof entry.timestampMs === 'number') return entry.timestampMs;
  if (typeof entry.timestamp === 'number') return entry.timestamp;
  return null;
}

/**
 * Formats a trace entry's timestamp as `HH:mm:ss.SSS`.
 */
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

/**
 * Aggregated counts of total, error, and slow trace entries.
 */
export interface TraceSummary {
  total: number;
  errors: number;
  slow: number;
}

/**
 * Computes total, error, and slow entry counts across a trace list.
 */
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

/**
 * Criteria accepted by `filterTraceEntries`.
 */
export interface TraceFilterCriteria {
  filter?: BridgeTraceFilter;
  query?: string;
  slowThresholdMs?: number;
}

/**
 * Filters trace entries by status category (`all` | `error` | `slow`) and search query.
 */
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

/**
 * Formats a sanitized trace payload preview as pretty-printed JSON.
 */
export function formatTracePayload(payloadPreview: unknown): string {
  if (payloadPreview === undefined) return '';
  if (typeof payloadPreview === 'string') return payloadPreview;
  try {
    return JSON.stringify(payloadPreview, null, 2);
  } catch {
    return String(payloadPreview);
  }
}

/**
 * Resolves a localized badge label and semantic tone for a trace entry's phase.
 */
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
