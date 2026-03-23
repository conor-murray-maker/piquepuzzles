import { supabase } from '@/integrations/supabase/client';

export interface ChallengeData {
  id: string;
  deal_seed: number;
  game_mode: string;
  draw_mode: number;
  difficulty: string;
  challenger_moves: number;
  challenger_time_seconds: number;
  challenger_rating: number;
  challenger_rating_change: number;
  challenger_won: boolean;
  challenger_display_name: string | null;
}

export class ChallengeService {
  static async getChallenge(id: string): Promise<ChallengeData | null> {
    try {
      const { data } = await (supabase as any)
        .from('challenges')
        .select('*')
        .eq('id', id)
        .single();
      return data as ChallengeData | null;
    } catch (err) {
      console.error('Failed to fetch challenge:', err);
      return null;
    }
  }

  static async createChallenge(params: {
    challengerId: string;
    dealSeed: number;
    gameMode: string;
    drawMode: number;
    difficulty: string;
    moves: number;
    timeSeconds: number;
    rating: number;
    ratingChange: number;
    won: boolean;
    displayName: string | null;
  }): Promise<string | null> {
    try {
      const { data, error } = await (supabase as any).rpc('create_challenge', {
        p_deal_seed: params.dealSeed,
        p_game_mode: params.gameMode,
        p_draw_mode: params.drawMode,
        p_difficulty: params.difficulty,
        p_moves: params.moves,
        p_time_seconds: params.timeSeconds,
        p_rating_change: params.ratingChange,
        p_won: params.won,
        p_display_name: params.displayName,
      });

      if (error || !data) throw error;
      return data as string;
    } catch (err) {
      console.error('Failed to create challenge:', err);
      return null;
    }
  }

  static async saveCompletion(params: {
    challengeId: string;
    userId: string;
    displayName: string | null;
    moves: number;
    timeSeconds: number;
    rating: number;
    ratingChange: number;
    won: boolean;
  }): Promise<void> {
    try {
      await (supabase as any).from('challenge_completions').insert({
        challenge_id: params.challengeId,
        user_id: params.userId,
        display_name: params.displayName,
        moves: params.moves,
        time_seconds: params.timeSeconds,
        rating: params.rating,
        rating_change: params.ratingChange,
        won: params.won,
      });
    } catch (err) {
      console.error('Failed to save challenge completion:', err);
    }
  }

  static async saveDailyCompletion(params: {
    userId: string;
    date: string;
    dealId: string;
    result: string;
    actualMoves: number;
    actualTime: number;
    hintsUsed: number;
    finalDelta: number;
  }): Promise<void> {
    try {
      await (supabase as any).from('daily_challenge_completions').upsert({
        user_id: params.userId,
        date: params.date,
        deal_id: params.dealId,
        result: params.result,
        actual_moves: params.actualMoves,
        actual_time: params.actualTime,
        hints_used: params.hintsUsed,
        final_delta: params.finalDelta,
      }, { onConflict: 'user_id,date', ignoreDuplicates: true });
    } catch (err) {
      console.error('Failed to save daily completion:', err);
    }
  }
}
