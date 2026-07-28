/**
 * Every screen's Header chevron routes to a logical parent instead of
 * `router.back()` — history-based back can bounce between screens that link
 * to each other (e.g. Settings <-> the restaurants deck) and never reach the
 * lobby. `app.json`'s `experiments.baseUrl` serves the web build under
 * `/matchpoint`, so the pathname we're handed may carry that prefix; strip it
 * before matching.
 */
const BASE_PATH = '/matchpoint';

function normalize(pathname: string): string {
  let p = pathname;
  if (p === BASE_PATH || p.startsWith(`${BASE_PATH}/`)) {
    p = p.slice(BASE_PATH.length) || '/';
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p;
}

export function parentRoute(pathname: string, hasRoom: boolean): string {
  const path = normalize(pathname);

  if (path === '/settings') return hasRoom ? '/lobby' : '/';
  if (path === '/account') return '/settings';
  if (path === '/legal/terms' || path === '/legal/privacy') return hasRoom ? '/settings' : '/';
  if (path.startsWith('/swipe/')) return '/lobby';
  if (path === '/matches') return '/lobby';
  if (path === '/date-night') return '/lobby';

  return hasRoom ? '/lobby' : '/';
}
