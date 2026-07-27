import { Pressable, View } from 'react-native';
import { TOUCH_TARGET, useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

export function Checkbox({
  checked,
  onChange,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel: string;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      hitSlop={12}
      style={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radii.xs,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.outlineStrong,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text variant="label" color={colors.onPrimary}>✓</Text> : null}
      </View>
    </Pressable>
  );
}
