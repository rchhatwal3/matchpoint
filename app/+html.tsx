import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { STORAGE_KEY } from '@/lib/theme/ThemeProvider';
import { darkColors, lightColors } from '@/lib/theme/tokens';
import { THEME_BOOT_CSS, themeBootScript } from '@/lib/theme-boot';

// Web-only root HTML for the static export. Same head as Expo's default, plus
// the pre-paint theme script (see lib/theme-boot.ts) so the first frame is
// already in the visitor's scheme rather than the light one baked at build.
const bootScript = themeBootScript({
  storageKey: STORAGE_KEY,
  lightBg: lightColors.bg,
  darkBg: darkColors.bg,
});

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: THEME_BOOT_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
