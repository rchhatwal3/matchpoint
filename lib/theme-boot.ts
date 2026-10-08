/**
 * Web pre-paint theme resolution. The static export (`web.output: "static"`)
 * pre-renders every route at build time, where there is no OS theme and no
 * saved choice, so the HTML is baked in the light theme. This script runs in
 * <head> before first paint: it resolves the scheme the app will render
 * (saved light/dark wins, else the OS), paints the page background, and when
 * that scheme is dark hides the light pre-render until the app has rendered
 * (`_layout.tsx` removes the class). Mirrors ThemeProvider's resolution.
 */
export const THEME_BOOT_CLASS = 'mp-boot-hide';

export const THEME_BOOT_CSS = `html.${THEME_BOOT_CLASS} #root{visibility:hidden}`;

// Upper bound on the hide: if the app never starts, show the page anyway.
const REVEAL_FALLBACK_MS = 3000;

export function themeBootScript({
  storageKey,
  lightBg,
  darkBg,
}: {
  storageKey: string;
  lightBg: string;
  darkBg: string;
}): string {
  return `(function(){
var pref=null;
try{pref=window.localStorage.getItem(${JSON.stringify(storageKey)});}catch(e){}
var dark=pref==='dark'||(pref!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var root=document.documentElement;
root.style.backgroundColor=dark?${JSON.stringify(darkBg)}:${JSON.stringify(lightBg)};
root.style.colorScheme=dark?'dark':'light';
if(dark){
root.classList.add(${JSON.stringify(THEME_BOOT_CLASS)});
window.setTimeout(function(){root.classList.remove(${JSON.stringify(THEME_BOOT_CLASS)});},${REVEAL_FALLBACK_MS});
}
})();`;
}
