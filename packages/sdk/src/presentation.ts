import type { ContainerPinnedBounds, ContainerPresentationMode } from '@gojona/bridge/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';
import {
  type ContainerClickThroughChangedPayload,
  type ContainerPresentationChangedPayload,
  type HapticKind,
  parseClickThroughChangedEvent,
  parsePresentationChangedEvent,
} from './parsers.ts';

export {
  type ContainerClickThroughChangedPayload,
  type ContainerPresentationChangedPayload,
  type HapticKind,
  parseClickThroughChangedEvent,
  parsePresentationChangedEvent,
};

export interface UsePresentationModeApi {
  mode: ContainerPresentationMode;
  isPinned: boolean;
  clickThrough: boolean;
  setMode: (
    nextMode: ContainerPresentationMode,
    pinnedBounds?: ContainerPinnedBounds,
  ) => Promise<void>;
  setPinnedBounds: (bounds: ContainerPinnedBounds) => Promise<void>;
  setClickThrough: (enabled: boolean) => Promise<void>;
}

/**
 * Synchronizes plugin presentation mode (`drawer`, `pinned`, etc.) and pinned click-through
 * lock state bidirectionally with the SideVeil Android host.
 */
export function usePresentationMode(
  initialMode?: ContainerPresentationMode,
): UsePresentationModeApi {
  const { bridge, manifest } = useSideVeilPlugin();
  const [mode, setModeState] = useState<ContainerPresentationMode>(
    () => initialMode ?? manifest?.surface?.presentation ?? 'drawer',
  );
  const [clickThrough, setClickThroughState] = useState(false);

  useEffect(() => {
    const unsubPresentation = bridge.onHostEvent('container.presentationChanged', (raw) => {
      const nextMode = parsePresentationChangedEvent(raw);
      if (!nextMode) return;
      setModeState(nextMode);
      if (nextMode !== 'pinned') {
        setClickThroughState(false);
      }
    });

    const unsubClickThrough = bridge.onHostEvent('container.clickThroughChanged', (raw) => {
      const nextClickThrough = parseClickThroughChangedEvent(raw);
      if (nextClickThrough === null) return;
      setClickThroughState(nextClickThrough);
    });

    return () => {
      unsubPresentation();
      unsubClickThrough();
    };
  }, [bridge]);

  const setPinnedBounds = useCallback(
    async (bounds: ContainerPinnedBounds) => {
      if (typeof bounds.clickThrough === 'boolean') {
        setClickThroughState(bounds.clickThrough);
      }
      await bridge.sendContainerAction({ type: 'setPinnedBounds', ...bounds });
    },
    [bridge],
  );

  const setMode = useCallback(
    async (nextMode: ContainerPresentationMode, pinnedBounds?: ContainerPinnedBounds) => {
      setModeState(nextMode);
      if (nextMode !== 'pinned') {
        setClickThroughState(false);
      } else if (pinnedBounds) {
        if (typeof pinnedBounds.clickThrough === 'boolean') {
          setClickThroughState(pinnedBounds.clickThrough);
        }
        await bridge.sendContainerAction({ type: 'setPinnedBounds', ...pinnedBounds });
      }
      await bridge.sendContainerAction({ type: 'setPresentationMode', mode: nextMode });
    },
    [bridge],
  );

  const setClickThrough = useCallback(
    async (enabled: boolean) => {
      setClickThroughState(enabled);
      await bridge.sendContainerAction({ type: 'setPinnedBounds', clickThrough: enabled });
    },
    [bridge],
  );

  return useMemo(
    () => ({
      mode,
      isPinned: mode === 'pinned',
      clickThrough,
      setMode,
      setPinnedBounds,
      setClickThrough,
    }),
    [mode, clickThrough, setMode, setPinnedBounds, setClickThrough],
  );
}

/**
 * Triggers host-local haptic feedback (`haptics` capability in `manifest.json`).
 * Errors are suppressed so optional tactile feedback never breaks interactive controls.
 */
export function useHaptics(): { trigger: (kind?: HapticKind) => Promise<void> } {
  const { bridge } = useSideVeilPlugin();

  const trigger = useCallback(
    async (kind: HapticKind = 'tick') => {
      try {
        await bridge.invoke('haptics.trigger', { kind });
      } catch {
        // Haptics are optional sensory feedback.
      }
    },
    [bridge],
  );

  return useMemo(() => ({ trigger }), [trigger]);
}
