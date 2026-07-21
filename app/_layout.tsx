import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { SessionProvider } from '@/providers/SessionProvider';
import { MatchOverlay } from '@/components/MatchOverlay';
import { ThemeToggle } from '@/components/ThemeToggle';

SplashScreen.preventAutoHideAsync();

/** Top-right, safe-area-aware overlay so the toggle rides above every screen. */
function ThemeToggleOverlay() {
  const insets = useSafeAreaInsets();
  const { spacing } = useTheme();
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={{ marginTop: insets.top + spacing.sm, marginRight: spacing.lg }}>
        <ThemeToggle />
      </View>
    </View>
  );
}

/** Consumes resolved theme; must live under ThemeProvider. */
function ThemedApp() {
  const { colors, scheme } = useTheme();
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
      <ThemeToggleOverlay />
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
          <SessionProvider>
            <ThemedApp />
          </SessionProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
  },
});
