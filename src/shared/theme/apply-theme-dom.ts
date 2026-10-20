import { resolveEffectiveTheme, type ResolvedTheme, type ThemePreference } from './config';

export function applyResolvedThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.dataset.pfResolvedTheme = resolved;
}

export function applyThemePreferenceToDocument(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveEffectiveTheme(preference, prefersDark);
  applyResolvedThemeToDocument(resolved);
  return resolved;
}
