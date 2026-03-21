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
          deal_id: string
          game_mode: string
          id: string
        }
        Insert: {
          created_at?: string
          date: string
          deal_id: string
          game_mode?: string
          id?: string
        }
        Update: {
          created_at?: string
          date?: string
          deal_id?: string
          game_mode?: string
          id?: string
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
      deals: {
        Row: {
          confidence: number
          created_at: string
          dds_blended: number
          dds_empirical: number | null
          dds_initial: number
          draw_mode: number
          game_mode: string
          id: string
          is_calibration: boolean
          min_moves: number
          pool_abandons: number
          pool_attempts: number
          pool_avg_moves: number
          pool_avg_time: number
          pool_wins: number
          seed: number
          simulation_count: number
          tier: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          dds_blended?: number
          dds_empirical?: number | null
          dds_initial?: number
          draw_mode?: number
          game_mode?: string
          id?: string
          is_calibration?: boolean
          min_moves?: number
          pool_abandons?: number
          pool_attempts?: number
          pool_avg_moves?: number
          pool_avg_time?: number
          pool_wins?: number
          seed: number
          simulation_count?: number
          tier?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          dds_blended?: number
          dds_empirical?: number | null
          dds_initial?: number
          draw_mode?: number
          game_mode?: string
          id?: string
          is_calibration?: boolean
          min_moves?: number
          pool_abandons?: number
          pool_attempts?: number
          pool_avg_moves?: number
          pool_avg_time?: number
          pool_wins?: number
          seed?: number
          simulation_count?: number
          tier?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          best_streak: number
          created_at: string
          current_streak: number
          display_name: string | null
          games_played: number
          games_won: number
          id: string
          rating: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          display_name?: string | null
          games_played?: number
          games_won?: number
          id: string
          rating?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          best_streak?: number
          created_at?: string
          current_streak?: number
          display_name?: string | null
          games_played?: number
          games_won?: number
          id?: string
          rating?: number
          updated_at?: string
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
