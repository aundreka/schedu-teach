import {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  WithSpringConfig,
} from "react-native-reanimated";

/**
 * schEDU motion system. Every animation in the app should come from here so
 * timing/springs stay consistent and reduce-motion is respected everywhere
 * (all presets carry ReduceMotion.System).
 */

export const springs = {
  /** Press feedback — snappy, ~150ms settle. Matches AnimatedPressable. */
  press: { damping: 18, stiffness: 260, mass: 0.6, reduceMotion: ReduceMotion.System } as WithSpringConfig,
  /** Sheets and larger surfaces. */
  sheet: { damping: 28, stiffness: 320, reduceMotion: ReduceMotion.System } as WithSpringConfig,
  /** Small UI details (underlines, chips, steppers). */
  detail: { damping: 14, stiffness: 260, reduceMotion: ReduceMotion.System } as WithSpringConfig,
} as const;

export const durations = {
  fast: 160,
  base: 240,
  slow: 320,
} as const;

/** Stagger step for list entrances (ms per item). */
export const STAGGER_MS = 45;

/** Standard list/card entrance. Usage: entering={enterUp(index)} */
export function enterUp(index = 0) {
  return FadeInDown.duration(durations.slow)
    .springify()
    .delay(index * STAGGER_MS)
    .reduceMotion(ReduceMotion.System);
}

/** Content fade for tab/section swaps. */
export function enterFade(delayMs = 0) {
  return FadeIn.duration(durations.base).delay(delayMs).reduceMotion(ReduceMotion.System);
}

export function exitFade() {
  return FadeOut.duration(durations.fast).reduceMotion(ReduceMotion.System);
}

/** Toast/sheet-like rise. */
export function enterRise(delayMs = 0) {
  return FadeInUp.duration(durations.base).delay(delayMs).reduceMotion(ReduceMotion.System);
}

/** Funnel step transitions: forward = next step, back = previous step. */
export const stepMotion = {
  enterForward: SlideInRight.duration(durations.base).reduceMotion(ReduceMotion.System),
  exitForward: SlideOutLeft.duration(durations.fast).reduceMotion(ReduceMotion.System),
  enterBack: SlideInLeft.duration(durations.base).reduceMotion(ReduceMotion.System),
  exitBack: SlideOutRight.duration(durations.fast).reduceMotion(ReduceMotion.System),
} as const;
