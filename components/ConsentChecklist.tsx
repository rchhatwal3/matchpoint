import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { Checkbox } from '@/components/Checkbox';
import type { ConsentState } from '@/lib/consent/consent-logic';

export function ConsentChecklist({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Checkbox
          checked={value.tosAccepted}
          onChange={(next) => onChange({ ...value, tosAccepted: next })}
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
        />
        <Text variant="body" style={{ flex: 1 }}>
          I agree to matchpoint&apos;s{' '}
          <Text variant="body" color={colors.primary} onPress={() => router.push('/legal/terms')}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text variant="body" color={colors.primary} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <Checkbox
          checked={value.ageConfirmed}
          onChange={(next) => onChange({ ...value, ageConfirmed: next })}
          accessibilityLabel="I confirm I am 18 years of age or older"
        />
        <Text variant="body" style={{ flex: 1 }}>
          I confirm I am 18 years of age or older.
        </Text>
      </View>
    </View>
  );
}
