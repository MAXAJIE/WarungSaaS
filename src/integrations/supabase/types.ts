export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_label: string;
          actor_role: Database["public"]["Enums"]["staff_role"] | null;
          created_at: string;
          detail: Json;
          id: string;
          order_id: string | null;
          store_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_label?: string;
          actor_role?: Database["public"]["Enums"]["staff_role"] | null;
          created_at?: string;
          detail?: Json;
          id?: string;
          order_id?: string | null;
          store_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_label?: string;
          actor_role?: Database["public"]["Enums"]["staff_role"] | null;
          created_at?: string;
          detail?: Json;
          id?: string;
          order_id?: string | null;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      member_roles: {
        Row: {
          created_at: string;
          id: string;
          member_id: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          member_id: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          member_id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          store_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      product_options: {
        Row: {
          created_at: string;
          id: string;
          is_required: boolean;
          max_select: number;
          name: string;
          product_id: string;
          sort_order: number;
          store_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_required?: boolean;
          max_select?: number;
          name: string;
          product_id: string;
          sort_order?: number;
          store_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_required?: boolean;
          max_select?: number;
          name?: string;
          product_id?: string;
          sort_order?: number;
          store_id?: string;
        };
        Relationships: [];
      };
      product_option_values: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          option_id: string;
          price_delta: number;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          option_id: string;
          price_delta?: number;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          option_id?: string;
          price_delta?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      combo_items: {
        Row: {
          combo_id: string;
          created_at: string;
          id: string;
          product_id: string;
          qty: number;
        };
        Insert: {
          combo_id: string;
          created_at?: string;
          id?: string;
          product_id: string;
          qty?: number;
        };
        Update: {
          combo_id?: string;
          created_at?: string;
          id?: string;
          product_id?: string;
          qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "combo_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      gifts: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          note: string;
          stock: number;
          store_id: string;
          threshold: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          note?: string;
          stock?: number;
          store_id: string;
          threshold?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          note?: string;
          stock?: number;
          store_id?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gifts_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      kitchen_groups: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
          store_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          sort_order?: number;
          store_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "kitchen_groups_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          read: boolean;
          store_id: string | null;
          target_url: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: Json;
          read?: boolean;
          store_id?: string | null;
          target_url?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          read?: boolean;
          store_id?: string | null;
          target_url?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          name_snapshot: string;
          options: Json;
          order_id: string;
          product_id: string | null;
          qty: number;
          unit_cost: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name_snapshot: string;
          options?: Json;
          order_id: string;
          product_id?: string | null;
          qty?: number;
          unit_cost?: number;
          unit_price?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name_snapshot?: string;
          options?: Json;
          order_id?: string;
          product_id?: string | null;
          qty?: number;
          unit_cost?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          approved_at: string | null;
          completed_at: string | null;
          cost_total: number;
          created_at: string;
          customer_name: string;
          discount_total: number;
          gift_id: string | null;
          guest_token: string;
          id: string;
          note: string;
          order_code: string | null;
          order_no: number | null;
          qr_expires_at: string | null;
          qr_token: string | null;
          ready_at: string | null;
          received_at: string | null;
          source: string;
          special_discount: number;
          special_discount_reason: string;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string;
          submitted_at: string | null;
          subtotal: number;
          total: number;
          updated_at: string;
          voucher_id: string | null;
        };
        Insert: {
          approved_at?: string | null;
          completed_at?: string | null;
          cost_total?: number;
          created_at?: string;
          customer_name?: string;
          discount_total?: number;
          gift_id?: string | null;
          guest_token?: string;
          id?: string;
          note?: string;
          order_code?: string | null;
          order_no?: number | null;
          qr_expires_at?: string | null;
          qr_token?: string | null;
          ready_at?: string | null;
          received_at?: string | null;
          source?: string;
          special_discount?: number;
          special_discount_reason?: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id: string;
          submitted_at?: string | null;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          voucher_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          completed_at?: string | null;
          cost_total?: number;
          created_at?: string;
          customer_name?: string;
          discount_total?: number;
          gift_id?: string | null;
          guest_token?: string;
          id?: string;
          note?: string;
          order_code?: string | null;
          order_no?: number | null;
          qr_expires_at?: string | null;
          qr_token?: string | null;
          ready_at?: string | null;
          received_at?: string | null;
          source?: string;
          special_discount?: number;
          special_discount_reason?: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string;
          submitted_at?: string | null;
          subtotal?: number;
          total?: number;
          updated_at?: string;
          voucher_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_gift_id_fkey";
            columns: ["gift_id"];
            isOneToOne: false;
            referencedRelation: "gifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_voucher_id_fkey";
            columns: ["voucher_id"];
            isOneToOne: false;
            referencedRelation: "vouchers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_compartments: {
        Row: {
          created_at: string;
          group_id: string;
          product_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          product_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_compartments_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "kitchen_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_compartments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category: string;
          cost_price: number;
          created_at: string;
          description: string;
          group_id: string | null;
          id: string;
          is_available: boolean;
          is_combo: boolean;
          name: string;
          name_ms: string;
          name_zh: string;
          photo_url: string | null;
          photo_urls?: string[] | null;
          sell_price: number;
          sort_order: number;
          stock_sold: number;
          stock_total: number | null;
          store_id: string;
        };
        Insert: {
          category?: string;
          cost_price?: number;
          created_at?: string;
          description?: string;
          group_id?: string | null;
          id?: string;
          is_available?: boolean;
          is_combo?: boolean;
          name: string;
          name_ms?: string;
          name_zh?: string;
          photo_url?: string | null;
          photo_urls?: string[] | null;
          sell_price?: number;
          sort_order?: number;
          stock_sold?: number;
          stock_total?: number | null;
          store_id: string;
        };
        Update: {
          category?: string;
          cost_price?: number;
          created_at?: string;
          description?: string;
          group_id?: string | null;
          id?: string;
          is_available?: boolean;
          is_combo?: boolean;
          name?: string;
          name_ms?: string;
          name_zh?: string;
          photo_url?: string | null;
          photo_urls?: string[] | null;
          sell_price?: number;
          sort_order?: number;
          stock_sold?: number;
          stock_total?: number | null;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "kitchen_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          preferred_lang: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id: string;
          preferred_lang?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          preferred_lang?: string;
        };
        Relationships: [];
      };
      role_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          from_role: string;
          id: string;
          member_id: string | null;
          note: string;
          requested_role: string;
          status: string;
          store_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          from_role: string;
          id?: string;
          member_id?: string | null;
          note?: string;
          requested_role: string;
          status?: string;
          store_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          from_role?: string;
          id?: string;
          member_id?: string | null;
          note?: string;
          requested_role?: string;
          status?: string;
          store_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "store_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_requests_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      store_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          store_id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "store_invites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      store_members: {
        Row: {
          created_at: string;
          display_name: string;
          group_id: string | null;
          id: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string;
          group_id?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["staff_role"];
          store_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          group_id?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          store_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "kitchen_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "store_members_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      stores: {
        Row: {
          avg_prep_minutes: number;
          created_at: string;
          currency: string;
          disclaimer: string;
          event_spend: number;
          gift_threshold: number;
          id: string;
          is_open: boolean;
          name: string;
          order_code_template: string;
          order_seq: number;
          owner_id: string;
          slug: string;
          tagline: string;
        };
        Insert: {
          avg_prep_minutes?: number;
          created_at?: string;
          currency?: string;
          disclaimer?: string;
          event_spend?: number;
          gift_threshold?: number;
          id?: string;
          is_open?: boolean;
          name: string;
          order_code_template?: string;
          order_seq?: number;
          owner_id: string;
          slug: string;
          tagline?: string;
        };
        Update: {
          avg_prep_minutes?: number;
          created_at?: string;
          currency?: string;
          disclaimer?: string;
          event_spend?: number;
          gift_threshold?: number;
          id?: string;
          is_open?: boolean;
          name?: string;
          order_code_template?: string;
          order_seq?: number;
          owner_id?: string;
          slug?: string;
          tagline?: string;
        };
        Relationships: [];
      };
      vouchers: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["discount_kind"];
          label: string;
          min_spend: number;
          store_id: string;
          used_at: string | null;
          used_by_order: string | null;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["discount_kind"];
          label?: string;
          min_spend?: number;
          store_id: string;
          used_at?: string | null;
          used_by_order?: string | null;
          value?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["discount_kind"];
          label?: string;
          min_spend?: number;
          store_id?: string;
          used_at?: string | null;
          used_by_order?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vouchers_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_order_no: { Args: { p_order: string }; Returns: number };
      cleanup_expired_orders: { Args: never; Returns: number };
      is_cashier: { Args: never; Returns: boolean };
      my_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["staff_role"];
      };
      my_store_id: { Args: never; Returns: string };
    };
    Enums: {
      discount_kind: "percent" | "fixed";
      order_status:
        | "cart"
        | "submitted"
        | "approved"
        | "preparing"
        | "kitchen_done"
        | "received"
        | "completed"
        | "cancelled";
      staff_role: "cashier" | "kitchen" | "pickup" | "owner";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      discount_kind: ["percent", "fixed"],
      order_status: [
        "cart",
        "submitted",
        "approved",
        "preparing",
        "kitchen_done",
        "received",
        "completed",
        "cancelled",
      ],
      staff_role: ["cashier", "kitchen", "pickup", "owner"],
    },
  },
} as const;
