import { useCallback, useMemo } from 'react';
import { useBridge } from './BridgeProvider.tsx';
import type { ContainerThemeSyncPayload } from './types.ts';

export interface ContainerThemeSyncOptions {
  includeAppearanceHints?: boolean;
}

export interface ThemeSyncDeduplicator {
  sync: (payload: ContainerThemeSyncPayload) => void;
  reset: () => void;
}

/**
 * Creates a deduplicator that suppresses consecutive identical container theme sync payloads.
 */
export function createThemeSyncDeduplicator(
  send: (payload: ContainerThemeSyncPayload) => void | Promise<void>,
  options?: ContainerThemeSyncOptions,
): ThemeSyncDeduplicator {
  let lastKey: string | null = null;
  const includeAppearanceHints = options?.includeAppearanceHints ?? true;

  const sync = (payload: ContainerThemeSyncPayload): void => {
    const out: ContainerThemeSyncPayload = includeAppearanceHints
      ? {
          themeId: payload.themeId,
          colorScheme: payload.colorScheme,
          ...(payload.wantsNativeBlur !== undefined
            ? { wantsNativeBlur: payload.wantsNativeBlur }
            : {}),
          ...(payload.cornerRadiusPx !== undefined
            ? { cornerRadiusPx: payload.cornerRadiusPx }
            : {}),
        }
      : {
          themeId: payload.themeId,
          colorScheme: payload.colorScheme,
        };

    const key = `${out.themeId}|${out.colorScheme}|${out.wantsNativeBlur ?? ''}|${out.cornerRadiusPx ?? ''}`;
    if (key === lastKey) {
      return;
    }
    lastKey = key;
    void send(out);
  };

  const reset = (): void => {
    lastKey = null;
  };

  return { sync, reset };
}

/**
 * React hook providing a stable callback for `<ThemeProvider onThemeSync={...} />`.
 * Wraps `createThemeSyncDeduplicator` and delegates to `bridge.sendContainerAction({ type: 'syncTheme', payload })`.
 */
export function useContainerThemeSync(
  options?: ContainerThemeSyncOptions,
): (payload: ContainerThemeSyncPayload) => void {
  const bridge = useBridge();
  const includeAppearanceHints = options?.includeAppearanceHints ?? true;

  const deduplicator = useMemo(
    () =>
      createThemeSyncDeduplicator(
        (payload) => {
          void bridge.sendContainerAction({ type: 'syncTheme', payload }).catch(() => {});
        },
        { includeAppearanceHints },
      ),
    [bridge, includeAppearanceHints],
  );

  return useCallback(
    (payload: ContainerThemeSyncPayload) => {
      deduplicator.sync(payload);
    },
    [deduplicator],
  );
}
