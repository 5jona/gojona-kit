import type {
  ContainerBackdrop,
  ContainerEdgeStatus,
  ContainerPinnedBounds,
  ContainerPresentationMode,
  ContainerThemeSyncPayload,
} from '@gojona/bridge';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';
import type { UseContainerActionApi } from './types.ts';

/**
 * Access container control actions for the host window overlay.
 */
export function useContainerAction(): UseContainerActionApi {
  const { bridge } = useSideVeilPlugin();

  const dismiss = useCallback(async () => {
    await bridge.sendContainerAction({ type: 'dismiss' });
  }, [bridge]);

  const requestImeFocus = useCallback(
    async (focused: boolean) => {
      await bridge.sendContainerAction({ type: 'requestImeFocus', focused });
    },
    [bridge],
  );

  const setPreferredSize = useCallback(
    async (size: { widthDp?: number; heightDp?: number; heightPercent?: number }) => {
      await bridge.sendContainerAction({ type: 'setPreferredSize', ...size });
    },
    [bridge],
  );

  const setBackIntercept = useCallback(
    async (enabled: boolean) => {
      await bridge.sendContainerAction({ type: 'setBackIntercept', enabled });
    },
    [bridge],
  );

  const setSurfaceBackdrop = useCallback(
    async (backdrop: ContainerBackdrop) => {
      await bridge.sendContainerAction({ type: 'setSurfaceBackdrop', backdrop });
    },
    [bridge],
  );

  const setPresentationMode = useCallback(
    async (mode: ContainerPresentationMode) => {
      await bridge.sendContainerAction({ type: 'setPresentationMode', mode });
    },
    [bridge],
  );

  const setPinnedBounds = useCallback(
    async (bounds: ContainerPinnedBounds) => {
      await bridge.sendContainerAction({ type: 'setPinnedBounds', ...bounds });
    },
    [bridge],
  );

  const setEdgeStatus = useCallback(
    async (status: ContainerEdgeStatus | null) => {
      await bridge.sendContainerAction({ type: 'setEdgeStatus', status });
    },
    [bridge],
  );

  const syncTheme = useCallback(
    async (payload: ContainerThemeSyncPayload) => {
      await bridge.sendContainerAction({ type: 'syncTheme', payload });
    },
    [bridge],
  );

  return useMemo(
    () => ({
      dismiss,
      requestImeFocus,
      setPreferredSize,
      setBackIntercept,
      setSurfaceBackdrop,
      setPresentationMode,
      setPinnedBounds,
      setEdgeStatus,
      syncTheme,
    }),
    [
      dismiss,
      requestImeFocus,
      setPreferredSize,
      setBackIntercept,
      setSurfaceBackdrop,
      setPresentationMode,
      setPinnedBounds,
      setEdgeStatus,
      syncTheme,
    ],
  );
}

/**
 * Intercept hardware back button / back gesture in the host window.
 * When enabled, the host delegates back presses to this callback instead of dismissing the panel.
 */
export function useBackPress(handler: () => void, enabled = true): void {
  const { bridge } = useSideVeilPlugin();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    void bridge.sendContainerAction({ type: 'setBackIntercept', enabled: true }).catch(() => {});

    const unsubscribe = bridge.onBackPressed(() => {
      handlerRef.current();
    });

    return () => {
      unsubscribe();
      void bridge.sendContainerAction({ type: 'setBackIntercept', enabled: false }).catch(() => {});
    };
  }, [bridge, enabled]);
}
