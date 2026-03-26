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
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  difficultyScore: number;
  seed?: number;
  minMoves?: number;
  puzzleName?: string;
  /** Maps crown "r,c" → list of auto-marked "r,c" cell keys */
  autoMarkMap: Record<string, string[]>;
  /** Unique game ID to prevent duplicate complete-game calls */
  gameId: string;
}

// Maximally perceptually distinct palette (10 colours)
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
  console.log('GENERATION PATH');
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

function findAllSolutions(regionMap: number[][], n: number, maxSolutions: number = 3): [number, number][][] {
  const solutions: [number, number][][] = [];
  const placement: [number, number][] = [];
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();

  function isAdjacentToExisting(row: number, col: number): boolean {
    for (const [pr, pc] of placement) {
      if (Math.abs(pr - row) <= 1 && Math.abs(pc - col) <= 1) return true;
    }
    return false;
  }

  function solve(row: number): void {
    if (solutions.length >= maxSolutions) return;
    if (row === n) {
      solutions.push([...placement.map(([r, c]) => [r, c] as [number, number])]);
      return;
    }

    for (let col = 0; col < n; col++) {
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
    6: [15, 30], 7: [30, 50], 8: [45, 65], 9: [60, 80], 10: [75, 100],
  };
  const [baseMin, baseMax] = sizeRanges[n] || [50, 70];
  let dds = (baseMin + baseMax) / 2;
  const chainMod = Math.max(-15, Math.min(15, (n - deduction.forcedSteps) * 3));
  dds += chainMod;
  const varianceMod = Math.min(10, regionSizeVariance * 2);
  dds += varianceMod;
  return Math.max(0, Math.min(100, Math.round(dds)));
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

export function generateRealmPuzzle(seed: number): RealmDeal | null {
  const rand = seededRandom(seed);
  const sizeWeights = [6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10];
  const baseSize = sizeWeights[Math.floor(rand() * sizeWeights.length)];

  const discardCounts = { stage1: 0, stage2: 0, stage3: 0, stage4: 0 };
  const genStart = performance.now();

  for (let n = baseSize; n <= 10; n++) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      // === Stage 1: Region generation (minimal constraints only) ===
      const regResult = generateRegions(n, rand);
      if (!regResult) { discardCounts.stage1++; continue; }

      const { regionMap, regions } = regResult;
      console.log(`[Realm] S1 pass #${attempt + 1} (${(performance.now() - genStart).toFixed(0)}ms) sizes=[${regions.map(r => r.length).join(',')}]`);

      // === Stage 2: Solution finding (does ANY valid placement exist?) ===
      const solutions = findAllSolutions(regionMap, n, 2);
      if (solutions.length === 0) { discardCounts.stage2++; continue; }

      // === Stage 3: Unique solution verification (MUST have exactly 1) ===
      if (solutions.length > 1) { discardCounts.stage3++; continue; }

      const solution = solutions[0];

      // === Stage 4: Spatial surprise scoring (dynamic threshold) ===
      const surprise = spatialSurpriseScore(solution, n);
      // Max theoretical variance for N columns: variance of [0,1,...,N-1] = (N^2-1)/12
      const maxVariance = (n * n - 1) / 12;
      const surpriseThreshold = maxVariance * 0.4;
      if (surprise < surpriseThreshold) { discardCounts.stage4++; continue; }

      // All stages passed — compute quality metrics
      const deduction = solveByDeduction(regionMap, n);

      const sizes = regions.map(r => r.length);
      const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const sizeVariance = sizes.reduce((s, sz) => s + (sz - avgSize) ** 2, 0) / sizes.length;

      const dds = calculateRealmDDS(n, deduction, sizeVariance);
      const regionColors = assignColors(n, rand);

      console.log(`[Realm] Accepted ${n}x${n} puzzle (attempt ${attempt + 1}). Discards: S1=${discardCounts.stage1} S2=${discardCounts.stage2} S3=${discardCounts.stage3} S4=${discardCounts.stage4}. Sizes=[${sizes.join(',')}] surprise=${surprise.toFixed(2)} threshold=${surpriseThreshold.toFixed(2)}`);

      return { regionMap, regions, solution, size: n, dds, deduction, regionColors, spatialSurprise: surprise };
    }
  }

  console.warn(`[Realm] Failed all attempts. Discards: S1=${discardCounts.stage1} S2=${discardCounts.stage2} S3=${discardCounts.stage3} S4=${discardCounts.stage4}`);
  return null;
}

// ==================== Game State Creation ====================

let gameIdCounter = 0;
function generateGameId(): string {
  return `realm-${Date.now()}-${++gameIdCounter}`;
}

export function createRealmGame(seed?: number): RealmState {
  const actualSeed = seed ?? generateSeed();
  const deal = generateRealmPuzzle(actualSeed);

  if (!deal) {
    return createFallbackRealmGame(actualSeed);
  }

  return createRealmStateFromDeal(deal, actualSeed);
}

function createFallbackRealmGame(seed: number): RealmState {
  for (let offset = 1; offset <= 200; offset++) {
    const retrySeed = seed + offset;
    const deal = generateRealmPuzzle(retrySeed);
    if (deal) {
      console.warn(`[Realm] Recovered generation with retry seed ${retrySeed}`);
      return createRealmStateFromDeal(deal, retrySeed);
    }
  }

  throw new Error('Realm generation failed after exhausting recovery attempts');
}

function ddsToRealmDifficulty(dds: number): 'Easy' | 'Medium' | 'Hard' | 'Expert' {
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
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
