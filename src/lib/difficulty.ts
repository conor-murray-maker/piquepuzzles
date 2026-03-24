/**
 * Single source of truth for difficulty label from DDS score.
 * Used everywhere: game board badge, win screen, daily challenge, admin dashboard, deal queue.
 */
export function getDifficultyLabel(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
}
