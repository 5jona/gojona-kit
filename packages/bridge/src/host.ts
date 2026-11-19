import type {
  ContainerAction,
  HostEvent,
  HostEventListener,
  RpcRequest,
  RpcResponse,
} from './types.ts';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: number;
}

/**
 * Persistent JSON-RPC transport for embedded Android WebView containers.
 * Supports injected `MessagePort` / `window.__POCHITA_HOST__.postMessage` channels
 * and loopback WebSocket fallback with transparent reconnection.
 */
export class HostTransport {
  private readonly pending = new Map<string, PendingCall>();
  private readonly listeners = new Map<string, Set<HostEventListener>>();
  private readonly wsUrl?: string;
  private readonly defaultTimeoutMs: number;
  private readonly allowedOrigins?: string[];

  private port: MessagePort | null = null;
  private ws: WebSocket | null = null;
  private connectingWs: WebSocket | null = null;
  private wsConnectPromise: Promise<WebSocket> | null = null;
  private reqSeq = 0;
  private disposed = false;

  constructor(options: { wsUrl?: string; timeoutMs?: number; allowedOrigins?: string[] } = {}) {
    this.wsUrl =
      options.wsUrl ?? (typeof window !== 'undefined' ? window.__POCHITA_HOST__?.wsUrl : undefined);
    this.defaultTimeoutMs = options.timeoutMs ?? 8000;
    this.allowedOrigins = options.allowedOrigins;

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowMessage);
    }
  }

  private isTrustedMessageEvent(event: MessageEvent): boolean {
    if (this.allowedOrigins && this.allowedOrigins.length > 0) {
      return this.allowedOrigins.includes(event.origin);
    }

    const hasTransferredPort = Boolean(event.ports && event.ports.length > 0);
    const isNativePortTransfer =
      !this.port && hasTransferredPort && event.origin === '' && event.source === null;
    if (isNativePortTransfer) {
      return true;
    }

    const currentOrigin = typeof window !== 'undefined' ? window.location?.origin : '';
    if (!currentOrigin || currentOrigin === 'null') {
      return event.source === window;
    }

    return event.origin === currentOrigin && (event.source === window || event.source === null);
  }

  private readonly handleWindowMessage = (event: MessageEvent) => {
    if (this.disposed) return;
    if (!this.isTrustedMessageEvent(event)) return;

    // Accept an upgraded dedicated WebMessagePort transferred by an Android WebView host.
    if (event.ports && event.ports.length > 0 && !this.port) {
      const [transferredPort] = event.ports;
      this.port = transferredPort;
      transferredPort.onmessage = (portEvent) => this.handleRawPayload(portEvent.data);
      transferredPort.start();
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

      if (msg.error) {
        pending.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if (typeof msg.event === 'string') {
      const set = this.listeners.get(msg.event);
      if (!set) return;
      for (const listener of set) {
        listener(msg.payload);
      }
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending.entries()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(`${reason} ("${id}")`));
    }
    this.pending.clear();
  }

  private async ensureWebSocket(): Promise<WebSocket> {
    if (this.disposed) {
      throw new Error('HostTransport has been disposed');
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }
    if (this.wsConnectPromise) {
      return this.wsConnectPromise;
    }
    if (!this.wsUrl) {
      throw new Error('Embedded host transport unavailable');
    }

    this.wsConnectPromise = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl!);
      this.connectingWs = socket;
      let settled = false;

      const connectTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.connectingWs === socket) {
          this.connectingWs = null;
        }
        this.wsConnectPromise = null;
        try {
          socket.close();
        } catch {
          // Ignore close errors on connecting socket.
        }
        reject(new Error(`Host WebSocket connection timed out after ${this.defaultTimeoutMs}ms`));
      }, this.defaultTimeoutMs);

      socket.onopen = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) {
          this.connectingWs = null;
        }
        if (this.disposed) {
          settled = true;
          this.wsConnectPromise = null;
          socket.close();
          reject(new Error('HostTransport disposed during WebSocket handshake'));
          return;
        }
        settled = true;
        this.ws = socket;
        this.wsConnectPromise = null;
        resolve(socket);
      };
      socket.onmessage = (ev) => this.handleRawPayload(ev.data);
      socket.onerror = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) {
          this.connectingWs = null;
        }
        this.wsConnectPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to connect host WebSocket at ${this.wsUrl}`));
        }
      };
      socket.onclose = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) {
          this.connectingWs = null;
        }
        if (this.ws === socket) {
          this.ws = null;
        }
        this.wsConnectPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error(`Host WebSocket closed during handshake at ${this.wsUrl}`));
        }
        this.rejectAllPending('Host WebSocket connection closed');
      };
    });

    return this.wsConnectPromise;
  }

  private async postRaw(payload: string): Promise<void> {
    if (this.port) {
      this.port.postMessage(payload);
      return;
    }

    const host = typeof window !== 'undefined' ? window.__POCHITA_HOST__ : undefined;
    if (host && typeof host.postMessage === 'function') {
      host.postMessage(payload);
      return;
    }

    if (this.wsUrl) {
      const socket = await this.ensureWebSocket();
      socket.send(payload);
      return;
    }

    throw new Error('No MessagePort, host postMessage, or wsUrl configured');
  }

  async invoke<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (this.disposed) {
      throw new Error('HostTransport has been disposed');
    }

    const id = `rpc_${Date.now()}_${++this.reqSeq}`;
    const request: RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const waitMs = timeoutMs ?? this.defaultTimeoutMs;

    const promise = new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`RPC "${method}" timed out after ${waitMs}ms`));
        }
      }, waitMs);

      this.pending.set(id, {
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
      throw err instanceof Error ? err : new Error(String(err));
    }

    return promise;
  }

  async sendContainerAction(action: ContainerAction): Promise<void> {
    await this.invoke('container.action', action);
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
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    if (this.connectingWs) {
      try {
        this.connectingWs.close();
      } catch {
        // Ignore close errors on connecting socket.
      }
      this.connectingWs = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnectPromise = null;
    this.rejectAllPending('Transport disposed before request settled');
    this.listeners.clear();
  }
}
