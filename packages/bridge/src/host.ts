import { isTrustedWindowMessage, PortChannel, WebSocketChannel } from './portChannel.ts';
import { BridgeRpcError, dispatchEventListeners } from './rpcError.ts';
import { BridgeTracer } from './trace.ts';
import type {
  BridgeChannelKind,
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  BridgeTraceListener,
  ContainerAction,
  HostEvent,
  HostEventListener,
  RpcRequest,
  RpcResponse,
} from './types.ts';

export { BridgeRpcError };

interface PendingCall {
  method: string;
  startedAt: number;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: number;
}

export interface HostTransportOptions {
  wsUrl?: string;
  timeoutMs?: number;
  allowedOrigins?: string[];
  onTrace?: BridgeTraceListener;
}

/**
 * Persistent JSON-RPC transport for embedded Android WebView containers.
 * Supports injected `MessagePort` / `window.__POCHITA_HOST__.postMessage` channels
 * and loopback WebSocket fallback with transparent reconnection.
 */
export class HostTransport {
  private readonly pending = new Map<string, PendingCall>();
  private readonly listeners = new Map<string, Set<HostEventListener>>();
  private readonly portChannel = new PortChannel();
  private readonly wsChannel: WebSocketChannel;
  private readonly tracer: BridgeTracer;
  private readonly defaultTimeoutMs: number;
  private readonly allowedOrigins?: string[];

  private reqSeq = 0;
  private disposed = false;

  constructor(options: HostTransportOptions = {}) {
    const wsUrl =
      options.wsUrl ?? (typeof window !== 'undefined' ? window.__POCHITA_HOST__?.wsUrl : undefined);
    this.defaultTimeoutMs = options.timeoutMs ?? 8000;
    this.allowedOrigins = options.allowedOrigins;
    this.tracer = new BridgeTracer(options.onTrace);
    this.wsChannel = new WebSocketChannel({
      wsUrl,
      timeoutMs: this.defaultTimeoutMs,
      onMessage: (raw) => this.handleRawPayload(raw),
      onClosed: () => this.rejectAllPending('Host WebSocket connection closed'),
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowMessage);
    }
  }

  private readonly handleWindowMessage = (event: MessageEvent) => {
    if (this.disposed) return;
    if (!isTrustedWindowMessage(event, this.allowedOrigins)) return;

    // Accept an upgraded or reinstalled dedicated WebMessagePort transferred by an Android WebView host.
    if (event.ports && event.ports.length > 0) {
      const [transferredPort] = event.ports;
      const hadPort = this.portChannel.hasPort();
      this.portChannel.attachPort(transferredPort, (data) => this.handleRawPayload(data));
      this.tracer.record({ kind: hadPort ? 'port.replaced' : 'port.installed' });
    }

    if (
      (typeof event.data === 'string' && event.data.length > 0) ||
      (event.data && typeof event.data === 'object')
    ) {
      this.handleRawPayload(event.data);
    }
  };

  private handleRawPayload(raw: unknown): void {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
    }

    if (!parsed || typeof parsed !== 'object') return;
    const msg = parsed as Partial<RpcResponse & HostEvent>;

    if (typeof msg.id === 'string') {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      window.clearTimeout(pending.timer);
      const durationMs = Math.max(0, Date.now() - pending.startedAt);

      if (msg.error) {
        const rpcErr = new BridgeRpcError(
          msg.error.code,
          pending.method,
          msg.error.message,
          msg.error.data,
        );
        this.tracer.record({
          kind: 'rpc.error',
          id: msg.id,
          method: pending.method,
          durationMs,
          code: msg.error.code,
          error: rpcErr.message,
        });
        pending.reject(rpcErr);
      } else {
        this.tracer.record({
          kind: 'rpc.ok',
          id: msg.id,
          method: pending.method,
          durationMs,
        });
        pending.resolve(msg.result);
      }
      return;
    }

    if (typeof msg.event === 'string') {
      this.tracer.record({ kind: 'event.in', event: msg.event });
      dispatchEventListeners(this.listeners, msg.event, msg.payload);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending.entries()) {
      window.clearTimeout(pending.timer);
      const error = `${reason} ("${id}")`;
      this.tracer.record({
        kind: 'rpc.error',
        id,
        method: pending.method,
        durationMs: Math.max(0, Date.now() - pending.startedAt),
        error,
      });
      pending.reject(new Error(error));
    }
    this.pending.clear();
  }

  private async postRaw(payload: string): Promise<void> {
    if (this.portChannel.send(payload)) {
      return;
    }

    const host = typeof window !== 'undefined' ? window.__POCHITA_HOST__ : undefined;
    if (host && typeof host.postMessage === 'function') {
      host.postMessage(payload);
      return;
    }

    if (this.wsChannel.hasUrl()) {
      await this.wsChannel.send(payload);
      return;
    }

    this.portChannel.enqueue(payload);
  }

  async invoke<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (this.disposed) {
      throw new Error('HostTransport has been disposed');
    }

    const id = `rpc_${Date.now()}_${++this.reqSeq}`;
    const startedAt = Date.now();
    const request: RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const waitMs = timeoutMs ?? this.defaultTimeoutMs;
    this.tracer.record({ kind: 'rpc.start', id, method, timestampMs: startedAt });

    const promise = new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pending.delete(id)) {
          const error = `RPC "${method}" timed out after ${waitMs}ms`;
          this.tracer.record({
            kind: 'rpc.error',
            id,
            method,
            durationMs: Math.max(0, Date.now() - startedAt),
            error,
          });
          reject(new Error(error));
        }
      }, waitMs);

      this.pending.set(id, {
        method,
        startedAt,
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });
    });

    try {
      await this.postRaw(JSON.stringify(request));
    } catch (err) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        window.clearTimeout(pending.timer);
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.tracer.record({
        kind: 'rpc.error',
        id,
        method,
        durationMs: Math.max(0, Date.now() - startedAt),
        error: error.message,
      });
      throw error;
    }

    return promise;
  }

  async sendContainerAction(action: ContainerAction): Promise<void> {
    await this.invoke('container.action', action);
  }

  getChannelKind(): BridgeChannelKind {
    if (this.portChannel.hasPort()) return 'port';
    if (
      typeof window !== 'undefined' &&
      typeof window.__POCHITA_HOST__?.postMessage === 'function'
    ) {
      return 'js-interface';
    }
    return 'ws';
  }

  getDiagnostics(pluginId: string | null = null): BridgeDiagnosticsSnapshot {
    return {
      env: 'host',
      pluginId,
      channelKind: this.getChannelKind(),
      pendingCount: this.pending.size,
      pendingMethods: Array.from(this.pending.values(), (entry) => entry.method),
      lastError: this.tracer.getLastError(),
      disposed: this.disposed,
      traceCount: this.tracer.getTraceCount(),
    };
  }

  getRecentTraces(limit?: number): BridgeTraceEvent[] {
    return this.tracer.getRecentTraces(limit);
  }

  subscribe(event: string, listener: HostEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.handleWindowMessage);
    }
    this.portChannel.dispose();
    this.wsChannel.dispose();
    this.rejectAllPending('Transport disposed before request settled');
    this.listeners.clear();
  }
}
