import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

export function LegalFooter() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center', marginTop: spacing['3xl'] }}>
      <Text variant="label" color={colors.inkMuted} onPress={() => router.push('/legal/terms')}>
        Terms
      </Text>
      <Text variant="label" color={colors.inkMuted} onPress={() => router.push('/legal/privacy')}>
        Privacy
      </Text>
    </View>
  );
}
