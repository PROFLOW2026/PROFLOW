import { THEME_COOKIE_NAME, DEFAULT_THEME_PREFERENCE } from './config';

/**
 * Inline script applied before first paint to avoid theme flash.
 * Reads the same cookie the server uses (`pf-ui-theme`).
 */
export function ThemeBootScript() {
  const script = `(function(){try{var k=${JSON.stringify(THEME_COOKIE_NAME)};var m=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));var p=m?decodeURIComponent(m[1]):${JSON.stringify(DEFAULT_THEME_PREFERENCE)};if(p!=='light'&&p!=='dark'&&p!=='system')p=${JSON.stringify(DEFAULT_THEME_PREFERENCE)};var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';r.dataset.pfTheme=p;r.dataset.pfResolvedTheme=d?'dark':'light';var tc=d?'#151d2b':'#0f766e';if(p!=='system'){var el=document.querySelector('meta[name="theme-color"]:not([media])');if(!el){el=document.createElement('meta');el.name='theme-color';document.head.appendChild(el);}el.content=tc;}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
