/**
 * Onboarding puzzle configuration — seed-based.
 *
 * Uses seed 156 which produces a verified 5×5 puzzle with:
 * - Unique solution (single valid placement)
 * - Stronger opening: two eliminations, then a full forced-crown chain
 * - Forced order after eliminations: (0,1) → (2,2) → (4,3) → (1,4) → (3,0)
 * - Region sizes: R0=6, R1=7, R2=6, R3=3, R4=3
 *
 * The puzzle is generated client-side using the standard
 * createRealmGame function with this fixed seed, guaranteeing
 * the same puzzle every time without hand-designed constants.
 */

export const ONBOARDING_REALM_PUZZLE = {
  seed: 156,
  size: 5,
  difficulty: 'Easy' as const,
  dds: 38,
  dealUuid: 'onboarding-puzzle-v1',
  puzzleName: 'Your First Puzzle',
} as const;
