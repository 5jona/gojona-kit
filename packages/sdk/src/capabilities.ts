import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';
import { parsePanelVisibilityEvent, shouldPollTelemetry } from './parsers.ts';
import type { GraphicsCapabilities, PluginBusEventPayload, TelemetrySnapshot } from './types.ts';

export { shouldPollTelemetry };

interface NavigatorWithGpu {
  gpu?: {
    requestAdapter?: () => Promise<{
      info?: { vendor?: string; architecture?: string; description?: string };
    } | null>;
  };
}

function probeSyncGraphics(): GraphicsCapabilities {
  if (typeof window === 'undefined') {
    return {
      webgpu: false,
      webgpuAdapterReady: false,
      gpuAdapterInfo: null,
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
      webgl2: false,
      devicePixelRatio: 1,
    };
  }
  const nav = navigator as unknown as NavigatorWithGpu;
  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    webgl2 = Boolean(canvas.getContext('webgl2'));
  } catch {
    webgl2 = false;
  }
  return {
    webgpu: typeof nav.gpu !== 'undefined',
    webgpuAdapterReady: false,
    gpuAdapterInfo: null,
    crossOriginIsolated: Boolean(window.crossOriginIsolated),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webgl2,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Probes WebGPU, COOP/COEP cross-origin isolation, SharedArrayBuffer, WebGL2, and DPR
 * so WASM/Vello plugins can select full GPU `vello` or seamlessly degrade to Canvas2D/`vello_cpu`.
 */
export function useGraphicsCapabilities(): GraphicsCapabilities {
  const [caps, setCaps] = useState<GraphicsCapabilities>(() => probeSyncGraphics());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const nav = navigator as unknown as NavigatorWithGpu;
    const req = nav.gpu?.requestAdapter;
    if (typeof req !== 'function') return;

    void req
      .call(nav.gpu)
      .then((adapter) => {
        if (cancelled || !adapter) return;
        const info = adapter.info;
        const label =
          [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' ') ||
          'WebGPU Adapter';
        setCaps((prev) => ({
          ...prev,
          webgpu: true,
          webgpuAdapterReady: true,
          gpuAdapterInfo: label,
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return caps;
}

/**
 * Publishes and subscribes to inter-plugin bus messages (`inter-plugin-bus` capability).
 */
export function useInterPluginBus<T = unknown>(
  topic: string,
  onMessage?: (event: PluginBusEventPayload<T>) => void,
): { publish: (payload: T) => Promise<void> } {
  const { bridge } = useSideVeilPlugin();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const hasHandler = Boolean(onMessage);

  useEffect(() => {
    if (!hasHandler) return;
    return bridge.onHostEvent('plugin.busMessage', (raw) => {
      if (raw && typeof raw === 'object') {
        const msg = raw as PluginBusEventPayload<T>;
        if (msg.topic === topic) {
          handlerRef.current?.(msg);
        }
      }
    });
  }, [bridge, topic, hasHandler]);

  const publish = useCallback(
    async (payload: T) => {
      await bridge.invoke('plugin.busPublish', { topic, payload });
    },
    [bridge, topic],
  );

  return useMemo(() => ({ publish }), [publish]);
}

/**
 * Polls zero-subprocess Linux host telemetry (`telemetry` capability), automatically
 * pausing periodic polling whenever the SideVeil panel or document is hidden.
 */
export function useTelemetry(intervalMs = 0): {
  snapshot: TelemetrySnapshot | null;
  refresh: () => Promise<TelemetrySnapshot | null>;
} {
  const { bridge } = useSideVeilPlugin();
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document === 'undefined' ? false : Boolean(document.hidden),
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return bridge.onHostEvent('panel.visibility', (raw) => {
      const next = parsePanelVisibilityEvent(raw);
      if (next !== null) {
        setPanelVisible(next);
      }
    });
  }, [bridge]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibilityChange = () => {
      setDocumentHidden(Boolean(document.hidden));
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const refresh = useCallback(async (): Promise<TelemetrySnapshot | null> => {
    try {
      const next = await bridge.invoke<TelemetrySnapshot>('telemetry.snapshot');
      if (mountedRef.current) {
        setSnapshot(next);
      }
      return next;
    } catch {
      return null;
    }
  }, [bridge]);

  const active = shouldPollTelemetry(intervalMs, panelVisible, documentHidden);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(
      () => {
        void refresh();
      },
      Math.max(250, intervalMs),
    );
    return () => clearInterval(timer);
  }, [active, intervalMs, refresh]);

  return useMemo(() => ({ snapshot, refresh }), [snapshot, refresh]);
}

export interface UseClipboardApi {
  /** Reads plain text via host `clipboard.get` RPC (`clipboard` capability) with Web Clipboard fallback. */
  readText: () => Promise<string | null>;
  /** Writes plain text via host `clipboard.set` RPC (`clipboard` capability) with Web Clipboard fallback. */
  writeText: (text: string) => Promise<boolean>;
}

/**
 * Provides host-backed clipboard access (`clipboard.get` / `clipboard.set`) suitable for
 * unfocused Android overlay WebViews where `navigator.clipboard` may reject.
 */
export function useClipboard(): UseClipboardApi {
  const { bridge } = useSideVeilPlugin();

  const writeText = useCallback(
    async (text: string): Promise<boolean> => {
      if (bridge.env === 'host') {
        try {
          await bridge.invoke('clipboard.set', { text });
          return true;
        } catch {
          // Fall through to browser Clipboard API if capability or host RPC fails.
        }
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        // Fall through to mock/non-host bridge invocation below.
      }
      if (bridge.env !== 'host') {
        try {
          await bridge.invoke('clipboard.set', { text });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    [bridge],
  );

  const readText = useCallback(async (): Promise<string | null> => {
    if (bridge.env === 'host') {
      try {
        const res = await bridge.invoke<{ text?: unknown }>('clipboard.get');
        return typeof res?.text === 'string' ? res.text : '';
      } catch {
        // Fall through to browser Clipboard API.
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch {
      // Fall through to mock/non-host bridge invocation below.
    }
    if (bridge.env !== 'host') {
      try {
        const res = await bridge.invoke<{ text?: unknown }>('clipboard.get');
        return typeof res?.text === 'string' ? res.text : null;
      } catch {
        return null;
      }
    }
    return null;
  }, [bridge]);

  return useMemo(() => ({ readText, writeText }), [readText, writeText]);
}
