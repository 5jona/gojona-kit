import { sanitizeTraceValue } from './traceSanitize.ts';
import { createTraceStore, DEFAULT_TRACE_BUFFER_SIZE } from './traceStore.ts';
import type {
  BridgeTraceEvent,
  BridgeTraceInput,
  BridgeTraceListener,
  BridgeTraceStore,
  BridgeTraceTransport,
} from './types.ts';

export { createTraceStore, DEFAULT_TRACE_BUFFER_SIZE, sanitizeTraceValue };

/**
 * Bounded ring-buffer tracer for bridge RPC and event diagnostics.
 * Delegates storage and subscriptions to a `BridgeTraceStore`.
 */
export class BridgeTracer {
  private readonly store: BridgeTraceStore;

  constructor(
    onTrace?: BridgeTraceListener,
    maxEntries = DEFAULT_TRACE_BUFFER_SIZE,
    store?: BridgeTraceStore,
  ) {
    this.store = store ?? createTraceStore({ maxEntries });
    if (onTrace) {
      this.store.subscribe(onTrace);
    }
  }

  getStore(): BridgeTraceStore {
    return this.store;
  }

  record(event: BridgeTraceInput): BridgeTraceEvent {
    return this.store.push(event);
  }

  rpcStart(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.start',
      phase: 'request',
      transport,
      id,
      method,
      timestampMs: startedAt,
      payloadPreview,
    });
  }

  rpcOk(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.ok',
      phase: 'response',
      transport,
      id,
      method,
      durationMs: Math.max(0, Date.now() - startedAt),
      payloadPreview,
    });
  }

  rpcError(
    transport: BridgeTraceTransport,
    id: string | undefined,
    method: string,
    startedAt: number,
    error: string,
    options?: { code?: number; timedOut?: boolean },
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'rpc.error',
      phase: options?.timedOut ? 'timeout' : 'error',
      transport,
      id,
      method,
      durationMs: Math.max(0, Date.now() - startedAt),
      error,
      ...(options?.code !== undefined ? { code: options.code } : {}),
    });
  }

  eventIn(
    transport: BridgeTraceTransport,
    event: string,
    payloadPreview?: unknown,
  ): BridgeTraceEvent {
    return this.store.push({
      kind: 'event.in',
      phase: 'event',
      transport,
      event,
      payloadPreview,
    });
  }

  getRecentTraces(limit?: number): BridgeTraceEvent[] {
    return this.store.getEntries(limit);
  }

  clear(): void {
    this.store.clear();
  }

  subscribe(listener: BridgeTraceListener): () => void {
    return this.store.subscribe(listener);
  }

  exportJson(pretty = true): string {
    return this.store.exportJson(pretty);
  }

  getTraceCount(): number {
    return this.store.getTraceCount();
  }

  getLastError(): string | null {
    return this.store.getLastError();
  }

  setLastError(error: string | null): void {
    this.store.setLastError(error);
  }
}
