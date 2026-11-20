import type { ResolvedColorScheme } from './types.ts';

export const STORAGE_KEY_THEME = 'pochita:theme';
export const STORAGE_KEY_SCHEME = 'pochita:color-scheme';

/**
 * Canonical synchronous inline script for HTML `<head>` to restore theme and
 * color-scheme attributes before first paint.
 */
export const THEME_BOOTSTRAP_SCRIPT = `try{var s=localStorage.getItem('${STORAGE_KEY_SCHEME}');if(s==='light'||s==='dark'){var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=s;}var t=localStorage.getItem('${STORAGE_KEY_THEME}');document.documentElement.dataset.theme=(t==='coloros-glass'||t==='modern-saas-dark')?t:'coloros-glass';}catch(e){}`;

/**
 * Resolves a concrete CSS color value for Canvas 2D / WebGL contexts that cannot
 * evaluate CSS `light-dark(...)` expressions directly.
 */
export function readThemeToken(
  tokenName: string,
  scheme: ResolvedColorScheme,
  fallback: string,
  root: Element | null = typeof document !== 'undefined' ? document.documentElement : null,
): string {
  if (!root || typeof getComputedStyle !== 'function') {
    return fallback;
  }
  const normalized = tokenName.startsWith('--') ? tokenName.slice(2) : tokenName;
  const styles = getComputedStyle(root);
  const schemeSpecific = styles.getPropertyValue(`--${normalized}-${scheme}`).trim();
  if (schemeSpecific) {
    return schemeSpecific;
  }
  const direct = styles.getPropertyValue(`--${normalized}`).trim();
  if (direct && !direct.includes('light-dark')) {
    return direct;
  }
  return fallback;
}

/**
 * Converts a `#rgb`, `#rrggbb`, `rgb(...)`, or `rgba(...)` color string into an
 * `rgba(r, g, b, alpha)` string suitable for Canvas 2D fill/stroke styles.
 */
export function colorWithAlpha(color: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    if (full.length === 6) {
      const r = Number.parseInt(full.slice(0, 2), 16);
      const g = Number.parseInt(full.slice(2, 4), 16);
      const b = Number.parseInt(full.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
      }
    }
  }
  if (trimmed.startsWith('rgb(') || trimmed.startsWith('rgba(')) {
    const parts = trimmed.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clampedAlpha})`;
    }
  }
  return trimmed;
}
