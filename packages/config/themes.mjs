/**
 * Canonical allowlist of registered theme identifiers.
 */
export const THEME_IDS = Object.freeze(['coloros-glass', 'modern-saas-dark']);

/**
 * Default theme identifier applied when no persisted preference exists.
 */
export const DEFAULT_THEME_ID = 'coloros-glass';

/**
 * `localStorage` key storing the active theme identifier.
 */
export const STORAGE_KEY_THEME = 'pochita:theme';

/**
 * `localStorage` key storing the active color mode (`light` | `dark` | `system`).
 */
export const STORAGE_KEY_SCHEME = 'pochita:color-scheme';

/**
 * Canonical list of semantic CSS custom properties shared across all themes.
 */
export const SEMANTIC_THEME_TOKENS = Object.freeze([
  '--surface-canvas',
  '--surface-panel',
  '--surface-card',
  '--surface-elevated',
  '--surface-toast',
  '--text-primary',
  '--text-secondary',
  '--border-hairline',
  '--glass-divider',
  '--accent',
  '--accent-soft',
  '--accent-fg',
  '--success',
  '--warning',
  '--danger',
  '--radius-panel',
  '--radius-card',
  '--radius-control',
  '--radius-pill',
  '--blur-amount',
]);

/**
 * Generates the synchronous theme/color-scheme bootstrap snippet injected into `<head>`
 * to restore `dataset.surface`, `dataset.colorScheme`, `dataset.theme`, and `<meta name="color-scheme">`
 * before first paint.
 *
 * @param {'standalone' | 'native-glass'} [surface='standalone']
 */
export function createThemeBootstrapScript(surface = 'standalone') {
  const surfaceInit =
    surface === 'native-glass' ? "document.documentElement.dataset.surface='native-glass';" : '';
  const themeCheck = THEME_IDS.map((id) => `t==='${id}'`).join('||');
  return `try{${surfaceInit}var s=localStorage.getItem('${STORAGE_KEY_SCHEME}');if(s==='light'||s==='dark'){var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=s;}document.documentElement.dataset.colorScheme=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var t=localStorage.getItem('${STORAGE_KEY_THEME}');document.documentElement.dataset.theme=(${themeCheck})?t:'${DEFAULT_THEME_ID}';}catch(e){}`;
}
