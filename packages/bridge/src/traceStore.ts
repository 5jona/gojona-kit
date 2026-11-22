import { sanitizeTraceValue } from './traceSanitize.ts';
import type {
  BridgeTraceEvent,
  BridgeTraceInput,
  BridgeTraceKind,
  BridgeTraceListener,
  BridgeTracePhase,
  BridgeTraceStatus,
  BridgeTraceStore,
  BridgeTraceStoreOptions,
} from './types.ts';

export const DEFAULT_TRACE_BUFFER_SIZE = 200;

function inferPhaseFromKind(kind: BridgeTraceKind): BridgeTracePhase {
  switch (kind) {
    case 'rpc.start':
      return 'request';
    case 'rpc.ok':
      return 'response';
    case 'rpc.error':
      return 'error';
    case 'event.in':
      return 'event';
    case 'port.installed':
    case 'port.replaced':
      return 'lifecycle';
  }
}

function inferKindFromPhase(phase: BridgeTracePhase): BridgeTraceKind {
  switch (phase) {
    case 'request':
      return 'rpc.start';
    case 'response':
      return 'rpc.ok';
    case 'error':
    case 'timeout':
      return 'rpc.error';
    case 'event':
      return 'event.in';
    case 'lifecycle':
      return 'port.installed';
  }
}

function inferStatus(phase: BridgeTracePhase): { ok?: boolean; status: BridgeTraceStatus } {
  switch (phase) {
    case 'request':
      return { status: 'pending' };
    case 'response':
      return { ok: true, status: 'ok' };
    case 'error':
      return { ok: false, status: 'error' };
    case 'timeout':
      return { ok: false, status: 'timeout' };
    case 'event':
      return { ok: true, status: 'event' };
    case 'lifecycle':
      return { ok: true, status: 'lifecycle' };
  }
}

/**
 * Creates a bounded in-memory ring-buffer store for structured bridge trace events
 * with live subscription and JSON export support.
 */
export function createTraceStore(options: number | BridgeTraceStoreOptions = {}): BridgeTraceStore {
  const normalizedOptions: BridgeTraceStoreOptions =
    typeof options === 'number' ? { maxEntries: options } : options;
  const maxEntries = Math.max(1, normalizedOptions.maxEntries ?? DEFAULT_TRACE_BUFFER_SIZE);
  const entries: BridgeTraceEvent[] = [];
  const listeners = new Set<BridgeTraceListener>();
  let totalCount = 0;
  let seq = 0;
  let lastError: string | null = null;

  if (normalizedOptions.onTrace) {
    listeners.add(normalizedOptions.onTrace);
  }

  const push = (input: BridgeTraceInput): BridgeTraceEvent => {
    const phase = input.phase ?? inferPhaseFromKind(input.kind as BridgeTraceKind);
    const kind = input.kind ?? inferKindFromPhase(phase);
    const timestamp = input.timestampMs ?? input.timestamp ?? Date.now();
    const inferred = inferStatus(phase);
    const errorMessage = input.errorMessage ?? input.error;
    const errorCode = input.errorCode ?? input.code;
    const numericCode =
      typeof input.code === 'number'
        ? input.code
        : typeof errorCode === 'number'
          ? errorCode
          : undefined;
    const id = input.id ?? `trace_${++seq}`;

    const entry: BridgeTraceEvent = {
      id,
      kind,
      phase,
      timestamp,
      timestampMs: timestamp,
      transport: input.transport ?? 'unknown',
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.event !== undefined ? { event: input.event } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.ok !== undefined
        ? { ok: input.ok }
        : inferred.ok !== undefined
          ? { ok: inferred.ok }
          : {}),
      status: input.status ?? inferred.status,
      ...(errorMessage !== undefined ? { error: errorMessage, errorMessage } : {}),
      ...(numericCode !== undefined ? { code: numericCode } : {}),
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(input.payloadPreview !== undefined
        ? { payloadPreview: sanitizeTraceValue(input.payloadPreview) }
        : {}),
    };

    totalCount += 1;
    if (
      (entry.kind === 'rpc.error' || entry.phase === 'error' || entry.phase === 'timeout') &&
      errorMessage
    ) {
      lastError = errorMessage;
    }

    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.splice(0, entries.length - maxEntries);
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener(entry);
      } catch {
        // Isolate observer exceptions so transport execution is never disrupted.
      }
    }

    return entry;
  };

  const getEntries = (limit?: number): BridgeTraceEvent[] => {
    if (limit === undefined || limit >= entries.length) {
      return entries.slice();
    }
    if (limit <= 0) return [];
    return entries.slice(-limit);
  };

  const clear = (): void => {
    entries.length = 0;
  };

  const subscribe = (listener: BridgeTraceListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const exportJson = (pretty = true): string => {
    return JSON.stringify(entries, null, pretty ? 2 : undefined);
  };

  return {
    maxEntries,
    push,
    getEntries,
    clear,
    subscribe,
    exportJson,
    getTraceCount: () => totalCount,
    getLastError: () => lastError,
    setLastError: (error: string | null) => {
      lastError = error;
    },
  };
}
