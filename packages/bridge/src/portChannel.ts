/**
 * Validates whether a `window` `MessageEvent` originates from a trusted host or
 * a native Android WebView `postWebMessage` `MessagePort` transfer.
 */
export function isTrustedWindowMessage(
  event: MessageEvent,
  allowedOrigins?: readonly string[],
): boolean {
  const hasTransferredPort = Boolean(event.ports && event.ports.length > 0);
  const isNativePortTransfer =
    hasTransferredPort &&
    event.origin === '' &&
    event.source === null &&
    (event.data === '' || event.data === null || event.data === undefined);
  if (isNativePortTransfer) {
    return true;
  }

  if (allowedOrigins && allowedOrigins.length > 0) {
    return allowedOrigins.includes(event.origin);
  }

  const currentOrigin = typeof window !== 'undefined' ? window.location?.origin : '';
  if (!currentOrigin || currentOrigin === 'null') {
    return event.source === window;
  }

  return event.origin === currentOrigin && (event.source === window || event.source === null);
}

/**
 * Manages a dedicated `MessagePort` channel with clean replacement on host reinstall
 * and automatic flushing of queued outgoing messages.
 */
export class PortChannel {
  private port: MessagePort | null = null;
  private readonly queuedPayloads: string[] = [];

  hasPort(): boolean {
    return this.port !== null;
  }

  attachPort(nextPort: MessagePort, onRawPayload: (raw: unknown) => void): void {
    if (this.port && this.port !== nextPort) {
      this.closeCurrentPort();
    }
    this.port = nextPort;
    nextPort.onmessage = (portEvent) => onRawPayload(portEvent.data);
    nextPort.start();
    this.flushQueue();
  }

  send(payload: string): boolean {
    if (!this.port) {
      return false;
    }
    try {
      this.port.postMessage(payload);
      return true;
    } catch {
      this.closeCurrentPort();
      this.queuedPayloads.push(payload);
      return true;
    }
  }

  enqueue(payload: string): void {
    this.queuedPayloads.push(payload);
  }

  dispose(): void {
    this.closeCurrentPort();
    this.queuedPayloads.length = 0;
  }

  private closeCurrentPort(): void {
    if (!this.port) return;
    const prev = this.port;
    this.port = null;
    prev.onmessage = null;
    try {
      prev.close();
    } catch {
      // Ignore close errors on stale or already-closed ports.
    }
  }

  private flushQueue(): void {
    if (!this.port || this.queuedPayloads.length === 0) return;
    const pending = this.queuedPayloads.splice(0, this.queuedPayloads.length);
    for (let i = 0; i < pending.length; i += 1) {
      try {
        this.port.postMessage(pending[i]);
      } catch {
        this.closeCurrentPort();
        this.queuedPayloads.unshift(...pending.slice(i));
        return;
      }
    }
  }
}

/**
 * Manages lazy loopback WebSocket connection lifecycle with handshake timeouts
 * and clean disposal for `HostTransport`.
 */
export class WebSocketChannel {
  private readonly wsUrl?: string;
  private readonly timeoutMs: number;
  private readonly onMessage: (raw: unknown) => void;
  private readonly onClosed: () => void;

  private ws: WebSocket | null = null;
  private connectingWs: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private disposed = false;

  constructor(options: {
    wsUrl?: string;
    timeoutMs: number;
    onMessage: (raw: unknown) => void;
    onClosed: () => void;
  }) {
    this.wsUrl = options.wsUrl;
    this.timeoutMs = options.timeoutMs;
    this.onMessage = options.onMessage;
    this.onClosed = options.onClosed;
  }

  hasUrl(): boolean {
    return Boolean(this.wsUrl);
  }

  async send(payload: string): Promise<void> {
    const socket = await this.ensureOpen();
    socket.send(payload);
  }

  private async ensureOpen(): Promise<WebSocket> {
    if (this.disposed) {
      throw new Error('HostTransport has been disposed');
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    const wsUrl = this.wsUrl;
    if (!wsUrl) {
      throw new Error('Embedded host transport unavailable');
    }

    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      this.connectingWs = socket;
      let settled = false;

      const connectTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.connectingWs === socket) this.connectingWs = null;
        this.connectPromise = null;
        try {
          socket.close();
        } catch {
          // Ignore close errors on connecting socket.
        }
        reject(new Error(`Host WebSocket connection timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      socket.onopen = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) this.connectingWs = null;
        if (this.disposed) {
          settled = true;
          this.connectPromise = null;
          socket.close();
          reject(new Error('HostTransport disposed during WebSocket handshake'));
          return;
        }
        settled = true;
        this.ws = socket;
        this.connectPromise = null;
        resolve(socket);
      };
      socket.onmessage = (ev) => this.onMessage(ev.data);
      socket.onerror = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) this.connectingWs = null;
        this.connectPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to connect host WebSocket at ${wsUrl}`));
        }
      };
      socket.onclose = () => {
        window.clearTimeout(connectTimer);
        if (this.connectingWs === socket) this.connectingWs = null;
        if (this.ws === socket) this.ws = null;
        this.connectPromise = null;
        if (!settled) {
          settled = true;
          reject(new Error(`Host WebSocket closed during handshake at ${wsUrl}`));
        }
        this.onClosed();
      };
    });

    return this.connectPromise;
  }

  dispose(): void {
    this.disposed = true;
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
    this.connectPromise = null;
  }
}
