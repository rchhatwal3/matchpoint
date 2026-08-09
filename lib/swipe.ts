/** Drag distance that commits a swipe; also the ramp for the LIKE/PASS stamps. */
export const SWIPE_THRESHOLD = 110;
const FLING_VELOCITY = 900;

/**
 * Which way a released drag resolves: true = like, false = pass, null = below
 * the commit bar, so the card springs back and nothing is recorded. A fast
 * flick commits on velocity alone; distance wins when both apply. Pure.
 */
export function swipeDirection(translationX: number, velocityX: number): boolean | null {
  const byDistance = Math.abs(translationX) > SWIPE_THRESHOLD;
  const byFling = Math.abs(velocityX) > FLING_VELOCITY;
  if (!byDistance && !byFling) return null;
  return byDistance ? translationX > 0 : velocityX > 0;
}

export type SwipeHandlers = {
  /** Pan gesture release, in gesture units. */
  endDrag: (translationX: number, velocityX: number) => void;
  /** ♥ / ✕ button press. */
  press: (liked: boolean) => void;
};

/**
 * End-of-swipe policy for one card.
 *
 * `record` runs the instant a swipe is committed — before the exit animation
 * starts — because the exit spring advances on animation frames, and a page
 * that gets hidden or unmounted mid-spring never delivers them. `exit` is
 * cosmetic only: it may settle late, or never. At most one `record` per card,
 * whichever path commits.
 */
export function createSwipeHandlers(callbacks: {
  record: (liked: boolean) => void;
  exit: (liked: boolean) => void;
  returnToCentre: () => void;
}): SwipeHandlers {
  let recorded = false;

  const commit = (liked: boolean) => {
    if (recorded) return;
    recorded = true;
    callbacks.record(liked);
    callbacks.exit(liked);
  };

  return {
    endDrag: (translationX, velocityX) => {
      const liked = swipeDirection(translationX, velocityX);
      if (liked === null) {
        callbacks.returnToCentre();
        return;
      }
      commit(liked);
    },
    press: commit,
  };
}
