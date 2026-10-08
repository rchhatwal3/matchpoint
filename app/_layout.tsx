import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import { ThemeProvider, useTheme, useThemePreference } from '@/lib/theme';
import { THEME_BOOT_CLASS } from '@/lib/theme-boot';
import { AuthProvider } from '@/providers/AuthProvider';
import { SessionProvider } from '@/providers/SessionProvider';
import { MatchOverlay } from '@/components/MatchOverlay';

SplashScreen.preventAutoHideAsync();

/** Consumes resolved theme; must live under ThemeProvider. */
function ThemedApp() {
  const { colors, scheme } = useTheme();
  const { hydrated } = useThemePreference();
  // On web the html/body canvas is transparent, so any region a themed Screen
  // doesn't cover (scroll overflow, the >maxWidth gutter) falls back to the OS
  // prefers-color-scheme instead of the user's theme choice — most visible on
  // the short landing screen. Drive the document background from the resolved bg.
  // Not before hydration: that render is forced light (ThemeProvider), and the
  // +html.tsx boot script already painted the real scheme's background.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && hydrated) {
      document.documentElement.style.backgroundColor = colors.bg;
      // The boot script set this for first paint; keep scrollbars and form
      // controls on the theme as it changes.
      document.documentElement.style.colorScheme = scheme;
      // Without this every input and button falls back to the browser's own
      // ring, whose colour is the OS accent — amber on one machine, blue on the
      // next. DESIGN.md makes the focus ring crimson. :focus-visible, so a mouse
      // click on a button paints nothing while a text field always shows it.
      document.documentElement.style.setProperty('--mp-focus', colors.primary);
      if (!document.getElementById('mp-focus-ring')) {
        const style = document.createElement('style');
        style.id = 'mp-focus-ring';
        style.textContent =
          ':focus-visible { outline: 2px solid var(--mp-focus); outline-offset: 2px; }';
        document.head.appendChild(style);
      }
      // +html.tsx hid the light pre-render for dark-scheme visitors; this render
      // carries the real theme, so reveal it.
      document.documentElement.classList.remove(THEME_BOOT_CLASS);
    }
  }, [colors.bg, colors.primary, hydrated, scheme]);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* Match reveal surfaces from wherever a mutual like is detected */}
      <MatchOverlay />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Figtree_400Regular,
    Figtree_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <SessionProvider>
              <ThemedApp />
            </SessionProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
