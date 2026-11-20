import type { ThemeSyncPayload } from './types.ts';

/**
 * Builds a deterministic serialization key for a ThemeSyncPayload
 * to deduplicate host synchronization events.
 */
export function buildThemeSyncKey(payload: ThemeSyncPayload): string {
  return `${payload.themeId}|${payload.colorScheme}|${payload.wantsNativeBlur}|${payload.cornerRadiusPx}`;
}
