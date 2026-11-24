import { dispatchEventListeners, subscribeEventListener } from './events.ts';
import { HostHandshakeTracker, sendHostAttachBootstrap } from './hostHandshake.ts';
import { isTrustedWindowMessage, PortChannel, WebSocketChannel } from './portChannel.ts';
import { BridgeRpcError } from './rpcError.ts';
import { BridgeTracer } from './trace.ts';
import type {
  BridgeChannelKind,
  BridgeDiagnosticsSnapshot,
  BridgeTraceEvent,
  BridgeTraceListener,
  BridgeTraceStore,
  BridgeTraceTransport,
  ContainerAction,
  EmbeddedHostGlobal,
  HostEvent,
  HostEventListener,
  HostHandshakePayload,
  RpcRequest,
  RpcResponse,
} from './types.ts';

export { BridgeRpcError };

interface PendingCall {
  method: string;
  startedAt: number;
  transport: BridgeTraceTransport;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: number;
}

export interface HostTransportOptions {
  wsUrl?: string;
  timeoutMs?: number;
  allowedOrigins?: string[];
  onTrace?: BridgeTraceListener;
  traceBufferSize?: number;
  traceStore?: BridgeTraceStore;
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
  private readonly handshake = new HostHandshakeTracker();
  private readonly wsChannel: WebSocketChannel;
  private readonly tracer: BridgeTracer;
  private readonly defaultTimeoutMs: number;
  private readonly allowedOrigins?: string[];

  private boundHostListener: EmbeddedHostGlobal | null = null;
  private reqSeq = 0;
  private disposed = false;

  constructor(options: HostTransportOptions = {}) {
    const wsUrl =
      options.wsUrl ?? (typeof window !== 'undefined' ? window.__POCHITA_HOST__?.wsUrl : undefined);
    this.defaultTimeoutMs = options.timeoutMs ?? 8000;
    this.allowedOrigins = options.allowedOrigins;
    this.tracer = new BridgeTracer(options.onTrace, options.traceBufferSize, options.traceStore);
    this.wsChannel = new WebSocketChannel({
      wsUrl,
      timeoutMs: this.defaultTimeoutMs,
      onMessage: (raw) => this.handleRawPayload(raw),
      onClosed: () => this.rejectAllPending('Host WebSocket connection closed'),
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowMessage);
      const host = window.__POCHITA_HOST__;
      if (host && typeof host.addEventListener === 'function') {
        this.boundHostListener = host;
        host.addEventListener('message', this.handleHostListenerMessage);
        sendHostAttachBootstrap(host);
      }
    }
  }

  private getTraceTransport(): BridgeTraceTransport {
    if (this.portChannel.hasPort()) return 'port';
    if (this.boundHostListener !== null) return 'web-message-listener';
    return 'host';
  }

  private processMessageEvent(event: MessageEvent): void {
    if (event.ports && event.ports.length > 0) {
      const [transferredPort] = event.ports;
      const hadPort = this.portChannel.hasPort();
      this.portChannel.attachPort(transferredPort, (data) => this.handleRawPayload(data));
      this.tracer.record({ kind: hadPort ? 'port.replaced' : 'port.installed', transport: 'port' });
    }
    if (
      (typeof event.data === 'string' && event.data.length > 0) ||
      (event.data && typeof event.data === 'object')
    ) {
      this.handleRawPayload(event.data);
    }
  }

  private readonly handleWindowMessage = (event: MessageEvent) => {
    if (this.disposed || !isTrustedWindowMessage(event, this.allowedOrigins)) return;
    this.processMessageEvent(event);
  };

  private readonly handleHostListenerMessage = (event: MessageEvent) => {
    if (this.disposed) return;
    this.processMessageEvent(event);
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
      if (msg.error) {
        const rpcErr = new BridgeRpcError(
          msg.error.code,
          pending.method,
          msg.error.message,
          msg.error.data,
        );
        this.tracer.rpcError(
          pending.transport,
          msg.id,
          pending.method,
          pending.startedAt,
          rpcErr.message,
          {
            code: msg.error.code,
          },
        );
        pending.reject(rpcErr);
      } else {
        this.tracer.rpcOk(pending.transport, msg.id, pending.method, pending.startedAt, msg.result);
        pending.resolve(msg.result);
      }
      return;
    }

    if (typeof msg.event === 'string') {
      if (msg.event === 'host.ready') this.handshake.record(msg.payload);
      this.tracer.eventIn(this.getTraceTransport(), msg.event, msg.payload);
      dispatchEventListeners(this.listeners, msg.event, msg.payload);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending.entries()) {
      window.clearTimeout(pending.timer);
      const error = `${reason} ("${id}")`;
      this.tracer.rpcError(pending.transport, id, pending.method, pending.startedAt, error);
      pending.reject(new Error(error));
    }
    this.pending.clear();
  }

  private async postRaw(payload: string): Promise<void> {
    if (this.portChannel.send(payload)) return;
    const host = typeof window !== 'undefined' ? window.__POCHITA_HOST__ : undefined;
    if (typeof host?.postMessage === 'function') {
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
    const transport = this.getTraceTransport();
    const request: RpcRequest = { jsonrpc: '2.0', id, method, params };

    const serialized = JSON.stringify(request);
    const waitMs = timeoutMs ?? this.defaultTimeoutMs;
    this.tracer.rpcStart(transport, id, method, startedAt, params);

    const promise = new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pending.delete(id)) {
          this.portChannel.evict(serialized);
          const error = `RPC "${method}" timed out after ${waitMs}ms`;
          this.tracer.rpcError(transport, id, method, startedAt, error, { timedOut: true });
          reject(new Error(error));
        }
      }, waitMs);

      this.pending.set(id, {
        method,
        startedAt,
        transport,
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
      });
    });
    // Prevent unhandled rejection if pending entry is rejected before postRaw settles.
    promise.catch(() => {});

    try {
      await this.postRaw(serialized);
    } catch (err) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        window.clearTimeout(pending.timer);
        const error = err instanceof Error ? err : new Error(String(err));
        this.tracer.rpcError(transport, id, method, startedAt, error.message);
        throw error;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    return promise;
  }

  async sendContainerAction(action: ContainerAction): Promise<void> {
    await this.invoke('container.action', action);
  }

  getChannelKind(): BridgeChannelKind {
    if (this.portChannel.hasPort()) return 'port';
    const host = typeof window !== 'undefined' ? window.__POCHITA_HOST__ : undefined;
    if (typeof host?.postMessage === 'function') {
      return typeof host.addEventListener === 'function' ? 'web-message-listener' : 'js-interface';
    }
    return 'ws';
  }

  getHostHandshake = (): HostHandshakePayload | null => this.handshake.get();
  waitForHostReady = (timeoutMs?: number): Promise<HostHandshakePayload> =>
    this.handshake.wait(timeoutMs);
  getRecentTraces = (limit?: number): BridgeTraceEvent[] => this.tracer.getRecentTraces(limit);
  getTraceStore = (): BridgeTraceStore => this.tracer.getStore();
  subscribe = (event: string, listener: HostEventListener): (() => void) =>
    subscribeEventListener(this.listeners, event, listener);

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

  dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined')
      window.removeEventListener('message', this.handleWindowMessage);
    this.boundHostListener?.removeEventListener?.('message', this.handleHostListenerMessage);
    this.boundHostListener = null;
    this.portChannel.dispose();
    this.wsChannel.dispose();
    this.handshake.dispose('Transport disposed before host.ready handshake arrived');
    this.rejectAllPending('Transport disposed before request settled');
    this.listeners.clear();
  }
}
