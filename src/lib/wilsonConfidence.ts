/**
 * Wilson score confidence interval and composite deal confidence.
 *
 * Confidence measures the probability that the current DDS classification
 * would remain the same if infinite simulations were run.
 */

const Z = 1.96; // 95% confidence level

export interface WilsonInterval {
  lower: number;
  upper: number;
  width: number;
}

export interface DealConfidenceInput {
  wins: number;
  totalSimulations: number;
  /** DDS value after path diversity modifier is applied */
  dds: number;
}

export interface DealConfidenceResult {
  confidence: number;
  wilsonLower: number;
  wilsonUpper: number;
  winRate: number;
}

/** Compute Wilson score confidence interval for observed win rate. */
export function wilsonInterval(wins: number, n: number): WilsonInterval {
  if (n === 0) return { lower: 0, upper: 0, width: 1 };
  const p = wins / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  const lower = Math.max(0, (centre - spread) / denom);
  const upper = Math.min(1, (centre + spread) / denom);
  return { lower, upper, width: upper - lower };
}

/** Map a DDS value to its difficulty tier. */
function ddsTier(dds: number): number {
  if (dds <= 25) return 0; // Easy
  if (dds <= 55) return 1; // Medium
  if (dds <= 80) return 2; // Hard
  return 3; // Expert
}

/**
 * Check how many tiers the Wilson interval spans when mapped through
 * a win-rate-to-DDS calibration. We approximate by mapping the lower/upper
 * win rate bounds to DDS values: lower win rate → higher DDS.
 */
function tierSpan(dds: number, wilsonLower: number, wilsonUpper: number): number {
  // Win rate bounds map inversely to DDS — lower win rate = harder deal.
  // But since we already have a DDS from the solver, we estimate the DDS
  // range from the width of the Wilson interval.
  // A 10% interval width ≈ ±5 DDS points (rough heuristic).
  const ddsRange = (wilsonUpper - wilsonLower) * 50; // maps 0-1 interval to 0-50 DDS swing
  const ddsLow = Math.max(0, dds - ddsRange / 2);
  const ddsHigh = Math.min(100, dds + ddsRange / 2);
  const tierLow = ddsTier(ddsLow);
  const tierHigh = ddsTier(ddsHigh);
  return Math.abs(tierHigh - tierLow);
}

/**
 * Calculate composite deal confidence from Wilson interval, classification
 * stability, and path diversity.
 */
export function calculateDealConfidence(input: DealConfidenceInput): DealConfidenceResult {
  const { wins, totalSimulations, dds } = input;
  const n = totalSimulations;
  const winRate = n > 0 ? wins / n : 0;

  // Wilson interval confidence component (70% weight)
  const wi = wilsonInterval(wins, n);
  let wilsonConf = 1 - Math.min(1, Math.max(0, wi.width / 0.4));

  // DDS classification stability component (30% weight)
  const span = tierSpan(dds, wi.lower, wi.upper);
  let stabilityScore: number;
  if (span === 0) {
    stabilityScore = 1.0; // both bounds in same tier — bonus
  } else if (span === 1) {
    stabilityScore = 0.5; // spans two tiers — penalty
  } else {
    stabilityScore = 0.0; // spans 3+ tiers — heavy penalty
  }

  // Weighted blend: 70% Wilson + 30% stability
  let confidence = wilsonConf * 0.7 + stabilityScore * 0.3;

  // Minimum simulation caps
  if (n < 10) {
    confidence = Math.min(confidence, 0.2);
  } else if (n < 30) {
    confidence = Math.min(confidence, 0.4);
  }

  confidence = Math.min(1, Math.max(0, confidence));

  return {
    confidence: Math.round(confidence * 1000) / 1000,
    wilsonLower: Math.round(wi.lower * 1000) / 1000,
    wilsonUpper: Math.round(wi.upper * 1000) / 1000,
    winRate: Math.round(winRate * 1000) / 1000,
  };
}
