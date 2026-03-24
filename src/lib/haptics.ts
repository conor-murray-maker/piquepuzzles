/**
 * Haptic feedback utility for PWA native feel.
 * Uses navigator.vibrate where available (Android, some PWAs).
 * No-op on unsupported devices (iOS Safari).
 */

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const haptic = {
  /** Light tap — card moves, button taps */
  light() {
    if (canVibrate) navigator.vibrate(10);
  },
  /** Medium feedback — foundation moves, undo */
  medium() {
    if (canVibrate) navigator.vibrate(20);
  },
  /** Success — game won, streak milestone */
  success() {
    if (canVibrate) navigator.vibrate([15, 50, 15]);
  },
  /** Error — invalid move, stuck detection */
  error() {
    if (canVibrate) navigator.vibrate([30, 30, 30]);
  },
  /** Heavy — give up confirmation, rating change */
  heavy() {
    if (canVibrate) navigator.vibrate(40);
  },
};
