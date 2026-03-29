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
