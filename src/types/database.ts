export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ExpenseOwnership = 'personal' | 'shared';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      ledgers: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      ledger_members: {
        Row: {
          ledger_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          ledger_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          ledger_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
      ledger_categories: {
        Row: {
          id: string;
          ledger_id: string;
          category_name: string;
          split_ratio_a: number;
          split_ratio_b: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          category_name: string;
          split_ratio_a?: number;
          split_ratio_b?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          category_name?: string;
          split_ratio_a?: number;
          split_ratio_b?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      expenses: {
        Row: {
          id: string;
          ledger_id: string;
          amount_yen: number;
          category: string;
          paid_by: string;
          recorded_by: string;
          ownership: ExpenseOwnership;
          spent_on: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          amount_yen: number;
          category: string;
          paid_by: string;
          recorded_by: string;
          ownership: ExpenseOwnership;
          spent_on: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          amount_yen?: number;
          category?: string;
          paid_by?: string;
          recorded_by?: string;
          ownership?: ExpenseOwnership;
          spent_on?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      expense_splits: {
        Row: {
          expense_id: string;
          user_id: string;
          amount_yen: number;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          amount_yen: number;
        };
        Update: {
          expense_id?: string;
          user_id?: string;
          amount_yen?: number;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_ledger: {
        Args: { p_name: string };
        Returns: Database['public']['Tables']['ledgers']['Row'];
      };
      join_ledger_by_invite: {
        Args: { p_invite_code: string };
        Returns: Database['public']['Tables']['ledgers']['Row'];
      };
      seed_default_categories: {
        Args: { p_ledger_id: string };
        Returns: undefined;
      };
      save_ledger_category: {
        Args: {
          p_ledger_id: string;
          p_category_name: string;
          p_split_ratio_a: number;
          p_split_ratio_b: number;
          p_sort_order: number;
        };
        Returns: Database['public']['Tables']['ledger_categories']['Row'];
      };
      delete_ledger_category: {
        Args: { p_ledger_id: string; p_category_name: string };
        Returns: undefined;
      };
      save_expense: {
        Args: {
          p_expense_id: string | null;
          p_ledger_id: string;
          p_amount_yen: number;
          p_category: string;
          p_paid_by: string;
          p_ownership: ExpenseOwnership;
          p_spent_on: string;
          p_note: string | null;
          p_splits: Json;
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      delete_expense: {
        Args: { p_expense_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      expense_ownership: ExpenseOwnership;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Ledger = Database['public']['Tables']['ledgers']['Row'];
export type LedgerMember = Database['public']['Tables']['ledger_members']['Row'];
export type LedgerCategory = Database['public']['Tables']['ledger_categories']['Row'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type ExpenseSplitRow = Database['public']['Tables']['expense_splits']['Row'];

export type LedgerMemberProfile = LedgerMember & {
  profile: Profile;
};

export type Expense = ExpenseRow & {
  splits: ExpenseSplitRow[];
};
