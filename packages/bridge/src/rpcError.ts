import type { HostEvent, RpcResponse } from './types.ts';

/**
 * Structured JSON-RPC error returned by an embedded host or plugin backend,
 * preserving the numeric error `code`, RPC `method`, and optional structured `data`.
 */
export class BridgeRpcError extends Error {
  readonly code: number;
  readonly method: string;
  readonly data?: unknown;

  constructor(code: number, method: string, message: string, data?: unknown) {
    super(`${message} (code ${code})`);
    this.name = 'BridgeRpcError';
    this.code = code;
    this.method = method;
    this.data = data;
  }
}

/**
 * Parses an incoming raw WebView/WebSocket payload into a partial JSON-RPC response or host event.
 */
export function parseHostPayload(raw: unknown): Partial<RpcResponse & HostEvent> | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as Partial<RpcResponse & HostEvent>;
}
