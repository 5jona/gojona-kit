import type { RuntimeEnv } from './types.ts';

export interface DetectRuntimeOptions {
  /**
   * When true, `?env=host|ksu|mock|browser` overrides native globals.
   * When false, URL query parameter override is strictly disabled.
   * When omitted, query override is only honored in development builds when no native bridge global exists.
   */
  allowUrlOverride?: boolean;
  /** Legacy alias for allowUrlOverride */
  allowQueryOverride?: boolean;
}

function readQueryEnv(): RuntimeEnv | null {
  try {
    if (typeof window === 'undefined' || !window.location?.search) {
      return null;
    }
    const params = new URLSearchParams(window.location.search);
    const envParam = params.get('env');
    if (
      envParam === 'host' ||
      envParam === 'ksu' ||
      envParam === 'browser' ||
      envParam === 'mock'
    ) {
      return envParam === 'browser' ? 'mock' : (envParam as RuntimeEnv);
    }
  } catch {
    // Ignore malformed query strings in restricted sandboxes.
  }
  return null;
}

/**
 * Detects the active runtime cleanly across embedded host WebViews, KernelSU WebUI,
 * and standalone browser development previews / mocks.
 */
export function detectRuntime(options: DetectRuntimeOptions = {}): RuntimeEnv {
  if (typeof window === 'undefined') {
    return 'mock';
  }

  const allowOverride = options.allowUrlOverride ?? options.allowQueryOverride;

  if (allowOverride === true) {
    const forced = readQueryEnv();
    if (forced) return forced;
  }

  if (typeof window.__POCHITA_HOST__ !== 'undefined') {
    return 'host';
  }

  if (typeof window.ksu !== 'undefined' && typeof window.ksu.exec === 'function') {
    return 'ksu';
  }

  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

  if (allowOverride !== false && isDev) {
    const devOverride = readQueryEnv();
    if (devOverride) return devOverride;
  }

  return 'mock';
}

/**
 * Detects the active plugin identifier if running inside a Sideveil plugin container.
 * Inspects explicit override, window.__POCHITA_HOST__, and ?pluginId= URL parameter.
 */
export function detectPluginId(override?: string): string | null {
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  if (typeof window === 'undefined') {
    return null;
  }
  const host = window.__POCHITA_HOST__;
  if (host) {
    if (typeof host.getPluginId === 'function') {
      try {
        const id = host.getPluginId();
        if (id && id.trim().length > 0) return id.trim();
      } catch {
        // ignore
      }
    }
    if (typeof host.pluginId === 'string' && host.pluginId.trim().length > 0) {
      return host.pluginId.trim();
    }
  }
  try {
    if (window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('pluginId');
      if (q && q.trim().length > 0) return q.trim();
    }
  } catch {
    // ignore
  }
  return null;
}
