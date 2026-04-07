/**
 * Ghost leaderboard players for daily challenges.
 * Generates deterministic fake players seeded by challenge_id.
 * Ghost players are never written to any DB table.
 */

import { DailyResult } from '@/services/DailyChallengeService';

const GHOST_NAMES = [
  "Arjun S.", "Priya M.", "Rohan V.", "Ananya K.",
  "Dev P.", "Ishaan R.", "Kavya N.", "Vikram T.",
  "Sneha A.", "Aditya B.", "Meera S.", "Karan J.",
  "Divya R.", "Rahul G.", "Pooja T.", "Nikhil M.",
  "Shreya P.", "Amit K.", "Riya S.", "Siddharth N.",
  "James T.", "Sarah K.", "Liam O.", "Emma R.",
  "Noah C.", "Charlotte B.", "Oliver H.", "Isla M.",
  "Harry W.", "Sophie L.", "George F.", "Alice P.",
  "Alfie B.", "Poppy T.", "Freddie M.", "Daisy H.",
  "Archie S.", "Rosie C.", "Jack W.", "Grace L.",
  "Cormac F.", "Aoife M.", "Seán B.", "Niamh R.",
  "Fionn O.", "Ciara K.", "Darragh M.", "Caoimhe S.",
  "Oisín T.", "Siobhán N.", "Rúairí B.", "Ailbhe F.",
  "Preet K.", "Gurpreet S.", "Manpreet B.", "Harpreet T.",
  "Simran K.", "Jaspreet M.", "Navdeep R.", "Balpreet S.",
  "Luca R.", "Marco B.", "Elena V.", "Sofia M.",
  "Lucas D.", "Camille B.", "Hugo L.", "Léa M.",
  "Mateo G.", "Isabella R.", "Ethan W.", "Chloe T.",
  "Mason B.", "Ava L.", "Logan K.", "Mia S.",
  "Ryan M.", "Zoe B."
];

// Simple deterministic hash from string
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Multiple independent hashes by appending index
function ghostHash(challengeId: string, ghostIndex: number, variant: number): number {
  return hashStr(`${challengeId}_ghost_${ghostIndex}_v${variant}`);
}

interface DifficultyTimeRange {
  min: number; // seconds
  max: number; // seconds
}

const DIFFICULTY_TIME_RANGES: Record<string, DifficultyTimeRange> = {
  Easy:   { min: 55, max: 165 },
  Medium: { min: 105, max: 270 },
  Hard:   { min: 210, max: 540 },
  Expert: { min: 420, max: 960 },
};

interface ModeMovesRange {
  min: number;
  max: number;
}

const MODE_MOVES_RANGES: Record<string, ModeMovesRange> = {
  freecell: { min: 68, max: 108 },
  klondike: { min: 85, max: 175 },
  realm:    { min: 18, max: 55 },
};

export function generateGhostPlayers(
  challengeId: string,
  difficulty: string,
  gameMode: string,
  realCompletionCount: number,
): DailyResult[] {
  const TOTAL_GHOSTS = 15;
  const ghostsToShow = Math.max(0, TOTAL_GHOSTS - realCompletionCount);
  if (ghostsToShow === 0) return [];

  const timeRange = DIFFICULTY_TIME_RANGES[difficulty] || DIFFICULTY_TIME_RANGES.Medium;
  const movesRange = MODE_MOVES_RANGES[gameMode] || MODE_MOVES_RANGES.klondike;

  // Generate all 15 ghosts deterministically, then remove slowest ones
  const allGhosts: DailyResult[] = [];
  const usedNameIndices = new Set<number>();
  const challengeOffset = hashStr(challengeId) % GHOST_NAMES.length;

  for (let i = 0; i < TOTAL_GHOSTS; i++) {
    // 1. Name — unique per leaderboard
    const h0 = ghostHash(challengeId, i, 0);
    let nameIdx = (h0 + challengeOffset) % GHOST_NAMES.length;
    let attempts = 0;
    while (usedNameIndices.has(nameIdx) && attempts < GHOST_NAMES.length) {
      nameIdx = (nameIdx + 1) % GHOST_NAMES.length;
      attempts++;
    }
    usedNameIndices.add(nameIdx);

    // 2. Completion time with ±20% variance
    const h1 = ghostHash(challengeId, i, 1);
    const baseTime = timeRange.min + (h1 % (timeRange.max - timeRange.min + 1));
    const variance1 = 0.8 + (h1 % 40) / 100; // 0.80 to 1.19
    const ghostTime = Math.round(baseTime * variance1);

    // 3. Moves with ±15% variance
    const h2 = ghostHash(challengeId, i, 2);
    const baseMoves = movesRange.min + (h2 % (movesRange.max - movesRange.min + 1));
    const variance2 = 0.85 + (h2 % 30) / 100; // 0.85 to 1.14
    const ghostMoves = Math.round(baseMoves * variance2);

    // 4. Sub-second ordering noise
    const h3 = ghostHash(challengeId, i, 3);
    const subSecondOffset = (h3 % 10) / 10;
    const displayTime = ghostTime + subSecondOffset;

    allGhosts.push({
      user_id: `ghost_${i}_${challengeId.slice(0, 8)}`,
      display_name: GHOST_NAMES[nameIdx],
      completed: true,
      completion_time_seconds: Math.round(displayTime),
      moves: ghostMoves,
      hints_used: 0,
      rank: 0, // will be assigned during merge
      current_streak: 0,
    });
  }

  // Sort all ghosts by time (ascending) so we can remove slowest
  allGhosts.sort((a, b) => (a.completion_time_seconds ?? 0) - (b.completion_time_seconds ?? 0));

  // Remove from the slowest end (ghosts removed = realCompletionCount)
  return allGhosts.slice(0, ghostsToShow);
}

/**
 * Merge real leaderboard entries with ghost players.
 * Real players always rank above ghosts with identical times.
 * Returns the merged and re-ranked list.
 */
export function mergeWithGhosts(
  realEntries: DailyResult[],
  ghosts: DailyResult[],
): DailyResult[] {
  const realCompletions = realEntries.filter(e => e.completed);
  const realDNFs = realEntries.filter(e => !e.completed);

  // Merge real completions with ghost completions
  const merged = [...realCompletions, ...ghosts];

  // Sort: real players first at same time, then by time ASC, then moves ASC
  merged.sort((a, b) => {
    const timeA = a.completion_time_seconds ?? Infinity;
    const timeB = b.completion_time_seconds ?? Infinity;
    if (timeA !== timeB) return timeA - timeB;
    // Real players rank above ghosts at same time
    const aIsGhost = a.user_id.startsWith('ghost_');
    const bIsGhost = b.user_id.startsWith('ghost_');
    if (aIsGhost !== bIsGhost) return aIsGhost ? 1 : -1;
    return a.moves - b.moves;
  });

  // Assign ranks
  merged.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  // Append DNFs after completions
  return [...merged, ...realDNFs];
}

export function shouldShowEarlyAccessNote(realCompletionCount: number): boolean {
  return realCompletionCount < 15;
}
