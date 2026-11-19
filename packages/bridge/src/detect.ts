import type { RuntimeEnv } from './types.ts';

/**
 * Detects the active runtime cleanly across embedded host WebViews, KernelSU WebUI,
 * and standalone browser development previews.
 */
export function detectRuntime(): RuntimeEnv {
  if (typeof window === 'undefined') {
    return 'browser';
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const envParam = params.get('env');
    if (envParam === 'host' || envParam === 'ksu' || envParam === 'browser') {
      return envParam;
    }
  } catch {
    // Ignore malformed query strings in restricted sandboxes.
  }

  if (typeof window.__POCHITA_HOST__ !== 'undefined') {
    return 'host';
  }

  if (typeof window.ksu !== 'undefined' && typeof window.ksu.exec === 'function') {
    return 'ksu';
  }

  return 'browser';
}
