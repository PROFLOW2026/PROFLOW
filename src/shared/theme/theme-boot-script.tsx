import { THEME_COOKIE_NAME, DEFAULT_THEME_PREFERENCE } from './config';
import { STYLE_COOKIE_NAME, DEFAULT_STYLE_PREFERENCE } from './style/config';

/**
 * Inline script applied before first paint to avoid theme and style flash.
 * Reads the same cookies the server uses.
 */
export function ThemeBootScript() {
  const script = `(function(){try{function read(k){var m=document.cookie.match(new RegExp('(?:^|; )'+k+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}var tk=${JSON.stringify(THEME_COOKIE_NAME)};var sk=${JSON.stringify(STYLE_COOKIE_NAME)};var p=read(tk)||${JSON.stringify(DEFAULT_THEME_PREFERENCE)};if(p!=='light'&&p!=='dark'&&p!=='system')p=${JSON.stringify(DEFAULT_THEME_PREFERENCE)};var s=read(sk)||${JSON.stringify(DEFAULT_STYLE_PREFERENCE)};if(s!=='classic'&&s!=='modern'&&s!=='premium')s=${JSON.stringify(DEFAULT_STYLE_PREFERENCE)};var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';r.dataset.pfTheme=p;r.dataset.pfResolvedTheme=d?'dark':'light';r.dataset.pfStyle=s;var colors={classic:{light:'#0f766e',dark:'#151d2b'},modern:{light:'#ffffff',dark:'#161d25'},premium:{light:'#eef0f1',dark:'#0c1012'}};var tc=(colors[s]||colors.classic)[d?'dark':'light'];if(p!=='system'){var el=document.querySelector('meta[name="theme-color"]:not([media])');if(!el){el=document.createElement('meta');el.name='theme-color';document.head.appendChild(el);}el.content=tc;}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
