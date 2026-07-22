import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { CATEGORY_EMOJI, type Item } from '@/lib/types';
import { Text } from '@/components/Text';

export type SwipeCardHandle = {
  /** Button-triggered swipe — mirrors the pan gesture. */
  swipe: (liked: boolean) => void;
};

export type SwipeCardProps = {
  item: Item;
  /** Only the top card owns the gesture, Level 2 shadow, and stamps. */
  isTop: boolean;
  /** Drag x of the TOP card — the next card scales 0.95 -> 1 from it. */
  translateX: SharedValue<number>;
  onSwiped: (liked: boolean) => void;
  reducedMotion: boolean;
};

const SWIPE_THRESHOLD = 110;
const SPRING = { damping: 18, stiffness: 160, mass: 0.6 };

/**
 * DESIGN.md signature swipe card: full-bleed panel (seed ships no imagery, so
 * a surface-variant panel + category glyph stands in), 24px radius, title +
 * subtitle pinned bottom. Rotation follows drag x (±12°); raspberry LIKE /
 * neutral PASS stamps fade with distance; spring exit. Only the top card gets
 * Level 2 elevation (Calm-Surface Rule).
 */
export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { item, isTop, translateX, onSwiped, reducedMotion },
  ref,
) {
  const { colors, radii, spacing, elevation } = useTheme();
  const { width } = useWindowDimensions();
  const offscreen = width * 1.5;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!item.image_url && !imgFailed;

  const finish = (liked: boolean) => onSwiped(liked);

  const exitTo = (liked: boolean) => {
    'worklet';
    if (reducedMotion) {
      translateX.value = 0;
      runOnJS(finish)(liked);
      return;
    }
    translateX.value = withSpring(liked ? offscreen : -offscreen, SPRING, (done) => {
      if (done) {
        translateX.value = 0;
        runOnJS(finish)(liked);
      }
    });
  };

  useImperativeHandle(ref, () => ({
    swipe: (liked: boolean) => {
      if (reducedMotion) {
        finish(liked);
        return;
      }
      translateX.value = withSpring(liked ? offscreen : -offscreen, SPRING, (done) => {
        if (done) {
          translateX.value = 0;
          runOnJS(finish)(liked);
        }
      });
    },
  }));

  const pan = Gesture.Pan()
    .enabled(isTop)
    .onChange((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const byDistance = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      const byFling = Math.abs(e.velocityX) > 900;
      if (byDistance || byFling) {
        exitTo(byDistance ? e.translationX > 0 : e.velocityX > 0);
      } else {
        translateX.value = reducedMotion ? 0 : withSpring(0, SPRING);
      }
    });

  const topStyle = useAnimatedStyle(() => {
    if (!isTop) return {};
    const rotate = reducedMotion
      ? '0deg'
      : `${interpolate(translateX.value, [-width, width], [-12, 12])}deg`;
    return {
      transform: [{ translateX: translateX.value }, { rotate }],
    };
  });

  const nextStyle = useAnimatedStyle(() => {
    if (isTop) return {};
    if (reducedMotion) return { transform: [{ scale: 1 }] };
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD * 2],
      [0.95, 1],
      'clamp',
    );
    return { transform: [{ scale }] };
  });

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: isTop ? interpolate(translateX.value, [20, SWIPE_THRESHOLD], [0, 1], 'clamp') : 0,
  }));
  const passStampStyle = useAnimatedStyle(() => ({
    opacity: isTop ? interpolate(translateX.value, [-SWIPE_THRESHOLD, -20], [1, 0], 'clamp') : 0,
  }));

  const card = (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceVariant,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.outline,
        },
        isTop ? elevation.level2 : elevation.level1,
        topStyle,
        nextStyle,
      ]}
    >
      {showImage ? (
        <>
          <Image
            source={{ uri: item.image_url as string }}
            style={styles.panel}
            contentFit="cover"
            onError={() => setImgFailed(true)}
            accessibilityElementsHidden
          />
          {/* Scrim band so title/meta stay legible over the photo */}
          <View style={[styles.scrim, { backgroundColor: colors.scrim }]} />
        </>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.glyph} accessibilityElementsHidden>
            {item.emoji ?? CATEGORY_EMOJI[item.category]}
          </Text>
        </View>
      )}

      <View style={[styles.meta, { padding: spacing['2xl'], gap: spacing.xs }]}>
        <Text variant="headline" color={showImage ? colors.onScrim : colors.ink}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text variant="body" color={showImage ? colors.onScrim : colors.inkMuted}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>

      {/* LIKE — raspberry, top-left, tilted in */}
      <Animated.View
        style={[
          styles.stamp,
          styles.stampLike,
          { borderColor: colors.primary, borderRadius: radii.sm },
          likeStampStyle,
        ]}
      >
        <Text variant="headline" color={colors.primary}>
          LIKE
        </Text>
      </Animated.View>

      {/* PASS — neutral, top-right */}
      <Animated.View
        style={[
          styles.stamp,
          styles.stampPass,
          { borderColor: colors.inkMuted, borderRadius: radii.sm },
          passStampStyle,
        ]}
      >
        <Text variant="headline" color={colors.inkMuted}>
          PASS
        </Text>
      </Animated.View>
    </Animated.View>
  );

  return isTop ? <GestureDetector gesture={pan}>{card}</GestureDetector> : card;
});

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 96, lineHeight: 120 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '52%' },
  meta: {},
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  stampLike: { left: 20, transform: [{ rotate: '-12deg' }] },
  stampPass: { right: 20, transform: [{ rotate: '12deg' }] },
});
