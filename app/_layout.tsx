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
import { ThemeProvider, useTheme } from '@/lib/theme';
import { AuthProvider } from '@/providers/AuthProvider';
import { SessionProvider } from '@/providers/SessionProvider';
import { MatchOverlay } from '@/components/MatchOverlay';

SplashScreen.preventAutoHideAsync();

/** Consumes resolved theme; must live under ThemeProvider. */
function ThemedApp() {
  const { colors, scheme } = useTheme();
  // On web the html/body canvas is transparent, so any region a themed Screen
  // doesn't cover (scroll overflow, the >maxWidth gutter) falls back to the OS
  // prefers-color-scheme instead of the user's theme choice — most visible on
  // the short landing screen. Drive the document background from the resolved bg.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = colors.bg;
    }
  }, [colors.bg]);
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
