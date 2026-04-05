/**
 * Realm — Crown placement puzzle engine
 * Place one crown per colored region, one per row, one per column, no adjacency (including diagonal).
 */

import { generateSeed } from './deck';

export type CellState = 'empty' | 'marked' | 'auto-marked' | 'crown';

export interface RealmCell {
  row: number;
  col: number;
  region: number;
  state: CellState;
}

export interface RealmState {
  grid: RealmCell[][];
  size: number;
  regions: number[][]; // region index → list of cell indices (row * size + col)
  regionColors: string[];
  solution: [number, number][]; // [row, col] for each crown
  moves: number;
  startTime: number;
  hintsUsed: number;
  undosUsed: number;
  isWon: boolean;
  errors: number;
  maxErrors: number;
  dealId: string;
  dealUuid?: string;
  difficulty: string;
  difficultyScore: number;
  seed?: number;
  minMoves?: number;
  puzzleName?: string;
  /** Maps crown "r,c" → list of auto-marked "r,c" cell keys */
  autoMarkMap: Record<string, string[]>;
  /** Unique game ID to prevent duplicate complete-game calls */
  gameId: string;
}

// Maximally perceptually distinct palette (12 colours for up to 12x12)
const REALM_COLORS = [
  '#E8735A', // coral
  '#2A9D8F', // teal
  '#E9C46A', // amber
  '#3A86FF', // deep blue
  '#6A994E', // sage
  '#9B5DE5', // purple
  '#F15BB5', // rose
  '#F4A261', // orange
  '#2D6A4F', // forest
  '#8E9AAF', // slate
  '#D4A373', // tan
  '#00B4D8', // cyan
];

// Seeded PRNG
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;

// ==================== Region Generation (Flood-Fill Growth) ====================

interface RegionGenResult {
  regionMap: number[][];
  regions: number[][];
}

function generateRegions(n: number, rand: () => number): RegionGenResult | null {
  
  const regionMap: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const regions: number[][] = Array.from({ length: n }, () => []);

  // Step 1: Place N seed cells with minimum manhattan distance of 2
  const seeds: [number, number][] = [];
  let attempts = 0;
  while (seeds.length < n && attempts < 1000) {
    attempts++;
    const r = Math.floor(rand() * n);
    const c = Math.floor(rand() * n);
    const tooClose = seeds.some(([sr, sc]) => Math.abs(sr - r) + Math.abs(sc - c) < 2);
    if (!tooClose) {
      seeds.push([r, c]);
      const ri = seeds.length - 1;
      regionMap[r][c] = ri;
      regions[ri].push(r * n + c);
    }
  }
  if (seeds.length < n) return null;

  // Step 2: Flood fill — round-robin growth with compact bias
  let unfilled = n * n - n;
  let safetyCounter = 0;
  const maxSafety = n * n * 20;
  while (unfilled > 0 && safetyCounter < maxSafety) {
    safetyCounter++;
    let anyGrew = false;
    for (let regionId = 0; regionId < n; regionId++) {
      // Collect candidate cells adjacent to this region
      const candidates: { r: number; c: number; weight: number }[] = [];
      const seen = new Set<string>();
      for (const idx of regions[regionId]) {
        const cr = Math.floor(idx / n);
        const cc = idx % n;
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          const key = `${nr},${nc}`;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] === -1 && !seen.has(key)) {
            seen.add(key);
            // Weight by how many neighbours are already in this region (compact bias)
            let neighboursInRegion = 0;
            for (const [dr2, dc2] of DIRS) {
              const nr2 = nr + dr2;
              const nc2 = nc + dc2;
              if (nr2 >= 0 && nr2 < n && nc2 >= 0 && nc2 < n && regionMap[nr2][nc2] === regionId) {
                neighboursInRegion++;
              }
            }
            candidates.push({ r: nr, c: nc, weight: neighboursInRegion + 1 });
          }
        }
      }
      if (candidates.length === 0) continue;

      // Weighted random pick
      const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
      let pick = rand() * totalWeight;
      for (const { r, c, weight } of candidates) {
        pick -= weight;
        if (pick <= 0) {
          regionMap[r][c] = regionId;
          regions[regionId].push(r * n + c);
          unfilled--;
          anyGrew = true;
          break;
        }
      }
    }
    if (!anyGrew) break;
  }

  // If any cells remain unfilled, assign to nearest neighbour region
  if (unfilled > 0) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (regionMap[r][c] !== -1) continue;
        for (const [dr, dc] of DIRS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] !== -1) {
            regionMap[r][c] = regionMap[nr][nc];
            regions[regionMap[nr][nc]].push(r * n + c);
            break;
          }
        }
      }
    }
  }

  // Step 3: Minimal validation — contiguous regions of reasonable size only
  for (let ri = 0; ri < n; ri++) {
    if (regions[ri].length < 3 || regions[ri].length > n * 2) return null;

    // Contiguity check via BFS
    const cellSet = new Set(regions[ri].map(idx => idx));
    const visited = new Set<number>();
    const queue = [regions[ri][0]];
    visited.add(regions[ri][0]);
    while (queue.length > 0) {
      const idx = queue.shift()!;
      const cr = Math.floor(idx / n);
      const cc = idx % n;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
          const nIdx = nr * n + nc;
          if (cellSet.has(nIdx) && !visited.has(nIdx)) {
            visited.add(nIdx);
            queue.push(nIdx);
          }
        }
      }
    }
    if (visited.size !== regions[ri].length) return null;
  }

  console.log(`[Realm] Generated regions for ${n}x${n}: sizes=[${regions.map(r => r.length).join(',')}]`);
  return { regionMap, regions };
}

// validateRegions is now redundant — Stage 1 checks are inline in generateRegions
function validateRegions(_regions: number[][], _n: number, _regionMap: number[][]): boolean {
  return true;
}

// ==================== Solution Finding ====================

/** Sentinel return value when solver times out */
const SOLVER_TIMEOUT_SENTINEL: [number, number][][] | 'timeout' = 'timeout';

function findAllSolutions(regionMap: number[][], n: number, maxSolutions: number = 3, timeoutMs: number = 200): [number, number][][] | 'timeout' {
  const solutions: [number, number][][] = [];
  const placement: [number, number][] = [];
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();
  const startTime = Date.now();
  let timedOut = false;
  let checks = 0;

  function isAdjacentToExisting(row: number, col: number): boolean {
    for (const [pr, pc] of placement) {
      if (Math.abs(pr - row) <= 1 && Math.abs(pc - col) <= 1) return true;
    }
    return false;
  }

  function solve(row: number): void {
    if (timedOut || solutions.length >= maxSolutions) return;
    // Check timeout every 500 recursive calls to avoid excessive Date.now() overhead
    if (++checks % 500 === 0 && (Date.now() - startTime) > timeoutMs) {
      timedOut = true;
      return;
    }
    if (row === n) {
      solutions.push([...placement.map(([r, c]) => [r, c] as [number, number])]);
      return;
    }

    for (let col = 0; col < n; col++) {
      if (timedOut) return;
      if (usedCols.has(col)) continue;
      const region = regionMap[row][col];
      if (usedRegions.has(region)) continue;
      if (isAdjacentToExisting(row, col)) continue;

      placement.push([row, col]);
      usedCols.add(col);
      usedRegions.add(region);
      solve(row + 1);
      placement.pop();
      usedCols.delete(col);
      usedRegions.delete(region);
    }
  }

  solve(0);
  if (timedOut) return 'timeout';
  return solutions;
}

// ==================== Spatial Surprise ====================

function spatialSurpriseScore(solution: [number, number][], n: number): number {
  const cols = solution.map(([, c]) => c);
  const mean = cols.reduce((a, b) => a + b, 0) / cols.length;
  const variance = cols.reduce((s, c) => s + (c - mean) ** 2, 0) / cols.length;
  return variance;
}

// ==================== Deduction Chain Solver ====================

export interface DeductionResult {
  solvable: boolean;
  forcedSteps: number;
  cascadeChain: number;
}

function solveByDeduction(regionMap: number[][], n: number): DeductionResult {
  const possible: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => true)
  );

  const placed: [number, number][] = [];
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();
  let forcedSteps = 0;
  let longestCascade = 0;

  function placeCrown(r: number, c: number): void {
    placed.push([r, c]);
    usedRows.add(r);
    usedCols.add(c);
    usedRegions.add(regionMap[r][c]);

    for (let i = 0; i < n; i++) {
      possible[r][i] = false;
      possible[i][c] = false;
    }
    for (let rr = 0; rr < n; rr++)
      for (let cc = 0; cc < n; cc++)
        if (regionMap[rr][cc] === regionMap[r][c]) possible[rr][cc] = false;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) possible[nr][nc] = false;
      }
  }

  let progress = true;
  while (progress && placed.length < n) {
    progress = false;
    let cascade = 0;

    // Check each region for forced placement
    for (let ri = 0; ri < n; ri++) {
      if (usedRegions.has(ri)) continue;
      const candidates: [number, number][] = [];
      for (let r = 0; r < n; r++) {
        if (usedRows.has(r)) continue;
        for (let c = 0; c < n; c++) {
          if (usedCols.has(c)) continue;
          if (regionMap[r][c] === ri && possible[r][c]) candidates.push([r, c]);
        }
      }
      if (candidates.length === 1) {
        placeCrown(candidates[0][0], candidates[0][1]);
        forcedSteps++;
        cascade++;
        progress = true;
      }
    }

    // Check each row for forced placement
    for (let r = 0; r < n; r++) {
      if (usedRows.has(r)) continue;
      const candidates: [number, number][] = [];
      for (let c = 0; c < n; c++) {
        if (usedCols.has(c)) continue;
        if (possible[r][c]) candidates.push([r, c]);
      }
      if (candidates.length === 1) {
        placeCrown(candidates[0][0], candidates[0][1]);
        forcedSteps++;
        cascade++;
        progress = true;
      }
    }

    // Check each col for forced placement
    for (let c = 0; c < n; c++) {
      if (usedCols.has(c)) continue;
      const candidates: [number, number][] = [];
      for (let r = 0; r < n; r++) {
        if (usedRows.has(r)) continue;
        if (possible[r][c]) candidates.push([r, c]);
      }
      if (candidates.length === 1) {
        placeCrown(candidates[0][0], candidates[0][1]);
        forcedSteps++;
        cascade++;
        progress = true;
      }
    }

    if (cascade > longestCascade) longestCascade = cascade;
  }

  return { solvable: placed.length === n, forcedSteps, cascadeChain: longestCascade };
}

// ==================== Graph Coloring ====================

function assignColors(n: number, rand: () => number): string[] {
  // Shuffled one-to-one mapping — N regions get N unique colours
  const indices = Array.from({ length: REALM_COLORS.length }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const assigned = indices.slice(0, n).map(i => REALM_COLORS[i]);
  console.log(`[Realm] Region colours: ${assigned.map((c, i) => `R${i}=${c}`).join(', ')}`);
  return assigned;
}

// ==================== DDS Calculation ====================

function calculateRealmDDS(n: number, deduction: DeductionResult, regionSizeVariance: number): number {
  const sizeRanges: Record<number, [number, number]> = {
    4: [5, 15], 5: [10, 25], 6: [15, 30], 7: [30, 50], 8: [45, 65],
    9: [60, 80], 10: [75, 100], 11: [100, 130], 12: [120, 150],
  };
  const [baseMin, baseMax] = sizeRanges[n] || [50, 70];
  let dds = (baseMin + baseMax) / 2;
  const chainMod = Math.max(-15, Math.min(15, (n - deduction.forcedSteps) * 3));
  dds += chainMod;
  const varianceMod = Math.min(10, regionSizeVariance * 2);
  dds += varianceMod;
  return Math.max(0, Math.min(150, Math.round(dds)));
}

// ==================== Main Generation ====================

export interface RealmDeal {
  regionMap: number[][];
  regions: number[][];
  solution: [number, number][];
  size: number;
  dds: number;
  deduction: DeductionResult;
  regionColors: string[];
  spatialSurprise: number;
}

function createRealmStateFromDeal(deal: RealmDeal, seed: number): RealmState {
  const grid: RealmCell[][] = Array.from({ length: deal.size }, (_, r) =>
    Array.from({ length: deal.size }, (_, c) => ({
      row: r,
      col: c,
      region: deal.regionMap[r][c],
      state: 'empty' as CellState,
    }))
  );

  return {
    grid,
    size: deal.size,
    regions: deal.regions,
    regionColors: deal.regionColors,
    solution: deal.solution,
    moves: 0,
    startTime: Date.now(),
    hintsUsed: 0,
    undosUsed: 0,
    isWon: false,
    errors: 0,
    maxErrors: 3,
    dealId: `realm-${seed}`,
    difficulty: ddsToRealmDifficulty(deal.dds),
    difficultyScore: deal.dds,
    seed,
    minMoves: deal.size,
    autoMarkMap: {},
    gameId: generateGameId(),
  };
}

export interface RealmGenOptions {
  /** Force a specific grid size instead of random selection */
  gridSize?: number;
  /** Skip Stage 4 spatial surprise check */
  skipSpatialSurprise?: boolean;
  /** Timeout in ms — abort candidate if verification exceeds this */
  timeoutMs?: number;
}

export function generateRealmPuzzle(seed: number, options?: RealmGenOptions): RealmDeal | null {
  const rand = seededRandom(seed);
  const forcedSize = options?.gridSize;
  const skipSurprise = options?.skipSpatialSurprise ?? false;
  const timeoutMs = options?.timeoutMs;

  let n: number;
  if (forcedSize) {
    n = forcedSize;
  } else {
    const sizeWeights = [4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    n = sizeWeights[Math.floor(rand() * sizeWeights.length)];
  }

  const discardCounts = { stage1: 0, stage2: 0, stage3: 0, stage4: 0, deduction: 0, timeout: 0 };
  const genStart = performance.now();

  for (let attempt = 0; attempt < 2000; attempt++) {
    // Check global timeout
    if (timeoutMs && (performance.now() - genStart) > timeoutMs) {
      discardCounts.timeout++;
      break;
    }

    // === Stage 1: Region generation (minimal constraints only) ===
    const regResult = generateRegions(n, rand);
    if (!regResult) { discardCounts.stage1++; continue; }

    const { regionMap, regions } = regResult;
    console.log(`[Realm] S1 pass #${attempt + 1} (${(performance.now() - genStart).toFixed(0)}ms) sizes=[${regions.map(r => r.length).join(',')}]`);

    // === Stage 2+3: Solution finding + uniqueness (with timeout) ===
    const solverResult = findAllSolutions(regionMap, n, 2);
    if (solverResult === 'timeout') { discardCounts.timeout++; continue; }
    if (solverResult.length === 0) { discardCounts.stage2++; continue; }
    if (solverResult.length > 1) { discardCounts.stage3++; continue; }

    const solution = solverResult[0];

    // === Stage 4: Spatial surprise scoring (skip for Easy/small grids) ===
    let surprise = 0;
    if (!skipSurprise) {
      surprise = spatialSurpriseScore(solution, n);
      const maxVariance = (n * n - 1) / 12;
      const surpriseThreshold = maxVariance * 0.4;
      if (surprise < surpriseThreshold) { discardCounts.stage4++; continue; }
    }

    // === Stage 5: Deduction chain — must be fully solvable without guessing ===
    const deduction = solveByDeduction(regionMap, n);
    if (!deduction.solvable) {
      discardCounts.deduction++;
      console.log(`[Realm] Rejected ${n}x${n} puzzle via legacy — deduction chain requires guessing (forced=${deduction.forcedSteps}/${n})`);
      continue;
    }

    const sizes = regions.map(r => r.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance = sizes.reduce((s, sz) => s + (sz - avgSize) ** 2, 0) / sizes.length;

    const dds = calculateRealmDDS(n, deduction, sizeVariance);
    const regionColors = assignColors(n, rand);

    console.log(`[Realm] Accepted ${n}x${n} puzzle via legacy (attempt ${attempt + 1}). DDS=${dds} surprise=${surprise.toFixed(2)} Discards: S1=${discardCounts.stage1} S2=${discardCounts.stage2} S3=${discardCounts.stage3} S4=${discardCounts.stage4} deduction=${discardCounts.deduction} Timeout=${discardCounts.timeout}. Sizes=[${sizes.join(',')}]`);

    return { regionMap, regions, solution, size: n, dds, deduction, regionColors, spatialSurprise: surprise };
  }

  console.warn(`[Realm] Failed all attempts for ${n}x${n}. Discards: S1=${discardCounts.stage1} S2=${discardCounts.stage2} S3=${discardCounts.stage3} S4=${discardCounts.stage4} deduction=${discardCounts.deduction} Timeout=${discardCounts.timeout}`);
  return null;
}

// ==================== Solution-First Generation ====================

export type GenerationStrategy = 'solution-first' | 'legacy' | 'hybrid';

/**
 * Place N non-attacking crowns on an NxN grid (one per row, one per column,
 * no two adjacent including diagonals). Returns null if placement fails.
 */
function placeNonAttackingCrowns(n: number, rand: () => number): [number, number][] | null {
  const placement: [number, number][] = [];
  const usedCols = new Set<number>();

  function isAdjacentToExisting(row: number, col: number): boolean {
    for (const [pr, pc] of placement) {
      if (Math.abs(pr - row) <= 1 && Math.abs(pc - col) <= 1) return true;
    }
    return false;
  }

  function solve(row: number): boolean {
    if (row === n) return true;

    // Shuffle column order for variety
    const cols = Array.from({ length: n }, (_, i) => i);
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }

    for (const col of cols) {
      if (usedCols.has(col)) continue;
      if (isAdjacentToExisting(row, col)) continue;

      placement.push([row, col]);
      usedCols.add(col);
      if (solve(row + 1)) return true;
      placement.pop();
      usedCols.delete(col);
    }
    return false;
  }

  if (!solve(0)) return null;
  return placement;
}

/**
 * Grow N contiguous regions from crown positions outward using flood-fill.
 * Each region is guaranteed to contain its crown cell.
 */
function growRegionsFromCrowns(
  crowns: [number, number][],
  n: number,
  rand: () => number
): RegionGenResult | null {
  const regionMap: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const regions: number[][] = Array.from({ length: n }, () => []);

  // Seed each region at its crown position
  for (let i = 0; i < n; i++) {
    const [r, c] = crowns[i];
    regionMap[r][c] = i;
    regions[i].push(r * n + c);
  }

  // Flood-fill round-robin expansion with compact bias
  let unfilled = n * n - n;
  let safetyCounter = 0;
  const maxSafety = n * n * 20;

  while (unfilled > 0 && safetyCounter < maxSafety) {
    safetyCounter++;
    let anyGrew = false;

    // Randomize region growth order each round for balanced sizes
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const regionId of order) {
      const candidates: { r: number; c: number; weight: number }[] = [];
      const seen = new Set<string>();

      for (const idx of regions[regionId]) {
        const cr = Math.floor(idx / n);
        const cc = idx % n;
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          const key = `${nr},${nc}`;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] === -1 && !seen.has(key)) {
            seen.add(key);
            let neighboursInRegion = 0;
            for (const [dr2, dc2] of DIRS) {
              const nr2 = nr + dr2;
              const nc2 = nc + dc2;
              if (nr2 >= 0 && nr2 < n && nc2 >= 0 && nc2 < n && regionMap[nr2][nc2] === regionId) {
                neighboursInRegion++;
              }
            }
            candidates.push({ r: nr, c: nc, weight: neighboursInRegion + 1 });
          }
        }
      }
      if (candidates.length === 0) continue;

      const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
      let pick = rand() * totalWeight;
      for (const { r, c, weight } of candidates) {
        pick -= weight;
        if (pick <= 0) {
          regionMap[r][c] = regionId;
          regions[regionId].push(r * n + c);
          unfilled--;
          anyGrew = true;
          break;
        }
      }
    }
    if (!anyGrew) break;
  }

  // Assign any remaining unfilled cells to nearest region
  if (unfilled > 0) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (regionMap[r][c] !== -1) continue;
        for (const [dr, dc] of DIRS) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] !== -1) {
            regionMap[r][c] = regionMap[nr][nc];
            regions[regionMap[nr][nc]].push(r * n + c);
            break;
          }
        }
      }
    }
  }

  // Validate: contiguous regions of reasonable size
  for (let ri = 0; ri < n; ri++) {
    if (regions[ri].length < 3 || regions[ri].length > n * 2) return null;

    const cellSet = new Set(regions[ri]);
    const visited = new Set<number>();
    const queue = [regions[ri][0]];
    visited.add(regions[ri][0]);
    while (queue.length > 0) {
      const idx = queue.shift()!;
      const cr = Math.floor(idx / n);
      const cc = idx % n;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
          const nIdx = nr * n + nc;
          if (cellSet.has(nIdx) && !visited.has(nIdx)) {
            visited.add(nIdx);
            queue.push(nIdx);
          }
        }
      }
    }
    if (visited.size !== regions[ri].length) return null;
  }

  return { regionMap, regions };
}

/**
 * Solution-first Realm generator: place crowns first, then grow regions.
 * Dramatically improves throughput for large grids (10+).
 */
export function generateRealmPuzzleSolutionFirst(seed: number, options?: RealmGenOptions): RealmDeal | null {
  const rand = seededRandom(seed);
  const forcedSize = options?.gridSize;
  const skipSurprise = options?.skipSpatialSurprise ?? false;
  const timeoutMs = options?.timeoutMs;

  let n: number;
  if (forcedSize) {
    n = forcedSize;
  } else {
    const sizeWeights = [4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10, 11, 11, 12];
    n = sizeWeights[Math.floor(rand() * sizeWeights.length)];
  }

  const discardCounts = { crown: 0, region: 0, uniqueness: 0, deduction: 0, surprise: 0, timeout: 0 };
  const genStart = performance.now();

  for (let attempt = 0; attempt < 2000; attempt++) {
    if (timeoutMs && (performance.now() - genStart) > timeoutMs) {
      discardCounts.timeout++;
      break;
    }

    // === Stage A: Place N non-attacking crowns ===
    const crowns = placeNonAttackingCrowns(n, rand);
    if (!crowns) { discardCounts.crown++; continue; }

    // === Stage B: Grow regions from crown positions ===
    const regResult = growRegionsFromCrowns(crowns, n, rand);
    if (!regResult) { discardCounts.region++; continue; }

    const { regionMap, regions } = regResult;

    // === Stage C: Verify uniqueness — the placed crowns should be the ONLY solution ===
    const solverResult = findAllSolutions(regionMap, n, 2);
    if (solverResult === 'timeout') { discardCounts.timeout++; continue; }
    if (solverResult.length !== 1) { discardCounts.uniqueness++; continue; }

    const solution = solverResult[0];

    // === Stage D: Deduction chain — must be fully solvable without guessing ===
    const deduction = solveByDeduction(regionMap, n);
    if (!deduction.solvable) {
      discardCounts.deduction++;
      console.log(`[Realm] Rejected ${n}x${n} puzzle — unique solution but deduction chain requires guessing (forced=${deduction.forcedSteps}/${n})`);
      continue;
    }

    // === Stage E: Spatial surprise scoring ===
    let surprise = 0;
    if (!skipSurprise) {
      surprise = spatialSurpriseScore(solution, n);
      const maxVariance = (n * n - 1) / 12;
      const surpriseThreshold = maxVariance * 0.4;
      if (surprise < surpriseThreshold) { discardCounts.surprise++; continue; }
    }

    // All stages passed — compute DDS
    const sizes = regions.map(r => r.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance = sizes.reduce((s, sz) => s + (sz - avgSize) ** 2, 0) / sizes.length;

    const dds = calculateRealmDDS(n, deduction, sizeVariance);
    const regionColors = assignColors(n, rand);

    console.log(`[Realm] Accepted ${n}x${n} puzzle via solution-first (attempt ${attempt + 1}). DDS=${dds} surprise=${surprise.toFixed(2)} Discards: crown=${discardCounts.crown} region=${discardCounts.region} uniq=${discardCounts.uniqueness} deduction=${discardCounts.deduction} surprise=${discardCounts.surprise} timeout=${discardCounts.timeout}. Sizes=[${sizes.join(',')}]`);

    return { regionMap, regions, solution, size: n, dds, deduction, regionColors, spatialSurprise: surprise };
  }

  console.warn(`[Realm] Solution-first failed for ${n}x${n}. Discards: crown=${discardCounts.crown} region=${discardCounts.region} uniq=${discardCounts.uniqueness} deduction=${discardCounts.deduction} surprise=${discardCounts.surprise} timeout=${discardCounts.timeout}`);
  return null;
}



let gameIdCounter = 0;
function generateGameId(): string {
  return `realm-${Date.now()}-${++gameIdCounter}`;
}

/**
 * Rebuild a Realm puzzle directly from a stored region map.
 * The region map is the ground truth — no region-growing step needed.
 * Completes in <10ms for any grid size.
 */
export function rebuildFromRegionMap(
  regionMap: number[][],
  seed: number
): RealmState {
  const n = regionMap.length;
  const rand = seededRandom(seed);
  const startMs = performance.now();

  // Build regions array from the stored region map
  const regions: number[][] = Array.from({ length: n }, () => []);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      regions[regionMap[r][c]].push(r * n + c);
    }
  }

  // Find the unique solution
  const solverResult = findAllSolutions(regionMap, n, 2);
  if (solverResult === 'timeout' || solverResult.length !== 1) {
    throw new Error(`[Realm] rebuildFromRegionMap: expected exactly 1 solution for ${n}x${n}, got ${solverResult === 'timeout' ? 'timeout' : solverResult.length}`);
  }
  const solution = solverResult[0];

  // Compute DDS and deduction for metadata
  const deduction = solveByDeduction(regionMap, n);
  const sizes = regions.map(r => r.length);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const sizeVariance = sizes.reduce((s, sz) => s + (sz - avgSize) ** 2, 0) / sizes.length;
  const dds = calculateRealmDDS(n, deduction, sizeVariance);
  const regionColors = assignColors(n, rand);

  const elapsed = (performance.now() - startMs).toFixed(1);
  console.log(`[Realm] Rebuilt ${n}x${n} from region_map in ${elapsed}ms. DDS=${dds}`);

  const deal: RealmDeal = { regionMap, regions, solution, size: n, dds, deduction, regionColors, spatialSurprise: 0 };
  return createRealmStateFromDeal(deal, seed);
}

export function createRealmGame(seed?: number, gridSize?: number, regionMap?: number[][]): RealmState {
  const actualSeed = seed ?? generateSeed();

  // Fast path: rebuild directly from stored region map (Master/Grandmaster deals)
  if (regionMap && regionMap.length > 0) {
    return rebuildFromRegionMap(regionMap, actualSeed);
  }

  const deal = generateRealmPuzzle(actualSeed, gridSize ? { gridSize } : undefined);

  if (!deal) {
    return createFallbackRealmGame(actualSeed, gridSize);
  }

  return createRealmStateFromDeal(deal, actualSeed);
}

/**
 * Async wrapper with timeout for Grandmaster deals without crown positions.
 * Returns null if reconstruction exceeds the timeout.
 */
export function createRealmGameWithTimeout(
  seed: number,
  gridSize: number,
  timeoutMs: number = 5000
): Promise<RealmState | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[Realm] Grandmaster reconstruction timed out after ${timeoutMs / 1000}s — falling back to next deal`);
      resolve(null);
    }, timeoutMs);

    // Run synchronously — if it completes before the timeout, great
    try {
      const result = createRealmGame(seed, gridSize);
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      console.error('[Realm] Grandmaster reconstruction failed:', e);
      resolve(null);
    }
  });
}

function createFallbackRealmGame(seed: number, gridSize?: number): RealmState {
  for (let offset = 1; offset <= 200; offset++) {
    const retrySeed = seed + offset;
    const deal = generateRealmPuzzle(retrySeed, gridSize ? { gridSize } : undefined);
    if (deal) {
      console.warn(`[Realm] Recovered generation with retry seed ${retrySeed}`);
      return createRealmStateFromDeal(deal, retrySeed);
    }
  }

  throw new Error('Realm generation failed after exhausting recovery attempts');
}

function ddsToRealmDifficulty(dds: number): string {
  if (dds < 26) return 'Easy';
  if (dds < 51) return 'Medium';
  if (dds < 76) return 'Hard';
  if (dds < 101) return 'Expert';
  if (dds < 131) return 'Master';
  return 'Grandmaster';
}

// ==================== Constraint-Based Win Check ====================

/** Check if crowns satisfy ALL constraints — does NOT compare to stored solution */
function checkConstraintWin(grid: RealmCell[][], n: number): boolean {
  const crowns: [number, number][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (grid[r][c].state === 'crown') crowns.push([r, c]);

  if (crowns.length !== n) return false;

  const rows = new Set(crowns.map(([r]) => r));
  const cols = new Set(crowns.map(([, c]) => c));
  const regions = new Set(crowns.map(([r, c]) => grid[r][c].region));

  // One per row, one per col, one per region
  if (rows.size !== n || cols.size !== n || regions.size !== n) return false;

  // No adjacency (including diagonal)
  for (let i = 0; i < crowns.length; i++) {
    for (let j = i + 1; j < crowns.length; j++) {
      if (Math.abs(crowns[i][0] - crowns[j][0]) <= 1 && Math.abs(crowns[i][1] - crowns[j][1]) <= 1) {
        return false;
      }
    }
  }

  return true;
}

// ==================== Auto-Mark Calculation ====================

function getAutoMarkCells(grid: RealmCell[][], row: number, col: number, n: number): string[] {
  const region = grid[row][col].region;
  const marks: string[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r === row && c === col) continue;
      const cell = grid[r][c];
      if (cell.state === 'crown' || cell.state === 'marked') continue;

      const sameRow = r === row;
      const sameCol = c === col;
      const sameRegion = cell.region === region;
      const adjacent = Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1;

      if (sameRow || sameCol || sameRegion || adjacent) {
        marks.push(`${r},${c}`);
      }
    }
  }

  return marks;
}

// ==================== Game Actions ====================

export function cycleCell(state: RealmState, row: number, col: number): RealmState {
  const cell = state.grid[row][col];
  const currentState = cell.state;

  // Don't cycle auto-marked cells — treat them like empty for cycling
  let nextState: CellState;
  if (currentState === 'empty' || currentState === 'auto-marked') nextState = 'marked';
  else if (currentState === 'marked') nextState = 'crown';
  else nextState = 'empty';

  const newGrid = state.grid.map(r => r.map(c => ({ ...c })));
  let newAutoMarkMap = { ...state.autoMarkMap };
  let newErrors = state.errors;

  if (nextState === 'crown') {
    // Check for errors
    const error = checkCrownError(newGrid, row, col, state.size);
    if (error) {
      newErrors++;
      newGrid[row][col].state = 'crown'; // Temporarily place for animation
    } else {
      newGrid[row][col].state = 'crown';
      // Apply auto-marks
      const autoMarks = getAutoMarkCells(newGrid, row, col, state.size);
      const crownKey = `${row},${col}`;
      const appliedMarks: string[] = [];
      for (const key of autoMarks) {
        const [r, c] = key.split(',').map(Number);
        if (newGrid[r][c].state === 'empty') {
          newGrid[r][c].state = 'auto-marked';
          appliedMarks.push(key);
        }
      }
      newAutoMarkMap[crownKey] = appliedMarks;
    }
  } else if (nextState === 'empty' && currentState === 'crown') {
    // Removing a crown — remove its auto-marks
    newGrid[row][col].state = 'empty';
    const crownKey = `${row},${col}`;
    const autoMarks = newAutoMarkMap[crownKey] || [];
    for (const key of autoMarks) {
      const [r, c] = key.split(',').map(Number);
      if (newGrid[r][c].state === 'auto-marked') {
        newGrid[r][c].state = 'empty';
      }
    }
    delete newAutoMarkMap[crownKey];
  } else {
    newGrid[row][col].state = nextState;
  }

  // Check win using constraint-based check
  const newIsWon = checkConstraintWin(newGrid, state.size);

  return {
    ...state,
    grid: newGrid,
    moves: state.moves + 1,
    errors: newErrors,
    isWon: newIsWon,
    autoMarkMap: newAutoMarkMap,
  };
}

/** Apply drag-to-mark: toggle X mark on a cell */
export function toggleMark(state: RealmState, row: number, col: number): RealmState {
  const cell = state.grid[row][col];
  if (cell.state === 'crown') return state; // Skip crowns

  const newGrid = state.grid.map(r => r.map(c => ({ ...c })));

  if (cell.state === 'marked') {
    newGrid[row][col].state = 'empty';
  } else if (cell.state === 'empty' || cell.state === 'auto-marked') {
    newGrid[row][col].state = 'marked';
  }

  return { ...state, grid: newGrid, moves: state.moves + 1 };
}

function checkCrownError(grid: RealmCell[][], row: number, col: number, n: number): boolean {
  // Check row
  for (let c = 0; c < n; c++)
    if (c !== col && grid[row][c].state === 'crown') return true;
  // Check col
  for (let r = 0; r < n; r++)
    if (r !== row && grid[r][col].state === 'crown') return true;
  // Check region
  const region = grid[row][col].region;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if ((r !== row || c !== col) && grid[r][c].region === region && grid[r][c].state === 'crown') return true;
  // Check adjacency
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc].state === 'crown') return true;
    }
  return false;
}

// ==================== Hint System ====================

export function getRealmHint(state: RealmState): { row: number; col: number; action: 'crown' | 'eliminate' } | null {
  const n = state.size;
  const grid = state.grid;

  // Find cells that can be eliminated
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c].state !== 'empty') continue;

      const region = grid[r][c].region;
      let canEliminate = false;

      for (let cc = 0; cc < n; cc++)
        if (cc !== c && grid[r][cc].state === 'crown') canEliminate = true;
      for (let rr = 0; rr < n; rr++)
        if (rr !== r && grid[rr][c].state === 'crown') canEliminate = true;
      for (let rr = 0; rr < n; rr++)
        for (let cc = 0; cc < n; cc++)
          if ((rr !== r || cc !== c) && grid[rr][cc].region === region && grid[rr][cc].state === 'crown')
            canEliminate = true;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc].state === 'crown')
            canEliminate = true;
        }

      if (canEliminate) return { row: r, col: c, action: 'eliminate' };
    }
  }

  // Find forced crown placements from solution
  for (const [sr, sc] of state.solution) {
    if (grid[sr][sc].state === 'empty' || grid[sr][sc].state === 'auto-marked') {
      return { row: sr, col: sc, action: 'crown' };
    }
  }

  return null;
}
