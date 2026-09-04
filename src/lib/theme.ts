// Preferência de tema é local ao navegador (localStorage), não sincronizada entre dispositivos
// nem por tenant: branding (cor de marca) é por cliente, mas claro/escuro é escolha pessoal de
// quem está usando o CRM naquele momento.
const STORAGE_KEY = 'ales-car-theme';

export type ThemePreference = 'light' | 'dark';

export function getStoredTheme(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getPreferredTheme(): ThemePreference {
  return (
    getStoredTheme() ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme: ThemePreference): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

// Script inline injetado no <head> (ver RootLayout) para aplicar a classe "dark" antes da
// primeira pintura — sem isso a tela pisca clara e depois escurece a cada carregamento.
export const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
