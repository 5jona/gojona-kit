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
