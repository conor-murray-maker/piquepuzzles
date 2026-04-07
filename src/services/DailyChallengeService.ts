import { supabase } from '@/integrations/supabase/client';

export interface DailyChallenge {
  id: string;
  date: string;
  game_mode: string;
  deal_id: string;
  difficulty: string | null;
  deals?: {
    seed: number;
    draw_mode: number;
    dds_blended: number;
    min_moves: number;
  };
}

export interface DailyResult {
  user_id: string;
  display_name: string;
  completed: boolean;
  completion_time_seconds: number | null;
  moves: number;
  hints_used: number;
  rank: number;
  current_streak: number;
}

export interface PersonalBest {
  best_time_seconds: number;
  best_moves: number;
  achieved_at: string;
}

export class DailyChallengeService {
  static async getTodaysChallenge(dateStr: string): Promise<DailyChallenge | null> {
    const { data } = await (supabase as any)
      .from('daily_challenges')
      .select('*, deals(seed, draw_mode, dds_blended, min_moves)')
      .eq('date', dateStr)
      .single();
    return data || null;
  }

  static async getMyResult(challengeId: string, userId: string): Promise<DailyResult | null> {
    const { data } = await (supabase as any)
      .from('daily_challenge_results')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .single();
    return data || null;
  }

  static async getLeaderboard(challengeId: string, userId?: string): Promise<DailyResult[]> {
    const { data } = await (supabase as any).rpc('get_daily_leaderboard_v2', {
      p_challenge_id: challengeId,
      p_user_id: userId || null,
    });
    return data || [];
  }

  static async getCompletionCount(challengeId: string): Promise<number> {
    const { data } = await (supabase as any).rpc('count_daily_completions', {
      p_challenge_id: challengeId,
    });
    return data ?? 0;
  }

  static async submitResult(params: {
    challengeId: string;
    userId: string;
    completed: boolean;
    completionTimeSeconds: number | null;
    moves: number;
    hintsUsed: number;
  }): Promise<void> {
    await (supabase as any).from('daily_challenge_results').upsert({
      challenge_id: params.challengeId,
      user_id: params.userId,
      completed: params.completed,
      completion_time_seconds: params.completionTimeSeconds,
      moves: params.moves,
      hints_used: params.hintsUsed,
    }, { onConflict: 'challenge_id,user_id' });
  }

  static async getPersonalBest(
    userId: string,
    gameMode: string,
    difficulty: string,
    context: string = 'daily_challenge'
  ): Promise<PersonalBest | null> {
    const { data } = await (supabase as any)
      .from('personal_bests')
      .select('best_time_seconds, best_moves, achieved_at')
      .eq('user_id', userId)
      .eq('game_mode', gameMode)
      .eq('difficulty', difficulty)
      .eq('context', context)
      .single();
    return data || null;
  }

  static async updatePersonalBest(params: {
    userId: string;
    gameMode: string;
    difficulty: string;
    context: string;
    timeSeconds: number;
    moves: number;
  }): Promise<{ isNewPB: boolean; previousBest: PersonalBest | null }> {
    const existing = await this.getPersonalBest(
      params.userId, params.gameMode, params.difficulty, params.context
    );

    if (!existing || params.timeSeconds < existing.best_time_seconds) {
      await (supabase as any).from('personal_bests').upsert({
        user_id: params.userId,
        game_mode: params.gameMode,
        difficulty: params.difficulty,
        context: params.context,
        best_time_seconds: params.timeSeconds,
        best_moves: params.moves,
        achieved_at: new Date().toISOString(),
      }, { onConflict: 'user_id,game_mode,difficulty,context' });

      return { isNewPB: true, previousBest: existing };
    }

    return { isNewPB: false, previousBest: existing };
  }

  static async getStreakPercentile(minStreak: number): Promise<number> {
    const { data } = await (supabase as any).rpc('get_streak_percentile', {
      p_min_streak: minStreak,
    });
    return data ?? 0;
  }

  static async getYesterdayResult(userId: string): Promise<{
    rank: number;
    totalPlayers: number;
    completionTimeSeconds: number;
  } | null> {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const { data: challenge } = await (supabase as any)
      .from('daily_challenges')
      .select('id')
      .eq('date', yesterdayStr)
      .single();

    if (!challenge) return null;

    const { data: result } = await (supabase as any)
      .from('daily_challenge_results')
      .select('rank, completion_time_seconds')
      .eq('challenge_id', challenge.id)
      .eq('user_id', userId)
      .single();

    if (!result) return null;

    const totalPlayers = await this.getCompletionCount(challenge.id);

    return {
      rank: result.rank ?? 0,
      totalPlayers,
      completionTimeSeconds: result.completion_time_seconds ?? 0,
    };
  }
}
