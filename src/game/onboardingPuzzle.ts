/**
 * Hardcoded 5×5 onboarding puzzle for first-time Realm players.
 *
 * Design goals:
 * - Every crown placement is forced by row/column/region elimination
 * - Region 1 (B) has only 2 viable cells after the first crown, giving
 *   the player a clear second move bridging from the tutorial
 *
 * Solution adjacency verification (all pairs |Δcol| ≥ 2):
 *   (1,1)↔(0,3): Δrow=1, Δcol=2 → NOT adjacent ✓
 *   (1,1)↔(2,4): Δrow=1, Δcol=3 → NOT adjacent ✓
 *   (1,1)↔(3,0): Δrow=2               → NOT adjacent ✓
 *   (1,1)↔(4,2): Δrow=3               → NOT adjacent ✓
 *   (0,3)↔(2,4): Δrow=2               → NOT adjacent ✓
 *   (0,3)↔(3,0): Δrow=3               → NOT adjacent ✓
 *   (0,3)↔(4,2): Δrow=4               → NOT adjacent ✓
 *   (2,4)↔(3,0): Δrow=1, Δcol=4 → NOT adjacent ✓
 *   (2,4)↔(4,2): Δrow=2               → NOT adjacent ✓
 *   (3,0)↔(4,2): Δrow=1, Δcol=2 → NOT adjacent ✓
 */

export const ONBOARDING_REALM_PUZZLE = {
  size: 5,

  regionMap: [
    [0, 0, 0, 1, 1],
    [2, 0, 1, 1, 3],
    [2, 2, 4, 3, 3],
    [2, 4, 4, 4, 3],
    [2, 2, 4, 4, 3],
  ] as number[][],

  /** [row, col] per region index 0..4 */
  solution: [
    [1, 1], // Region 0 (A)
    [0, 3], // Region 1 (B)
    [3, 0], // Region 2 (C)
    [2, 4], // Region 3 (D)
    [4, 2], // Region 4 (E)
  ] as [number, number][],

  /** regions array: region index → list of flat cell indices (row * size + col) */
  regions: [
    [0, 1, 2, 6],               // Region 0 (A): (0,0)(0,1)(0,2)(1,1)
    [3, 4, 7, 8],               // Region 1 (B): (0,3)(0,4)(1,2)(1,3)
    [5, 10, 11, 15, 20, 21],    // Region 2 (C): (1,0)(2,0)(2,1)(3,0)(4,0)(4,1)
    [9, 13, 14, 19, 24],        // Region 3 (D): (1,4)(2,3)(2,4)(3,4)(4,4)
    [12, 16, 17, 18, 22, 23],   // Region 4 (E): (2,2)(3,1)(3,2)(3,3)(4,2)(4,3)
  ] as number[][],

  /** Region colours — matching the REALM_COLORS palette */
  regionColors: ['#E8735A', '#2A9D8F', '#E9C46A', '#3A86FF', '#6A994E'],

  dealUuid: 'onboarding-puzzle-v1',
  difficulty: 'Easy' as const,
  dds: 20,
} as const;
