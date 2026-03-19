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
      game_history: {
        Row: {
          deal_id: string
          difficulty: string
          difficulty_score: number
          game_mode: string
          hints_used: number
          id: string
          moves: number
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
          deal_id: string
          difficulty: string
          difficulty_score?: number
          game_mode?: string
          hints_used?: number
          id?: string
          moves: number
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
          deal_id?: string
          difficulty?: string
          difficulty_score?: number
          game_mode?: string
          hints_used?: number
          id?: string
          moves?: number
          played_at?: string
          rating_after?: number
          rating_before?: number
          rating_change?: number
          time_seconds?: number
          undos_used?: number
          user_id?: string
          won?: boolean
        }
        Relationships: []
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
