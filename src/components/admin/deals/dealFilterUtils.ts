import type { DealFilterState } from "./DealFilters";
import { getRealmDifficultyFromGridSize } from "@/lib/difficulty";

export interface DealRow {
  id: string;
  seed: number;
  game_mode: string;
  tier: string;
  dds_initial: number;
  dds_blended: number;
  confidence: number;
  path_diversity_score: number;
  pool_attempts: number;
  pool_wins: number;
  pool_avg_moves: number;
  pool_avg_time: number;
  simulation_count: number;
  simulation_wins: number;
  is_calibration: boolean;
  min_moves: number;
}

function getDifficultyBandDds(dds: number): string {
  if (dds < 26) return "easy";
  if (dds < 51) return "medium";
  if (dds < 76) return "hard";
  if (dds < 101) return "expert";
  if (dds < 131) return "master";
  return "grandmaster";
}

function getDifficultyBand(deal: DealRow): string {
  if (deal.game_mode === "realm") {
    return getRealmDifficultyFromGridSize(deal.min_moves).toLowerCase();
  }
  return getDifficultyBandDds(deal.dds_blended);
}

function getDdsSource(poolAttempts: number): string {
  if (poolAttempts < 30) return "solver";
  if (poolAttempts < 100) return "blending";
  return "empirical";
}

function getConfidenceBand(conf: number): string {
  if (conf > 0.85) return "high";
  if (conf >= 0.7) return "medium";
  return "low";
}

export function applyFilters(deals: DealRow[], filters: DealFilterState): DealRow[] {
  return deals.filter(d => {
    if (filters.gameMode !== "all" && d.game_mode !== filters.gameMode) return false;
    if (filters.difficulty !== "all" && getDifficultyBand(d.dds_blended) !== filters.difficulty) return false;
    if (filters.ddsSource !== "all" && getDdsSource(d.pool_attempts) !== filters.ddsSource) return false;

    if (filters.confidence !== "all") {
      const band = getConfidenceBand(d.confidence);
      if (band !== filters.confidence) return false;
    }

    if (filters.poolAttempts !== "all") {
      if (filters.poolAttempts === "0" && d.pool_attempts !== 0) return false;
      if (filters.poolAttempts === "1-10" && (d.pool_attempts < 1 || d.pool_attempts > 10)) return false;
      if (filters.poolAttempts === "11-50" && (d.pool_attempts < 11 || d.pool_attempts > 50)) return false;
      if (filters.poolAttempts === "50+" && d.pool_attempts <= 50) return false;
    }

    if (filters.pathDiversity !== "all") {
      if (filters.pathDiversity === "below_0.15" && d.path_diversity_score >= 0.15) return false;
      if (filters.pathDiversity === "0.15_0.30" && (d.path_diversity_score < 0.15 || d.path_diversity_score > 0.30)) return false;
      if (filters.pathDiversity === "above_0.30" && d.path_diversity_score <= 0.30) return false;
    }

    return true;
  });
}

export function computeSummaryStats(deals: DealRow[]) {
  const n = deals.length;
  if (n === 0) return { count: 0, avgDds: 0, avgConfidence: 0, avgPd: 0, avgSimCount: 0, empiricalPct: 0 };

  let totalDds = 0, totalConf = 0, totalPd = 0, totalSim = 0, empiricalCount = 0;
  for (const d of deals) {
    totalDds += d.dds_blended;
    totalConf += d.confidence;
    totalPd += d.path_diversity_score;
    totalSim += d.simulation_count;
    if (d.pool_attempts >= 30) empiricalCount++;
  }

  return {
    count: n,
    avgDds: totalDds / n,
    avgConfidence: totalConf / n,
    avgPd: totalPd / n,
    avgSimCount: totalSim / n,
    empiricalPct: (empiricalCount / n) * 100,
  };
}

export function computeHealthStats(deals: DealRow[]) {
  const byConfBand: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  const byBand: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0, Expert: 0, Master: 0, Grandmaster: 0 };
  let solverOnly = 0, blending = 0, empirical = 0, totalConf = 0;
  const confHistogram = Array(10).fill(0);

  for (const d of deals) {
    totalConf += d.confidence;
    const bucket = Math.min(9, Math.floor(d.confidence * 10));
    confHistogram[bucket]++;
    if (d.pool_attempts < 30) solverOnly++;
    else if (d.pool_attempts < 100) blending++;
    else empirical++;

    // Confidence band
    if (d.confidence > 0.85) byConfBand.High++;
    else if (d.confidence >= 0.7) byConfBand.Medium++;
    else byConfBand.Low++;

    const dds = d.dds_blended;
    if (dds < 26) byBand.Easy++;
    else if (dds < 51) byBand.Medium++;
    else if (dds < 76) byBand.Hard++;
    else if (dds < 101) byBand.Expert++;
    else if (dds < 131) byBand.Master++;
    else byBand.Grandmaster++;
  }

  return {
    total: deals.length,
    byConfBand,
    byBand,
    avgConfidence: deals.length ? (totalConf / deals.length).toFixed(2) : "0",
    solverOnly,
    blending,
    empirical,
    confHistogram: confHistogram.map((count, i) => ({
      range: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
      count,
    })),
  };
}

export type HistogramBucket = { range: string; count: number; pct: number; avgConfidence: number };

export function buildDdsHistogram(deals: DealRow[]): HistogramBucket[] {
  const buckets: { count: number; totalConf: number }[] = Array.from({ length: 30 }, () => ({ count: 0, totalConf: 0 }));
  for (const d of deals) {
    const idx = Math.min(29, Math.floor(d.dds_blended / 5));
    buckets[idx].count++;
    buckets[idx].totalConf += d.confidence;
  }
  const total = deals.length || 1;
  return buckets.map((b, i) => ({
    range: `${i * 5}–${(i + 1) * 5}`,
    count: b.count,
    pct: (b.count / total) * 100,
    avgConfidence: b.count > 0 ? b.totalConf / b.count : 0,
  })).filter(b => b.count > 0 || parseInt(b.range) <= 100);
}

export function buildConfidenceHistogram(deals: DealRow[]): HistogramBucket[] {
  const buckets: { count: number; totalConf: number }[] = Array.from({ length: 10 }, () => ({ count: 0, totalConf: 0 }));
  for (const d of deals) {
    const idx = Math.min(9, Math.floor(d.confidence * 10));
    buckets[idx].count++;
    buckets[idx].totalConf += d.confidence;
  }
  const total = deals.length || 1;
  return buckets.map((b, i) => ({
    range: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
    count: b.count,
    pct: (b.count / total) * 100,
    avgConfidence: b.count > 0 ? b.totalConf / b.count : 0,
  }));
}

export function buildPathDiversityHistogram(deals: DealRow[]): HistogramBucket[] {
  const bucketCount = 10;
  const buckets: { count: number; totalConf: number }[] = Array.from({ length: bucketCount }, () => ({ count: 0, totalConf: 0 }));
  for (const d of deals) {
    const idx = Math.min(bucketCount - 1, Math.floor(d.path_diversity_score * 10));
    buckets[idx].count++;
    buckets[idx].totalConf += d.confidence;
  }
  const total = deals.length || 1;
  return buckets.map((b, i) => ({
    range: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
    count: b.count,
    pct: (b.count / total) * 100,
    avgConfidence: b.count > 0 ? b.totalConf / b.count : 0,
  }));
}

export function buildWinRateHistogram(deals: DealRow[]): HistogramBucket[] {
  const eligible = deals.filter(d => d.pool_attempts >= 10);
  const bucketCount = 10;
  const buckets: { count: number; totalConf: number }[] = Array.from({ length: bucketCount }, () => ({ count: 0, totalConf: 0 }));
  for (const d of eligible) {
    const wr = (d.pool_wins / d.pool_attempts) * 100;
    const idx = Math.min(bucketCount - 1, Math.floor(wr / 10));
    buckets[idx].count++;
    buckets[idx].totalConf += d.confidence;
  }
  const total = eligible.length || 1;
  return buckets.map((b, i) => ({
    range: `${i * 10}–${(i + 1) * 10}%`,
    count: b.count,
    pct: (b.count / total) * 100,
    avgConfidence: b.count > 0 ? b.totalConf / b.count : 0,
  }));
}

export function buildSimCountHistogram(deals: DealRow[]): HistogramBucket[] {
  let maxSim = 0;
  for (const d of deals) {
    if (d.simulation_count > maxSim) maxSim = d.simulation_count;
  }
  const bucketSize = 100;
  const bucketCount = Math.max(1, Math.ceil((maxSim + 1) / bucketSize));
  const capped = Math.min(bucketCount, 20);
  const buckets: { count: number; totalConf: number }[] = Array.from({ length: capped }, () => ({ count: 0, totalConf: 0 }));
  for (const d of deals) {
    const idx = Math.min(capped - 1, Math.floor(d.simulation_count / bucketSize));
    buckets[idx].count++;
    buckets[idx].totalConf += d.confidence;
  }
  const total = deals.length || 1;
  return buckets.map((b, i) => ({
    range: `${i * bucketSize}–${(i + 1) * bucketSize}`,
    count: b.count,
    pct: (b.count / total) * 100,
    avgConfidence: b.count > 0 ? b.totalConf / b.count : 0,
  }));
}
