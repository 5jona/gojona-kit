import {
  createThemeBootstrapScript,
  SEMANTIC_THEME_TOKENS,
  type SemanticThemeToken,
  STORAGE_KEY_SCHEME,
  STORAGE_KEY_THEME,
} from '@gojona/config/themes';
import type { ResolvedColorScheme } from './types.ts';

export { SEMANTIC_THEME_TOKENS, type SemanticThemeToken, STORAGE_KEY_SCHEME, STORAGE_KEY_THEME };

/**
 * Canonical synchronous inline script for HTML `<head>` to restore theme and
 * color-scheme attributes before first paint.
 */
export const THEME_BOOTSTRAP_SCRIPT = createThemeBootstrapScript('standalone');

/**
 * Allowlist of semantic CSS custom properties permitted for runtime dynamic injection
 * via `applyDynamicCssTokens` (e.g. host-synthesized Material You `Oklch` tokens).
 */
export const ALLOWED_DYNAMIC_CSS_TOKENS = SEMANTIC_THEME_TOKENS;

const ALLOWED_DYNAMIC_CSS_TOKEN_SET: ReadonlySet<string> = new Set<string>(
  ALLOWED_DYNAMIC_CSS_TOKENS,
);

/**
 * Checks whether a CSS custom property name is in the dynamic theme token allowlist.
 */
export function isAllowedDynamicCssToken(tokenName: string): tokenName is SemanticThemeToken {
  return ALLOWED_DYNAMIC_CSS_TOKEN_SET.has(tokenName);
}

/**
 * Single semantic CSS custom property inspection record returned by `inspectThemeTokens`.
 */
export interface ThemeTokenEntry {
  token: string;
  resolved: string;
  computed: string;
  inlineOverride: string | null;
}

/**
 * Snapshot of active theme attributes and resolved semantic CSS tokens on a root DOM element.
 */
export interface ThemeTokenSnapshot {
  themeId: string | null;
  surface: string | null;
  colorScheme: ResolvedColorScheme;
  tokens: Record<string, ThemeTokenEntry>;
  inlineOverrides: Record<string, string>;
}

function readInlineStyleProperty(root: Element, varName: string): string {
  const style = (root as Partial<HTMLElement>).style;
  if (!style || typeof style.getPropertyValue !== 'function') {
    return '';
  }
  return style.getPropertyValue(varName).trim();
}

/**
 * Resolves a concrete CSS color value for Canvas 2D / WebGL contexts that cannot
 * evaluate CSS `light-dark(...)` expressions directly.
 * Inline dynamic overrides (e.g. Material You Oklch tokens) take precedence over
 * static `-light`/`-dark` suffixed theme variables.
 */
export function readThemeToken(
  tokenName: string,
  scheme: ResolvedColorScheme,
  fallback: string,
  root: Element | null = typeof document !== 'undefined' ? document.documentElement : null,
): string {
  if (!root) {
    return fallback;
  }
  const normalized = tokenName.startsWith('--') ? tokenName.slice(2) : tokenName;
  const varName = `--${normalized}`;

  const inlineVal = readInlineStyleProperty(root, varName);
  if (inlineVal && !inlineVal.includes('light-dark')) {
    return inlineVal;
  }

  if (typeof getComputedStyle !== 'function') {
    return fallback;
  }
  const styles = getComputedStyle(root);
  const schemeSpecific = styles.getPropertyValue(`${varName}-${scheme}`).trim();
  if (schemeSpecific) {
    return schemeSpecific;
  }
  const direct = styles.getPropertyValue(varName).trim();
  if (direct && !direct.includes('light-dark')) {
    return direct;
  }
  return fallback;
}

/**
 * Applies an alpha channel to `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`,
 * `oklch(...)`, or CSS Color 4 `color(...)` strings for Canvas 2D and CSS styles.
 */
export function colorWithAlpha(color: string, alpha: number): string {
  const clampedAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
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
  if (trimmed.startsWith('oklch(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(6, -1).trim();
    const slashIdx = inner.indexOf('/');
    const channels = (slashIdx === -1 ? inner : inner.slice(0, slashIdx)).trim();
    if (channels.length > 0) {
      return `oklch(${channels} / ${clampedAlpha})`;
    }
  }
  if (trimmed.startsWith('color(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(6, -1).trim();
    const slashIdx = inner.indexOf('/');
    const channels = (slashIdx === -1 ? inner : inner.slice(0, slashIdx)).trim();
    if (channels.length > 0) {
      return `color(${channels} / ${clampedAlpha})`;
    }
  }
  return trimmed;
}

function resolveInspectionScheme(
  root: Element | null,
  explicitScheme?: ResolvedColorScheme,
): ResolvedColorScheme {
  if (explicitScheme) return explicitScheme;
  const datasetScheme = (root as Partial<HTMLElement> | null)?.dataset?.colorScheme;
  if (datasetScheme === 'light' || datasetScheme === 'dark') {
    return datasetScheme;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

/**
 * Inspects all canonical semantic CSS tokens on the target root element,
 * returning computed values, resolved scheme values, and active inline overrides
 * for CDP diagnostics and automated verification.
 */
export function inspectThemeTokens(
  root: Element | null = typeof document !== 'undefined' ? document.documentElement : null,
  scheme?: ResolvedColorScheme,
): ThemeTokenSnapshot {
  const resolvedScheme = resolveInspectionScheme(root, scheme);
  const dataset = (root as Partial<HTMLElement> | null)?.dataset;
  const styles = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
  const tokens: Record<string, ThemeTokenEntry> = {};
  const inlineOverrides: Record<string, string> = {};

  for (const token of SEMANTIC_THEME_TOKENS) {
    const inlineVal = root ? readInlineStyleProperty(root, token) : '';
    const computed = styles ? styles.getPropertyValue(token).trim() : '';
    const resolved = readThemeToken(token, resolvedScheme, computed, root);
    tokens[token] = {
      token,
      resolved,
      computed,
      inlineOverride: inlineVal || null,
    };
    if (inlineVal) {
      inlineOverrides[token] = inlineVal;
    }
  }

  return {
    themeId: dataset?.theme ?? null,
    surface: dataset?.surface ?? null,
    colorScheme: resolvedScheme,
    tokens,
    inlineOverrides,
  };
}

/**
 * Applies host-synthesized dynamic CSS custom properties (e.g. Material You Oklch tokens)
 * to the document root, strictly filtering to allowlisted semantic `--*` custom properties.
 */
export function applyDynamicCssTokens(
  tokens: Record<string, string>,
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): string[] {
  if (!root) return [];
  const applied: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (isAllowedDynamicCssToken(key) && typeof value === 'string' && value.trim().length > 0) {
      root.style.setProperty(key, value.trim());
      applied.push(key);
    }
  }
  return applied;
}

/**
 * Removes previously injected dynamic CSS custom properties from the document root.
 */
export function clearDynamicCssTokens(
  tokenNames: readonly string[],
  root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!root) return;
  for (const key of tokenNames) {
    if (isAllowedDynamicCssToken(key)) {
      root.style.removeProperty(key);
    }
  }
}
