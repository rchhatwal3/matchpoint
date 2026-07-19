import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { TOUCH_TARGET, useReducedMotion, useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';

type Variant = 'filled' | 'tonal' | 'outlined';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * DESIGN.md button vocabulary: fully rounded pill, min height 48px.
 * Filled raspberry / tonal container / outlined neutral. Press scales to 0.97
 * (gated on reduced motion); disabled 50% opacity.
 */
export function Button({ label, onPress, variant = 'filled', disabled, style }: ButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette: Record<Variant, { bg: string; text: string; borderColor?: string }> = {
    filled: { bg: colors.primary, text: colors.onPrimary },
    tonal: { bg: colors.primaryContainer, text: colors.onPrimaryContainer },
    outlined: { bg: 'transparent', text: colors.primary, borderColor: colors.outline },
  };
  const p = palette[variant];

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) scale.set(withSpring(0.97, { damping: 20, stiffness: 300 }));
        }}
        onPressOut={() => {
          if (!reducedMotion) scale.set(withSpring(1, { damping: 20, stiffness: 300 }));
        }}
        style={[
          styles.base,
          {
            backgroundColor: p.bg,
            borderRadius: radii.full,
            paddingHorizontal: spacing['2xl'],
            borderWidth: variant === 'outlined' ? 1 : 0,
            borderColor: p.borderColor,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text variant="label" color={p.text}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
});
