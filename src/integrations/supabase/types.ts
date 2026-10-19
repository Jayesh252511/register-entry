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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          business_display_name: string
          default_weight_unit: string
          id: number
          next_bill_number: number
          next_register_serial: number
          updated_at: string
        }
        Insert: {
          business_display_name?: string
          default_weight_unit?: string
          id?: number
          next_bill_number?: number
          next_register_serial?: number
          updated_at?: string
        }
        Update: {
          business_display_name?: string
          default_weight_unit?: string
          id?: number
          next_bill_number?: number
          next_register_serial?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_reference: string | null
          changed_at: string
          entry_id: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_reference?: string | null
          changed_at?: string
          entry_id?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_reference?: string | null
          changed_at?: string
          entry_id?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: []
      }
      auth_attempts: {
        Row: {
          attempted_at: string
          id: number
          ip: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: number
          ip?: string | null
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: number
          ip?: string | null
          success?: boolean
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          id: string
          label: string
          last_seen_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      transport_entries: {
        Row: {
          archived_at: string | null
          bill_no: string
          cancelled_at: string | null
          client_request_id: string | null
          created_at: string
          device_id: string | null
          entry_date: string | null
          id: string
          maal_diya: string
          maal_liya: string
          register_serial_no: number
          updated_at: string
          vehicle_no: string
          weight_unit: string | null
          weight_value: number | null
        }
        Insert: {
          archived_at?: string | null
          bill_no?: string
          cancelled_at?: string | null
          client_request_id?: string | null
          created_at?: string
          device_id?: string | null
          entry_date?: string | null
          id?: string
          maal_diya?: string
          maal_liya?: string
          register_serial_no: number
          updated_at?: string
          vehicle_no?: string
          weight_unit?: string | null
          weight_value?: number | null
        }
        Update: {
          archived_at?: string | null
          bill_no?: string
          cancelled_at?: string | null
          client_request_id?: string | null
          created_at?: string
          device_id?: string | null
          entry_date?: string | null
          id?: string
          maal_diya?: string
          maal_liya?: string
          register_serial_no?: number
          updated_at?: string
          vehicle_no?: string
          weight_unit?: string | null
          weight_value?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_entry: {
        Args: {
          p_bill_no: string
          p_client_request_id: string
          p_device_id: string
          p_entry_date: string
          p_maal_diya: string
          p_maal_liya: string
          p_vehicle_no: string
          p_weight_value: number
        }
        Returns: {
          archived_at: string | null
          bill_no: string
          cancelled_at: string | null
          client_request_id: string | null
          created_at: string
          device_id: string | null
          entry_date: string | null
          id: string
          maal_diya: string
          maal_liya: string
          register_serial_no: number
          updated_at: string
          vehicle_no: string
          weight_unit: string | null
          weight_value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "transport_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_entry: {
        Args: {
          p_bill_no: string
          p_device_id: string
          p_entry_date: string
          p_id: string
          p_maal_diya: string
          p_maal_liya: string
          p_vehicle_no: string
          p_weight_value: number
        }
        Returns: {
          archived_at: string | null
          bill_no: string
          cancelled_at: string | null
          client_request_id: string | null
          created_at: string
          device_id: string | null
          entry_date: string | null
          id: string
          maal_diya: string
          maal_liya: string
          register_serial_no: number
          updated_at: string
          vehicle_no: string
          weight_unit: string | null
          weight_value: number | null
        }
        SetofOptions: {
          from: "*"
          to: "transport_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
