import { SWIPE_THRESHOLD, createSwipeHandlers, swipeDirection } from './swipe';

describe('swipeDirection', () => {
  it('commits right past the distance threshold', () => {
    expect(swipeDirection(SWIPE_THRESHOLD + 1, 0)).toBe(true);
  });

  it('commits left past the distance threshold', () => {
    expect(swipeDirection(-SWIPE_THRESHOLD - 1, 0)).toBe(false);
  });

  it('returns null for a drag below the threshold with no fling', () => {
    expect(swipeDirection(SWIPE_THRESHOLD, 0)).toBeNull();
    expect(swipeDirection(-SWIPE_THRESHOLD, 0)).toBeNull();
    expect(swipeDirection(0, 0)).toBeNull();
  });

  it('commits a short fast fling in the direction of the velocity', () => {
    expect(swipeDirection(10, 1200)).toBe(true);
    expect(swipeDirection(-10, -1200)).toBe(false);
  });

  it('lets distance win when a fling flicks back the other way', () => {
    expect(swipeDirection(SWIPE_THRESHOLD + 1, -1200)).toBe(true);
  });
});

/**
 * Stands in for the card. `frames` holds the exit animation's completion
 * callback — the spring settles only if the test chooses to run it, which is
 * how "the page was hidden, so no animation frame ever ran" is expressed.
 */
function card(options: { reducedMotion?: boolean } = {}) {
  const recorded: boolean[] = [];
  const advanced: boolean[] = [];
  const frames: (() => void)[] = [];
  let returns = 0;

  const handlers = createSwipeHandlers({
    record: (liked) => recorded.push(liked),
    exit: (liked) => {
      const settle = () => advanced.push(liked);
      if (options.reducedMotion) settle();
      else frames.push(settle);
    },
    returnToCentre: () => {
      returns += 1;
    },
  });

  return {
    handlers,
    recorded,
    advanced,
    frames,
    runFrames: () => frames.splice(0).forEach((f) => f()),
    get returns() {
      return returns;
    },
  };
}

describe('createSwipeHandlers', () => {
  it('records a committed drag with zero animation frames elapsed', () => {
    const c = card();

    c.handlers.endDrag(SWIPE_THRESHOLD + 40, 0);

    expect(c.recorded).toEqual([true]);
    expect(c.frames).toHaveLength(1);
    expect(c.advanced).toEqual([]);
  });

  it('records nothing and returns the card when the drag is below the threshold', () => {
    const c = card();

    c.handlers.endDrag(SWIPE_THRESHOLD - 40, 0);

    expect(c.recorded).toEqual([]);
    expect(c.frames).toEqual([]);
    expect(c.returns).toBe(1);
  });

  it('records a button press immediately, not when the animation ends', () => {
    const c = card();

    c.handlers.press(false);
    expect(c.recorded).toEqual([false]);
    expect(c.advanced).toEqual([]);

    c.runFrames();
    expect(c.recorded).toEqual([false]);
    expect(c.advanced).toEqual([false]);
  });

  it('records exactly once on the reduced-motion path, where there is no animation', () => {
    const c = card({ reducedMotion: true });

    c.handlers.press(true);

    expect(c.recorded).toEqual([true]);
    expect(c.advanced).toEqual([true]);
  });

  it('records at most one swipe per card', () => {
    const c = card();

    c.handlers.endDrag(SWIPE_THRESHOLD + 40, 0);
    c.handlers.press(false);
    c.handlers.endDrag(-SWIPE_THRESHOLD - 40, 0);

    expect(c.recorded).toEqual([true]);
    expect(c.frames).toHaveLength(1);
  });
});
