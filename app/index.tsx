import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

export default function Index() {
  const { colors, typeScale } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <Text
          style={{
            color: colors.primary,
            fontSize: typeScale.display.fontSize,
            lineHeight: typeScale.display.lineHeight,
            fontFamily: 'Nunito_800ExtraBold',
            letterSpacing: typeScale.display.letterSpacing,
          }}
        >
          matchpoint
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
