import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSideveilPlugin } from './PluginContext.ts';
import type { GraphicsCapabilities, PluginBusEventPayload, TelemetrySnapshot } from './types.ts';

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
  const { bridge } = useSideveilPlugin();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!onMessage) return;
    return bridge.onHostEvent('plugin.busMessage', (raw) => {
      if (raw && typeof raw === 'object') {
        const msg = raw as PluginBusEventPayload<T>;
        if (msg.topic === topic) {
          handlerRef.current?.(msg);
        }
      }
    });
  }, [bridge, topic, onMessage]);

  const publish = useCallback(
    async (payload: T) => {
      await bridge.invoke('plugin.busPublish', { topic, payload });
    },
    [bridge, topic],
  );

  return useMemo(() => ({ publish }), [publish]);
}

/**
 * Polls zero-subprocess Linux host telemetry (`telemetry` capability).
 */
export function useTelemetry(intervalMs = 0): {
  snapshot: TelemetrySnapshot | null;
  refresh: () => Promise<TelemetrySnapshot | null>;
} {
  const { bridge } = useSideveilPlugin();
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);

  const refresh = useCallback(async (): Promise<TelemetrySnapshot | null> => {
    try {
      const next = await bridge.invoke<TelemetrySnapshot>('telemetry.snapshot');
      setSnapshot(next);
      return next;
    } catch {
      return null;
    }
  }, [bridge]);

  useEffect(() => {
    if (intervalMs <= 0) return;
    void refresh();
    const timer = setInterval(
      () => {
        void refresh();
      },
      Math.max(250, intervalMs),
    );
    return () => clearInterval(timer);
  }, [intervalMs, refresh]);

  return useMemo(() => ({ snapshot, refresh }), [snapshot, refresh]);
}
