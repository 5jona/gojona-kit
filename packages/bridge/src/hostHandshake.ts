import { SIDEVEIL_PROTOCOL_VERSIONS } from './generated/sideveilConstants.ts';

/**
 * Sends the deterministic `host.attach` bootstrap message over an origin-pinned
 * `WebViewCompat.addWebMessageListener` global so Android Render Host immediately
 * binds `replyProxy` and emits `host.ready`.
 */
export function sendHostAttachBootstrap(host: { postMessage?: (message: string) => void }): void {
  if (typeof host.postMessage !== 'function') return;
  try {
    host.postMessage(
      JSON.stringify({
        event: 'host.attach',
        channel: 'listener',
        protocolVersion: SIDEVEIL_PROTOCOL_VERSIONS.PROTOCOL_VERSION,
      }),
    );
  } catch {
    // Ignore bootstrap attach failures; subsequent RPCs will bind replyProxy.
  }
}

/**
 * Host capability and protocol handshake payload delivered via the `host.ready` event
 * when an embedded WebView bridge attaches.
 */
export interface HostHandshakePayload {
  protocolVersion: number;
  apiVersion: number;
  pluginId: string;
  grantedCapabilities: string[];
}

interface PendingWaiter {
  resolve: (handshake: HostHandshakePayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Validates and normalizes a raw `host.ready` event payload into a `HostHandshakePayload`.
 */
export function parseHostHandshake(raw: unknown): HostHandshakePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const protocolVersion = record.protocolVersion;
  const apiVersion = record.apiVersion;
  const pluginId = record.pluginId;
  if (
    typeof protocolVersion !== 'number' ||
    !Number.isFinite(protocolVersion) ||
    typeof apiVersion !== 'number' ||
    !Number.isFinite(apiVersion) ||
    typeof pluginId !== 'string' ||
    pluginId.trim().length === 0
  ) {
    return null;
  }
  const grantedCapabilities = Array.isArray(record.grantedCapabilities)
    ? record.grantedCapabilities.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    protocolVersion,
    apiVersion,
    pluginId: pluginId.trim(),
    grantedCapabilities,
  };
}

/**
 * Caches the latest `host.ready` handshake payload and resolves pending `wait()` callers.
 */
export class HostHandshakeTracker {
  private latest: HostHandshakePayload | null = null;
  private readonly waiters = new Set<PendingWaiter>();
  private disposed = false;

  get(): HostHandshakePayload | null {
    return this.latest
      ? { ...this.latest, grantedCapabilities: [...this.latest.grantedCapabilities] }
      : null;
  }

  record(raw: unknown): HostHandshakePayload | null {
    const parsed = parseHostHandshake(raw);
    if (!parsed) return null;
    this.latest = parsed;
    if (this.waiters.size > 0) {
      const snapshot = this.get() as HostHandshakePayload;
      for (const waiter of Array.from(this.waiters)) {
        this.waiters.delete(waiter);
        if (waiter.timer !== null) clearTimeout(waiter.timer);
        waiter.resolve(snapshot);
      }
    }
    return this.get();
  }

  wait(timeoutMs = 5000): Promise<HostHandshakePayload> {
    if (this.latest) {
      return Promise.resolve(this.get() as HostHandshakePayload);
    }
    if (this.disposed) {
      return Promise.reject(new Error('Bridge disposed before host.ready handshake arrived'));
    }
    return new Promise<HostHandshakePayload>((resolve, reject) => {
      const waiter: PendingWaiter = { resolve, reject, timer: null };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          if (this.waiters.delete(waiter)) {
            reject(new Error(`Timed out waiting for host.ready handshake after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }
      this.waiters.add(waiter);
    });
  }

  dispose(reason = 'Transport disposed before host.ready handshake arrived'): void {
    this.disposed = true;
    for (const waiter of Array.from(this.waiters)) {
      this.waiters.delete(waiter);
      if (waiter.timer !== null) clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
  }
}
