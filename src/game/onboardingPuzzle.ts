/**
 * Onboarding puzzle configuration — seed-based.
 *
 * Uses seed 191 which produces a verified 5×5 puzzle with:
 * - Unique solution (single valid placement)
 * - Fully deductive after first crown at (0,3)
 * - Deduction order: (0,3) → (1,0) → (4,1) → (2,2) → (3,4)
 * - Region sizes: R0=7, R1=5, R2=3, R3=6, R4=4
 *
 * The puzzle is generated client-side using the standard
 * createRealmGame function with this fixed seed, guaranteeing
 * the same puzzle every time without hand-designed constants.
 */

export const ONBOARDING_REALM_PUZZLE = {
  seed: 191,
  size: 5,
  difficulty: 'Easy' as const,
  dds: 20,
  dealUuid: 'onboarding-puzzle-v1',
  puzzleName: 'Your First Puzzle',
} as const;
