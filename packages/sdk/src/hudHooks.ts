import type { ContainerEdgeStatus } from '@gojona/bridge/core';
import {
  applyDynamicCssTokens,
  clearDynamicCssTokens,
  isAllowedDynamicCssToken,
} from '@gojona/ui/theme-tokens';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEdgeStatusController, type EdgeStatusController } from './edgeStatusCore.ts';
import { useSideVeilPlugin } from './PluginContext.ts';
import type { NativeHudScene } from './types.ts';

export { createEdgeStatusController, type EdgeStatusController };

/**
 * Updates live micro-status badges/progress displayed on the SideVeil edge handle,
 * clearing status on unmount only if this hook instance set an active status.
 */
export function useEdgeStatus(): {
  setStatus: (status: ContainerEdgeStatus) => Promise<void>;
  clearStatus: () => Promise<void>;
} {
  const { bridge } = useSideVeilPlugin();
  const controller = useMemo(() => createEdgeStatusController(bridge), [bridge]);

  const setStatus = useCallback(
    async (status: ContainerEdgeStatus) => {
      await controller.setStatus(status);
    },
    [controller],
  );

  const clearStatus = useCallback(async () => {
    await controller.clearStatus();
  }, [controller]);

  useEffect(() => {
    return () => {
      controller.cleanupOnUnmount();
    };
  }, [controller]);

  return useMemo(() => ({ setStatus, clearStatus }), [setStatus, clearStatus]);
}

/**
 * Pushes declarative `NativeHudScene` updates to the zero-WebView `vello_cpu` NEON native HUD
 * (requires `native-hud` capability in `manifest.json`).
 */
export function useNativeHud(): {
  updateScene: (scene: NativeHudScene) => Promise<void>;
  dismiss: () => Promise<void>;
} {
  const { bridge, pluginId } = useSideVeilPlugin();

  const updateScene = useCallback(
    async (scene: NativeHudScene) => {
      await bridge.invoke('hud.updateScene', {
        ...scene,
        pluginId: scene.pluginId ?? pluginId,
      });
    },
    [bridge, pluginId],
  );

  const dismiss = useCallback(async () => {
    await bridge.invoke('hud.dismiss', { pluginId });
  }, [bridge, pluginId]);

  return useMemo(() => ({ updateScene, dismiss }), [updateScene, dismiss]);
}

/**
 * Applies host-synthesized Material You `Oklch` CSS custom properties (`theme.paletteUpdated`)
 * via `@gojona/ui`'s `applyDynamicCssTokens`/`clearDynamicCssTokens` and returns the
 * currently active dynamic token map.
 */
export function useDynamicThemeState(enabled = true): Readonly<Record<string, string>> {
  const { bridge } = useSideVeilPlugin();
  const [tokens, setTokens] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (!enabled) {
      setTokens({});
      return;
    }
    const appliedKeys = new Set<string>();
    const unsubscribe = bridge.onThemePalette((palette) => {
      const nextMap: Record<string, string> = {};
      for (const [key, value] of Object.entries(palette.cssTokens)) {
        if (isAllowedDynamicCssToken(key) && typeof value === 'string' && value.trim().length > 0) {
          nextMap[key] = value.trim();
        }
      }
      const nextKeys = new Set(Object.keys(nextMap));
      const staleKeys: string[] = [];
      for (const prevKey of appliedKeys) {
        if (!nextKeys.has(prevKey)) {
          staleKeys.push(prevKey);
          appliedKeys.delete(prevKey);
        }
      }
      if (staleKeys.length > 0) {
        clearDynamicCssTokens(staleKeys);
      }
      const applied = applyDynamicCssTokens(nextMap);
      for (const key of applied) {
        appliedKeys.add(key);
      }
      for (const key of nextKeys) {
        appliedKeys.add(key);
      }
      setTokens(nextMap);
    });
    return () => {
      unsubscribe();
      clearDynamicCssTokens(Array.from(appliedKeys));
      setTokens({});
    };
  }, [bridge, enabled]);

  return tokens;
}

/**
 * Applies host-synthesized Material You `Oklch` CSS custom properties (`theme.paletteUpdated`)
 * directly to `document.documentElement`, cleaning up injected overrides on unmount.
 */
export function useDynamicThemeTokens(enabled = true): void {
  useDynamicThemeState(enabled);
}
