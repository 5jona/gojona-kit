export const THEME_IDS = Object.freeze(['coloros-glass', 'modern-saas-dark']);

export const DEFAULT_THEME_ID = 'coloros-glass';

export const STORAGE_KEY_THEME = 'pochita:theme';

export const STORAGE_KEY_SCHEME = 'pochita:color-scheme';

/**
 * Generates the synchronous theme/color-scheme bootstrap snippet injected into `<head>`.
 *
 * @param {'standalone' | 'native-glass'} [surface='standalone']
 */
export function createThemeBootstrapScript(surface = 'standalone') {
  const surfaceInit =
    surface === 'native-glass' ? "document.documentElement.dataset.surface='native-glass';" : '';
  const themeCheck = THEME_IDS.map((id) => `t==='${id}'`).join('||');
  return `try{${surfaceInit}var s=localStorage.getItem('${STORAGE_KEY_SCHEME}');if(s==='light'||s==='dark'){var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=s;}var t=localStorage.getItem('${STORAGE_KEY_THEME}');document.documentElement.dataset.theme=(${themeCheck})?t:'${DEFAULT_THEME_ID}';}catch(e){}`;
}
