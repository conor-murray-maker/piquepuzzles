/**
 * Realm — Crown placement puzzle engine
 * Place one crown per colored region, one per row, one per column, no adjacency (including diagonal).
 */

import { generateSeed } from './deck';

export type CellState = 'empty' | 'marked' | 'crown';

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
}

// Curated palette
const REALM_COLORS = [
  '#E8735A', // coral
  '#4A9E8E', // teal
  '#E8A135', // amber
  '#5B7FA6', // slate blue
  '#7BAF6F', // sage green
  '#9B7BB8', // dusty purple
  '#C4A882', // warm sand
  '#4A7FA5', // steel blue
  '#C4704F', // terracotta
  '#6BB89E', // mint
];

// Seeded PRNG
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ==================== Region Generation ====================

interface RegionGenResult {
  regionMap: number[][]; // grid[row][col] = region index
  regions: number[][]; // region index → cell indices
}

function generateRegions(n: number, rand: () => number): RegionGenResult | null {
  const regionMap: number[][] = Array.from({ length: n }, () => Array(n).fill(-1));
  const regions: number[][] = Array.from({ length: n }, () => []);

  // Seed each region with a random unassigned cell
  const allCells: [number, number][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      allCells.push([r, c]);

  // Shuffle and pick seeds
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
  }

  const seeds: [number, number][] = [];
  for (const [r, c] of allCells) {
    if (seeds.length >= n) break;
    // Ensure seeds aren't too close
    const tooClose = seeds.some(([sr, sc]) => Math.abs(sr - r) + Math.abs(sc - c) < 2);
    if (!tooClose) {
      seeds.push([r, c]);
      regionMap[r][c] = seeds.length - 1;
      regions[seeds.length - 1].push(r * n + c);
    }
  }

  // If we couldn't place enough seeds, fill remaining
  if (seeds.length < n) {
    for (const [r, c] of allCells) {
      if (seeds.length >= n) break;
      if (regionMap[r][c] === -1) {
        seeds.push([r, c]);
        regionMap[r][c] = seeds.length - 1;
        regions[seeds.length - 1].push(r * n + c);
      }
    }
  }

  if (seeds.length < n) return null;

  // Grow regions using BFS-like expansion
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const maxSize = n + 4;
  let unassigned = n * n - n;

  for (let round = 0; round < n * n && unassigned > 0; round++) {
    const order = Array.from({ length: n }, (_, i) => i);
    // Prioritize smaller regions
    order.sort((a, b) => regions[a].length - regions[b].length);

    for (const ri of order) {
      if (regions[ri].length >= maxSize) continue;

      // Find frontier cells
      const frontier: [number, number][] = [];
      for (const idx of regions[ri]) {
        const cr = Math.floor(idx / n);
        const cc = idx % n;
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] === -1) {
            frontier.push([nr, nc]);
          }
        }
      }

      if (frontier.length === 0) continue;

      // Pick random frontier cell
      const [fr, fc] = frontier[Math.floor(rand() * frontier.length)];
      if (regionMap[fr][fc] !== -1) continue;

      regionMap[fr][fc] = ri;
      regions[ri].push(fr * n + fc);
      unassigned--;
    }
  }

  // Assign any remaining
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (regionMap[r][c] === -1) {
        // Assign to smallest adjacent region
        let best = -1;
        let bestSize = Infinity;
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] !== -1) {
            const ri = regionMap[nr][nc];
            if (regions[ri].length < bestSize) {
              best = ri;
              bestSize = regions[ri].length;
            }
          }
        }
        if (best === -1) best = 0;
        regionMap[r][c] = best;
        regions[best].push(r * n + c);
      }
    }
  }

  return { regionMap, regions };
}

function validateRegions(regions: number[][], n: number, regionMap: number[][]): boolean {
  // Size constraints
  const minSize = 3;
  const maxSize = n + 4;
  const sizes = regions.map(r => r.length);

  for (const s of sizes) {
    if (s < minSize || s > maxSize) return false;
  }

  // Max/min ratio
  const maxS = Math.max(...sizes);
  const minS = Math.min(...sizes);
  if (maxS > minS * 2.5) return false;

  // 2D presence: no single-row or single-column strips
  for (const region of regions) {
    const rows = new Set<number>();
    const cols = new Set<number>();
    for (const idx of region) {
      rows.add(Math.floor(idx / n));
      cols.add(idx % n);
    }
    if (rows.size === 1 || cols.size === 1) return false;
  }

  // Orthogonal neighbour check (no thin peninsulas)
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (let ri = 0; ri < regions.length; ri++) {
    for (const idx of regions[ri]) {
      const r = Math.floor(idx / n);
      const c = idx % n;
      let hasNeighbor = false;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && regionMap[nr][nc] === ri) {
          hasNeighbor = true;
          break;
        }
      }
      if (!hasNeighbor) return false;
    }
  }

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
      solutions.push([...placement]);
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
  // Variance of column positions
  const mean = cols.reduce((a, b) => a + b, 0) / cols.length;
  const variance = cols.reduce((s, c) => s + (c - mean) ** 2, 0) / cols.length;
  return variance;
}

// ==================== Deduction Chain Solver ====================

export interface DeductionResult {
  solvable: boolean;
  forcedSteps: number;
  cascadeChain: number; // longest cascade
}

function solveByDeduction(regionMap: number[][], n: number): DeductionResult {
  // Track possible placements per row, col, and region
  const possible: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => true)
  );

  const placed: [number, number][] = [];
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();
  let forcedSteps = 0;
  let longestCascade = 0;

  function eliminate(r: number, c: number): void {
    possible[r][c] = false;
  }

  function placeCrown(r: number, c: number): void {
    placed.push([r, c]);
    usedRows.add(r);
    usedCols.add(c);
    usedRegions.add(regionMap[r][c]);

    // Eliminate entire row, col, and region
    for (let i = 0; i < n; i++) {
      possible[r][i] = false;
      possible[i][c] = false;
    }

    // Eliminate region
    for (let rr = 0; rr < n; rr++)
      for (let cc = 0; cc < n; cc++)
        if (regionMap[rr][cc] === regionMap[r][c]) possible[rr][cc] = false;

    // Eliminate diagonal adjacents
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n) {
          possible[nr][nc] = false;
        }
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
          if (regionMap[r][c] === ri && possible[r][c]) {
            candidates.push([r, c]);
          }
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

  return {
    solvable: placed.length === n,
    forcedSteps,
    cascadeChain: longestCascade,
  };
}

// ==================== Graph Coloring ====================

function assignColors(regionMap: number[][], n: number): string[] {
  // Build adjacency graph
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  const dirs = [[0, 1], [1, 0]];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < n && nc < n) {
          const a = regionMap[r][c];
          const b = regionMap[nr][nc];
          if (a !== b) {
            adj[a].add(b);
            adj[b].add(a);
          }
        }
      }
    }
  }

  // Greedy graph coloring
  const colorAssignment: number[] = Array(n).fill(-1);
  for (let ri = 0; ri < n; ri++) {
    const usedColors = new Set<number>();
    for (const neighbor of adj[ri]) {
      if (colorAssignment[neighbor] !== -1) {
        usedColors.add(colorAssignment[neighbor]);
      }
    }
    for (let ci = 0; ci < REALM_COLORS.length; ci++) {
      if (!usedColors.has(ci)) {
        colorAssignment[ri] = ci;
        break;
      }
    }
    if (colorAssignment[ri] === -1) colorAssignment[ri] = ri % REALM_COLORS.length;
  }

  return colorAssignment.map(ci => REALM_COLORS[ci]);
}

// ==================== DDS Calculation ====================

function calculateRealmDDS(
  n: number,
  deduction: DeductionResult,
  regionSizeVariance: number
): number {
  // Base DDS from grid size
  const sizeRanges: Record<number, [number, number]> = {
    6: [15, 30],
    7: [30, 50],
    8: [45, 65],
    9: [60, 80],
    10: [75, 100],
  };
  const [baseMin, baseMax] = sizeRanges[n] || [50, 70];
  let dds = (baseMin + baseMax) / 2;

  // Modify by deduction chain: more forced steps = easier
  const chainMod = Math.max(-15, Math.min(15, (n - deduction.forcedSteps) * 3));
  dds += chainMod;

  // Modify by region size variance: more uniform = easier
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
}

export function generateRealmPuzzle(seed: number): RealmDeal | null {
  const rand = seededRandom(seed);

  // Determine grid size from seed
  const sizeWeights = [6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10];
  const n = sizeWeights[Math.floor(rand() * sizeWeights.length)];

  for (let attempt = 0; attempt < 20; attempt++) {
    const regResult = generateRegions(n, rand);
    if (!regResult) continue;

    const { regionMap, regions } = regResult;
    if (!validateRegions(regions, n, regionMap)) continue;

    // Find solutions
    const solutions = findAllSolutions(regionMap, n, 3);
    if (solutions.length !== 1) continue;

    const solution = solutions[0];

    // Spatial surprise check
    const surprise = spatialSurpriseScore(solution, n);
    if (surprise < 4.0) continue;

    // Deduction chain verification
    const deduction = solveByDeduction(regionMap, n);
    if (!deduction.solvable) continue;

    // Region size variance
    const sizes = regions.map(r => r.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance = sizes.reduce((s, sz) => s + (sz - avgSize) ** 2, 0) / sizes.length;

    const dds = calculateRealmDDS(n, deduction, sizeVariance);
    const regionColors = assignColors(regionMap, n);

    return {
      regionMap,
      regions,
      solution,
      size: n,
      dds,
      deduction,
      regionColors,
    };
  }

  return null;
}

// ==================== Game State Creation ====================

export function createRealmGame(seed?: number): RealmState {
  const actualSeed = seed ?? generateSeed();
  const deal = generateRealmPuzzle(actualSeed);

  if (!deal) {
    // Fallback: generate a simple 6x6 puzzle
    return createFallbackRealmGame(actualSeed);
  }

  const grid: RealmCell[][] = Array.from({ length: deal.size }, (_, r) =>
    Array.from({ length: deal.size }, (_, c) => ({
      row: r,
      col: c,
      region: deal.regionMap[r][c],
      state: 'empty' as CellState,
    }))
  );

  const difficulty = ddsToRealmDifficulty(deal.dds);

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
    dealId: `realm-${actualSeed}`,
    difficulty,
    difficultyScore: deal.dds,
    seed: actualSeed,
    minMoves: deal.size, // minimum is N placements
  };
}

function createFallbackRealmGame(seed: number): RealmState {
  // Simple 6x6 with diagonal solution
  const n = 6;
  const regionMap: number[][] = [];
  for (let r = 0; r < n; r++) {
    regionMap.push([]);
    for (let c = 0; c < n; c++) {
      regionMap[r].push(Math.floor((r * n + c) * n / (n * n)));
    }
  }

  // Manually create valid regions for a 6x6
  const regions: number[][] = Array.from({ length: n }, () => []);
  // Assign cells to regions in blocks
  const blockRows = 2;
  const blockCols = 3;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const ri = Math.floor(r / blockRows) * (n / blockCols) + Math.floor(c / blockCols);
      const regionIdx = Math.min(ri, n - 1);
      regionMap[r][c] = regionIdx;
      regions[regionIdx].push(r * n + c);
    }
  }

  // Simple non-adjacent solution
  const solution: [number, number][] = [[0, 1], [1, 4], [2, 0], [3, 3], [4, 5], [5, 2]];

  const grid: RealmCell[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => ({
      row: r,
      col: c,
      region: regionMap[r][c],
      state: 'empty' as CellState,
    }))
  );

  return {
    grid,
    size: n,
    regions,
    regionColors: REALM_COLORS.slice(0, n),
    solution,
    moves: 0,
    startTime: Date.now(),
    hintsUsed: 0,
    undosUsed: 0,
    isWon: false,
    errors: 0,
    maxErrors: 3,
    dealId: `realm-${seed}`,
    difficulty: 'Easy',
    difficultyScore: 20,
    seed,
    minMoves: n,
  };
}

function ddsToRealmDifficulty(dds: number): 'Easy' | 'Medium' | 'Hard' | 'Expert' {
  if (dds < 26) return 'Easy';
  if (dds < 56) return 'Medium';
  if (dds < 81) return 'Hard';
  return 'Expert';
}

// ==================== Game Actions ====================

export function cycleCell(state: RealmState, row: number, col: number): RealmState {
  const cell = state.grid[row][col];
  const currentState = cell.state;

  // empty → marked → crown → empty
  let nextState: CellState;
  if (currentState === 'empty') nextState = 'marked';
  else if (currentState === 'marked') nextState = 'crown';
  else nextState = 'empty';

  const newGrid = state.grid.map(r => r.map(c => ({ ...c })));
  newGrid[row][col].state = nextState;

  let newErrors = state.errors;
  let newIsWon = false;

  // Check if crown placement is valid
  if (nextState === 'crown') {
    const error = checkCrownError(newGrid, row, col, state.size);
    if (error) {
      newErrors++;
      // Auto-clear error after animation
      setTimeout(() => {}, 1000);
    }
  }

  // Check win condition
  const crowns = getCrowns(newGrid, state.size);
  if (crowns.length === state.size) {
    newIsWon = checkWin(crowns, state.solution);
  }

  return {
    ...state,
    grid: newGrid,
    moves: state.moves + 1,
    errors: newErrors,
    isWon: newIsWon,
  };
}

function getCrowns(grid: RealmCell[][], n: number): [number, number][] {
  const crowns: [number, number][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (grid[r][c].state === 'crown') crowns.push([r, c]);
  return crowns;
}

function checkCrownError(grid: RealmCell[][], row: number, col: number, n: number): boolean {
  // Check row
  for (let c = 0; c < n; c++) {
    if (c !== col && grid[row][c].state === 'crown') return true;
  }
  // Check col
  for (let r = 0; r < n; r++) {
    if (r !== row && grid[r][col].state === 'crown') return true;
  }
  // Check region
  const region = grid[row][col].region;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if ((r !== row || c !== col) && grid[r][c].region === region && grid[r][c].state === 'crown') return true;
  // Check adjacency (including diagonal)
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc].state === 'crown') return true;
    }
  return false;
}

function checkWin(crowns: [number, number][], solution: [number, number][]): boolean {
  if (crowns.length !== solution.length) return false;
  const solSet = new Set(solution.map(([r, c]) => `${r},${c}`));
  return crowns.every(([r, c]) => solSet.has(`${r},${c}`));
}

// ==================== Hint System ====================

export function getRealmHint(state: RealmState): { row: number; col: number; action: 'crown' | 'eliminate' } | null {
  // Find a cell where a crown must go or cannot go based on current deductions
  const n = state.size;
  const grid = state.grid;

  // First: find cells that can be eliminated
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c].state !== 'empty') continue;

      // If there's already a crown in this row, col, or region, eliminate
      const region = grid[r][c].region;
      let canEliminate = false;

      // Check row
      for (let cc = 0; cc < n; cc++)
        if (cc !== c && grid[r][cc].state === 'crown') canEliminate = true;
      // Check col
      for (let rr = 0; rr < n; rr++)
        if (rr !== r && grid[rr][c].state === 'crown') canEliminate = true;
      // Check region
      for (let rr = 0; rr < n; rr++)
        for (let cc = 0; cc < n; cc++)
          if ((rr !== r || cc !== c) && grid[rr][cc].region === region && grid[rr][cc].state === 'crown')
            canEliminate = true;
      // Check adjacency
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

  // Then: find forced crown placements from solution
  for (const [sr, sc] of state.solution) {
    if (grid[sr][sc].state === 'empty') {
      return { row: sr, col: sc, action: 'crown' };
    }
  }

  return null;
}
