export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      challenge_completions: {
        Row: {
          challenge_id: string
          completed_at: string
          display_name: string | null
          id: string
          moves: number
          rating: number
          rating_change: number
          time_seconds: number
          user_id: string
          won: boolean
        }
        Insert: {
          challenge_id: string
          completed_at?: string
          display_name?: string | null
          id?: string
          moves: number
          rating: number
          rating_change: number
          time_seconds: number
          user_id: string
          won: boolean
        }
        Update: {
          challenge_id?: string
          completed_at?: string
          display_name?: string | null
          id?: string
          moves?: number
          rating?: number
          rating_change?: number
          time_seconds?: number
          user_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "challenge_completions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          challenger_display_name: string | null
          challenger_id: string
          challenger_moves: number
          challenger_rating: number
          challenger_rating_change: number
          challenger_time_seconds: number
          challenger_won: boolean
          created_at: string
          deal_seed: number
          difficulty: string
          draw_mode: number
          game_mode: string
          id: string
        }
        Insert: {
          challenger_display_name?: string | null
          challenger_id: string
          challenger_moves: number
          challenger_rating: number
          challenger_rating_change: number
          challenger_time_seconds: number
          challenger_won?: boolean
          created_at?: string
          deal_seed: number
          difficulty: string
          draw_mode?: number
          game_mode?: string
          id?: string
        }
        Update: {
          challenger_display_name?: string | null
          challenger_id?: string
          challenger_moves?: number
          challenger_rating?: number
          challenger_rating_change?: number
          challenger_time_seconds?: number
          challenger_won?: boolean
          created_at?: string
          deal_seed?: number
          difficulty?: string
          draw_mode?: number
          game_mode?: string
          id?: string
        }
        Relationships: []
      }
      daily_challenge_completions: {
        Row: {
          actual_moves: number
          actual_time: number
          completed_at: string
          date: string
          deal_id: string
          final_delta: number
          hints_used: number
          id: string
          result: string
          user_id: string
        }
        Insert: {
          actual_moves: number
          actual_time: number
          completed_at?: string
          date: string
          deal_id: string
          final_delta?: number
          hints_used?: number
          id?: string
          result: string
          user_id: string
        }
        Update: {
          actual_moves?: number
          actual_time?: number
          completed_at?: string
          date?: string
          deal_id?: string
          final_delta?: number
          hints_used?: number
          id?: string
          result?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_challenge_completions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_challenges: {
        Row: {
          created_at: string
          date: string
          day_of_week: number | null
          deal_id: string
          game_mode: string
          id: string
          target_dds_max: number | null
          target_dds_min: number | null
        }
        Insert: {
          created_at?: string
          date: string
          day_of_week?: number | null
          deal_id: string
          game_mode?: string
          id?: string
          target_dds_max?: number | null
          target_dds_min?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          day_of_week?: number | null
          deal_id?: string
          game_mode?: string
          id?: string
          target_dds_max?: number | null
          target_dds_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_challenges_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_queue: {
        Row: {
          deal_id: string
          game_mode: string
          id: string
          queued_at: string
          served_at: string | null
          tier: string
          user_id: string
        }
        Insert: {
          deal_id: string
          game_mode?: string
          id?: string
          queued_at?: string
          served_at?: string | null
          tier?: string
          user_id: string
        }
        Update: {
          deal_id?: string
          game_mode?: string
          id?: string
          queued_at?: string
          served_at?: string | null
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_working_set: {
        Row: {
          attempts_at_entry: number
          deal_id: string
          entered_at: string
          game_mode: string
          id: string
        }
        Insert: {
          attempts_at_entry?: number
          deal_id: string
          entered_at?: string
          game_mode?: string
          id?: string
        }
        Update: {
          attempts_at_entry?: number
          deal_id?: string
          entered_at?: string
          game_mode?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_working_set_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          confidence: number
          created_at: string
          crown_positions: Json | null
          dds_blended: number
          dds_empirical: number | null
          dds_initial: number
          draw_mode: number
          game_mode: string
          id: string
          is_calibration: boolean
          min_moves: number
          path_diversity_score: number
          pool_abandons: number
          pool_attempts: number
          pool_avg_moves: number
          pool_avg_time: number
          pool_wins: number
          reserved_for: string | null
          seed: number
          simulation_count: number
          simulation_wins: number
          tier: string
          unique_winning_paths: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          crown_positions?: Json | null
          dds_blended?: number
          dds_empirical?: number | null
          dds_initial?: number
          draw_mode?: number
          game_mode?: string
          id?: string
          is_calibration?: boolean
          min_moves?: number
          path_diversity_score?: number
          pool_abandons?: number
          pool_attempts?: number
          pool_avg_moves?: number
          pool_avg_time?: number
          pool_wins?: number
          reserved_for?: string | null
          seed: number
          simulation_count?: number
          simulation_wins?: number
          tier?: string
          unique_winning_paths?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          crown_positions?: Json | null
          dds_blended?: number
          dds_empirical?: number | null
          dds_initial?: number
          draw_mode?: number
          game_mode?: string
          id?: string
          is_calibration?: boolean
          min_moves?: number
          path_diversity_score?: number
          pool_abandons?: number
          pool_attempts?: number
          pool_avg_moves?: number
          pool_avg_time?: number
          pool_wins?: number
          reserved_for?: string | null
          seed?: number
          simulation_count?: number
          simulation_wins?: number
          tier?: string
          unique_winning_paths?: number
        }
        Relationships: []
      }
      game_history: {
        Row: {
          base_delta: number | null
          deal_id: string
          deal_uuid: string | null
          difficulty: string
          difficulty_score: number
          final_delta: number | null
          game_mode: string
          hints_used: number
          id: string
          moves: number
          performance_modifier: number | null
          played_at: string
          rating_after: number
          rating_before: number
          rating_change: number
          time_seconds: number
          undos_used: number
          user_id: string
          won: boolean
        }
        Insert: {
          base_delta?: number | null
          deal_id: string
          deal_uuid?: string | null
          difficulty: string
          difficulty_score?: number
          final_delta?: number | null
          game_mode?: string
          hints_used?: number
          id?: string
          moves: number
          performance_modifier?: number | null
          played_at?: string
          rating_after: number
          rating_before: number
          rating_change: number
          time_seconds: number
          undos_used?: number
          user_id: string
          won: boolean
        }
        Update: {
          base_delta?: number | null
          deal_id?: string
          deal_uuid?: string | null
          difficulty?: string
          difficulty_score?: number
          final_delta?: number | null
          game_mode?: string
          hints_used?: number
          id?: string
          moves?: number
          performance_modifier?: number | null
          played_at?: string
          rating_after?: number
          rating_before?: number
          rating_change?: number
          time_seconds?: number
          undos_used?: number
          user_id?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "game_history_deal_uuid_fkey"
            columns: ["deal_uuid"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      game_modes: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      performance_expectations: {
        Row: {
          avg_moves: number
          avg_time_seconds: number
          dds_bucket: string
          game_mode: string
          iq_bucket: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          avg_moves: number
          avg_time_seconds: number
          dds_bucket: string
          game_mode: string
          iq_bucket: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          avg_moves?: number
          avg_time_seconds?: number
          dds_bucket?: string
          game_mode?: string
          iq_bucket?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_expectations_game_mode_fkey"
            columns: ["game_mode"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      player_mode_ratings: {
        Row: {
          game_mode: string
          games_played: number
          iq: number
          updated_at: string
          user_id: string
        }
        Insert: {
          game_mode: string
          games_played?: number
          iq?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          game_mode?: string
          games_played?: number
          iq?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_mode_ratings_game_mode_fkey"
            columns: ["game_mode"]
            isOneToOne: false
            referencedRelation: "game_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_mode_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          best_streak: number
          created_at: string
          current_streak: number
          daily_challenge_completed_today: boolean
          daily_wins_today: number
          dark_mode: boolean
          display_name: string | null
          games_played: number
          games_played_freecell: number
          games_played_klondike: number
          games_played_realm: number
          games_won: number
          id: string
          last_streak_date: string | null
          last_win_date: string | null
          pending_milestone: number | null
          premium_expires_at: string | null
          rating: number
          streak_freeze_used_on: string | null
          streak_freezes_remaining: number
          subscription_status: string
          subscription_tier: string | null
          timezone_offset: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          daily_challenge_completed_today?: boolean
          daily_wins_today?: number
          dark_mode?: boolean
          display_name?: string | null
          games_played?: number
          games_played_freecell?: number
          games_played_klondike?: number
          games_played_realm?: number
          games_won?: number
          id: string
          last_streak_date?: string | null
          last_win_date?: string | null
          pending_milestone?: number | null
          premium_expires_at?: string | null
          rating?: number
          streak_freeze_used_on?: string | null
          streak_freezes_remaining?: number
          subscription_status?: string
          subscription_tier?: string | null
          timezone_offset?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          daily_challenge_completed_today?: boolean
          daily_wins_today?: number
          dark_mode?: boolean
          display_name?: string | null
          games_played?: number
          games_played_freecell?: number
          games_played_klondike?: number
          games_played_realm?: number
          games_won?: number
          id?: string
          last_streak_date?: string | null
          last_win_date?: string | null
          pending_milestone?: number | null
          premium_expires_at?: string | null
          rating?: number
          streak_freeze_used_on?: string | null
          streak_freezes_remaining?: number
          subscription_status?: string
          subscription_tier?: string | null
          timezone_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      releases: {
        Row: {
          id: string
          notes: string[]
          released_at: string
          title: string
          version: string
        }
        Insert: {
          id?: string
          notes?: string[]
          released_at?: string
          title: string
          version: string
        }
        Update: {
          id?: string
          notes?: string[]
          released_at?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      streak_history: {
        Row: {
          condition_met: string
          created_at: string
          date: string
          id: string
          streak_day_number: number
          streak_length_at_time: number
          user_id: string
        }
        Insert: {
          condition_met: string
          created_at?: string
          date: string
          id?: string
          streak_day_number: number
          streak_length_at_time: number
          user_id: string
        }
        Update: {
          condition_met?: string
          created_at?: string
          date?: string
          id?: string
          streak_day_number?: number
          streak_length_at_time?: number
          user_id?: string
        }
        Relationships: []
      }
      user_calibration_progress: {
        Row: {
          calibration_deal_ids_played: string[]
          game_mode: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calibration_deal_ids_played?: string[]
          game_mode?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calibration_deal_ids_played?: string[]
          game_mode?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_played_deals: {
        Row: {
          deal_id: string
          id: string
          played_at: string
          user_id: string
        }
        Insert: {
          deal_id: string
          id?: string
          played_at?: string
          user_id: string
        }
        Update: {
          deal_id?: string
          id?: string
          played_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_played_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_puzzle_iq: { Args: { p_user_id: string }; Returns: number }
      count_daily_attempts: { Args: { p_date: string }; Returns: number }
      create_challenge: {
        Args: {
          p_deal_seed: number
          p_difficulty: string
          p_display_name?: string
          p_draw_mode: number
          p_game_mode: string
          p_moves: number
          p_rating_change: number
          p_time_seconds: number
          p_won: boolean
        }
        Returns: string
      }
      get_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      get_daily_leaderboard: {
        Args: { p_date: string }
        Returns: {
          actual_moves: number
          actual_time: number
          display_name: string
          result: string
          user_id: string
        }[]
      }
      get_rating_percentile: { Args: { user_rating: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
