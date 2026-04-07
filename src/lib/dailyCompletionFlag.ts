/**
 * localStorage-based flag to track daily challenge completion.
 * Prevents replay of the same daily challenge after first attempt.
 */

const PREFIX = 'daily_completed_';

export function setDailyCompleted(challengeId: string, userId: string): void {
  try {
    localStorage.setItem(`${PREFIX}${challengeId}_${userId}`, 'true');
  } catch {}
}

export function isDailyCompleted(challengeId: string, userId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}${challengeId}_${userId}`) === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if today's daily challenge is completed for a given user,
 * using the deal_id as a fallback key when challengeId isn't known yet.
 */
export function setDailyCompletedByDeal(dealId: string, userId: string): void {
  try {
    localStorage.setItem(`${PREFIX}deal_${dealId}_${userId}`, 'true');
  } catch {}
}

export function isDailyCompletedByDeal(dealId: string, userId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}deal_${dealId}_${userId}`) === 'true';
  } catch {
    return false;
  }
}
