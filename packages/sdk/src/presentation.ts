import type { ContainerPinnedBounds, ContainerPresentationMode } from '@pochita/bridge';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSideVeilPlugin } from './PluginContext.ts';

export type HapticKind = 'tick' | 'click' | 'heavy' | 'cancel';

export interface ContainerPresentationChangedPayload {
  mode: ContainerPresentationMode;
}

export interface ContainerClickThroughChangedPayload {
  clickThrough: boolean;
}

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

const VALID_PRESENTATION_MODES: ReadonlySet<string> = new Set<ContainerPresentationMode>([
  'drawer',
  'peek',
  'pinned',
  'wide',
  'native-hud',
]);

/**
 * Safely parses a `container.presentationChanged` host event payload.
 */
export function parsePresentationChangedEvent(payload: unknown): ContainerPresentationMode | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as Partial<ContainerPresentationChangedPayload>).mode;
  return typeof candidate === 'string' && VALID_PRESENTATION_MODES.has(candidate)
    ? (candidate as ContainerPresentationMode)
    : null;
}

/**
 * Safely parses a `container.clickThroughChanged` host event payload.
 */
export function parseClickThroughChangedEvent(payload: unknown): boolean | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as Partial<ContainerClickThroughChangedPayload>).clickThrough;
  return typeof candidate === 'boolean' ? candidate : null;
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
