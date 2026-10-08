import { THEME_BOOT_CLASS, THEME_BOOT_CSS, themeBootScript } from './theme-boot';

const LIGHT = 'light-bg';
const DARK = 'dark-bg';
const KEY = 'pref-key';

type Env = {
  stored?: string | null;
  storageThrows?: boolean;
  osDark: boolean;
};

/** Runs the boot script against a fake browser and reports what it did. */
function boot({ stored = null, storageThrows = false, osDark }: Env) {
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const timers: (() => void)[] = [];
  const document = {
    documentElement: {
      style,
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
    },
  };
  const window = {
    localStorage: {
      getItem: (k: string) => {
        if (storageThrows) throw new Error('blocked');
        return k === KEY ? stored : null;
      },
    },
    matchMedia: (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && osDark }),
    setTimeout: (fn: () => void) => {
      timers.push(fn);
    },
  };
  const script = themeBootScript({ storageKey: KEY, lightBg: LIGHT, darkBg: DARK });
  new Function('window', 'document', script)(window, document);
  return {
    bg: style.backgroundColor,
    colorScheme: style.colorScheme,
    get hidden() {
      return classes.has(THEME_BOOT_CLASS);
    },
    runTimers: () => timers.forEach((t) => t()),
  };
}

describe('themeBootScript', () => {
  it('dark OS, nothing saved: paints dark and hides the light pre-render', () => {
    expect(boot({ osDark: true })).toMatchObject({ bg: DARK, colorScheme: 'dark', hidden: true });
  });

  it('saved dark beats a light OS', () => {
    expect(boot({ stored: 'dark', osDark: false })).toMatchObject({ bg: DARK, hidden: true });
  });

  it('saved light beats a dark OS and shows the pre-render at once', () => {
    expect(boot({ stored: 'light', osDark: true })).toMatchObject({
      bg: LIGHT,
      colorScheme: 'light',
      hidden: false,
    });
  });

  it('light OS, nothing saved: unchanged from today', () => {
    expect(boot({ osDark: false })).toMatchObject({ bg: LIGHT, hidden: false });
  });

  it('saved "system" or garbage follows the OS', () => {
    expect(boot({ stored: 'system', osDark: true })).toMatchObject({ bg: DARK, hidden: true });
    expect(boot({ stored: 'purple', osDark: false })).toMatchObject({ bg: LIGHT, hidden: false });
  });

  it('blocked storage follows the OS', () => {
    expect(boot({ storageThrows: true, osDark: true })).toMatchObject({ bg: DARK, hidden: true });
  });

  it('never leaves the page hidden if the app fails to start', () => {
    const result = boot({ osDark: true });
    result.runTimers();
    expect(result.hidden).toBe(false);
  });

  it('CSS hides only the app root, only while the class is set', () => {
    expect(THEME_BOOT_CSS).toBe(`html.${THEME_BOOT_CLASS} #root{visibility:hidden}`);
  });
});
