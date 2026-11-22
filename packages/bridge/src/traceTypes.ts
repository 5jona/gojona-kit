export type BridgeTraceKind =
  | 'rpc.start'
  | 'rpc.ok'
  | 'rpc.error'
  | 'event.in'
  | 'port.installed'
  | 'port.replaced';

export type BridgeTracePhase = 'request' | 'response' | 'error' | 'event' | 'lifecycle' | 'timeout';

export type BridgeTraceTransport =
  | 'port'
  | 'host'
  | 'mock'
  | 'ksu'
  | 'ws'
  | 'js-interface'
  | 'unknown';

export type BridgeTraceStatus = 'pending' | 'ok' | 'error' | 'timeout' | 'event' | 'lifecycle';

export interface BridgeTraceEvent {
  id?: string;
  kind: BridgeTraceKind;
  phase: BridgeTracePhase;
  timestamp: number;
  timestampMs: number;
  transport: BridgeTraceTransport;
  method?: string;
  event?: string;
  durationMs?: number;
  ok?: boolean;
  status?: BridgeTraceStatus;
  error?: string;
  errorMessage?: string;
  code?: number;
  errorCode?: number | string;
  payloadPreview?: unknown;
}

export type BridgeTraceInput = Partial<Omit<BridgeTraceEvent, 'kind' | 'phase'>> &
  (
    | { kind: BridgeTraceKind; phase?: BridgeTracePhase }
    | { phase: BridgeTracePhase; kind?: BridgeTraceKind }
  );

export type BridgeTraceListener = (entry: BridgeTraceEvent) => void;

export interface BridgeTraceStoreOptions {
  maxEntries?: number;
  onTrace?: BridgeTraceListener;
}

export interface BridgeTraceStore {
  readonly maxEntries: number;
  push: (event: BridgeTraceInput) => BridgeTraceEvent;
  getEntries: (limit?: number) => BridgeTraceEvent[];
  clear: () => void;
  subscribe: (listener: BridgeTraceListener) => () => void;
  exportJson: (pretty?: boolean) => string;
  getTraceCount: () => number;
  getLastError: () => string | null;
  setLastError: (error: string | null) => void;
}
