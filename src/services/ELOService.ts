export class ELOService {
  static computeExpected(playerRating: number, dealDDS: number): number {
    const dealRating = 800 + (dealDDS / 100) * 1200;
    return 1 / (1 + Math.pow(10, (dealRating - playerRating) / 400));
  }

  static computeKFactor(gamesPlayed: number): number {
    if (gamesPlayed < 20) return 32;
    if (gamesPlayed < 50) return 24;
    return 16;
  }

  static computeDelta(
    playerRating: number,
    dealDDS: number,
    outcome: 1 | 0,
    performanceModifier: number,
    gamesPlayed: number
  ): number {
    const K = this.computeKFactor(gamesPlayed);
    const expected = this.computeExpected(playerRating, dealDDS);
    const base = K * (outcome - expected);
    const delta = Math.round(base * performanceModifier);
    if (outcome === 1) return Math.max(delta, 1); // win floor
    return Math.max(delta, -20); // loss ceiling
  }

  static dealRatingFromDDS(dds: number): number {
    return 800 + (dds / 100) * 1200;
  }
}
