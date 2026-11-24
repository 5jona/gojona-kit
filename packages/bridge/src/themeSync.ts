import { useCallback, useMemo } from 'react';
import { useBridge } from './BridgeProvider.tsx';
import {
  type ContainerThemeSyncOptions,
  createThemeSyncDeduplicator,
  type ThemeSyncDeduplicator,
} from './themeSyncCore.ts';
import type { ContainerThemeSyncPayload } from './types.ts';

export { type ContainerThemeSyncOptions, createThemeSyncDeduplicator, type ThemeSyncDeduplicator };

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
