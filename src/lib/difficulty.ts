/**
 * Single source of truth for difficulty label from DDS score.
 * Used everywhere: game board badge, win screen, daily challenge, admin dashboard, deal queue.
 */
export function getDifficultyLabel(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 51) return 'Medium';
  if (dds < 76) return 'Hard';
  if (dds < 101) return 'Expert';
  if (dds < 131) return 'Master';
  return 'Grandmaster';
}

/**
 * Realm-specific difficulty mapping: grid size → difficulty label.
 * For Realm, difficulty is determined by grid size rather than DDS,
 * since DDS values for small grids (e.g. 5×5 → DDS 33-43) don't align
 * with the generic DDS thresholds.
 */
export function getRealmDifficultyFromGridSize(gridSize: number): string {
  switch (gridSize) {
    case 5: return 'Easy';
    case 6: return 'Medium';
    case 7: return 'Hard';
    case 8: return 'Expert';
    case 9: return 'Master';
    case 10: return 'Grandmaster';
    default: return 'Medium';
}

/**
 * When true and a Realm deal has 30+ empirical samples, difficulty label
 * is recalculated from getDifficultyLabel(dds_blended) instead of grid size.
 * Default: false. Enable via admin deal detail view after manual review.
 */
export const USE_EMPIRICAL_REALM_DIFFICULTY = false;

/**
 * Returns the appropriate difficulty label for a Realm deal,
 * considering the empirical override flag.
 */
export function getRealmDifficulty(
  gridSize: number,
  ddsBlended: number,
  sampleCount: number = 0,
  useEmpirical: boolean = USE_EMPIRICAL_REALM_DIFFICULTY
): string {
  if (useEmpirical && sampleCount >= 30) {
    return getDifficultyLabel(ddsBlended);
  }
  return getRealmDifficultyFromGridSize(gridSize);
}
