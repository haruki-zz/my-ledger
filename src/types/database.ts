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
          category_id: string | null;
          category_name: string | null;
          split_ratio_a: number;
          split_ratio_b: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          category_id?: string | null;
          category_name?: string | null;
          split_ratio_a?: number;
          split_ratio_b?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          category_id?: string | null;
          category_name?: string | null;
          split_ratio_a?: number;
          split_ratio_b?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      recurring_expense_rules: {
        Row: {
          id: string;
          ledger_id: string;
          name: string;
          category_id: string;
          subcategory: string | null;
          amount_yen: number;
          paid_by: string;
          split_ratio_a: number;
          split_ratio_b: number;
          generate_day: number;
          start_month: string;
          end_month: string | null;
          timezone: string;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          name: string;
          category_id: string;
          subcategory?: string | null;
          amount_yen: number;
          paid_by: string;
          split_ratio_a?: number;
          split_ratio_b?: number;
          generate_day?: number;
          start_month: string;
          end_month?: string | null;
          timezone?: string;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          name?: string;
          category_id?: string;
          subcategory?: string | null;
          amount_yen?: number;
          paid_by?: string;
          split_ratio_a?: number;
          split_ratio_b?: number;
          generate_day?: number;
          start_month?: string;
          end_month?: string | null;
          timezone?: string;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      expenses: {
        Row: {
          id: string;
          ledger_id: string;
          amount_yen: number;
          category: string | null;
          category_id: string | null;
          subcategory: string | null;
          paid_by: string;
          recorded_by: string;
          ownership: ExpenseOwnership;
          spent_on: string;
          note: string | null;
          recurring_rule_id: string | null;
          recurring_month: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          amount_yen: number;
          category?: string | null;
          category_id?: string | null;
          subcategory?: string | null;
          paid_by: string;
          recorded_by: string;
          ownership: ExpenseOwnership;
          spent_on: string;
          note?: string | null;
          recurring_rule_id?: string | null;
          recurring_month?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          amount_yen?: number;
          category?: string | null;
          category_id?: string | null;
          subcategory?: string | null;
          paid_by?: string;
          recorded_by?: string;
          ownership?: ExpenseOwnership;
          spent_on?: string;
          note?: string | null;
          recurring_rule_id?: string | null;
          recurring_month?: string | null;
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
      transfer_checklist_completions: {
        Row: {
          expense_id: string;
          user_id: string;
          completed_at: string;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          completed_at?: string;
        };
        Update: {
          expense_id?: string;
          user_id?: string;
          completed_at?: string;
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
      leave_ledger: {
        Args: { p_ledger_id: string };
        Returns: undefined;
      };
      delete_ledger: {
        Args: { p_ledger_id: string };
        Returns: undefined;
      };
      seed_default_categories: {
        Args: { p_ledger_id: string };
        Returns: undefined;
      };
      save_ledger_category: {
        Args: {
          p_ledger_id: string;
          p_category_id: string;
          p_category_name: string | null;
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
      save_ledger_category_offline: {
        Args: {
          p_category_id: string;
          p_ledger_id: string;
          p_primary_category_id: string;
          p_category_name: string | null;
          p_split_ratio_a: number;
          p_split_ratio_b: number;
          p_sort_order: number;
          p_base_updated_at: string | null;
        };
        Returns: Database['public']['Tables']['ledger_categories']['Row'];
      };
      delete_ledger_category_offline: {
        Args: {
          p_category_id: string;
          p_ledger_id: string;
          p_category_name: string;
          p_base_updated_at: string | null;
        };
        Returns: undefined;
      };
      save_expense: {
        Args: {
          p_expense_id: string | null;
          p_ledger_id: string;
          p_amount_yen: number;
          p_category_id: string;
          p_category: string | null;
          p_subcategory: string | null;
          p_paid_by: string;
          p_ownership: ExpenseOwnership;
          p_spent_on: string;
          p_note: string | null;
          p_splits: Json;
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      save_expense_offline: {
        Args: {
          p_expense_id: string;
          p_ledger_id: string;
          p_amount_yen: number;
          p_category_id: string;
          p_category: string | null;
          p_subcategory: string | null;
          p_paid_by: string;
          p_ownership: ExpenseOwnership;
          p_spent_on: string;
          p_note: string | null;
          p_splits: Json;
          p_base_updated_at: string | null;
        };
        Returns: Database['public']['Tables']['expenses']['Row'];
      };
      save_recurring_expense_rule_offline: {
        Args: {
          p_rule_id: string;
          p_ledger_id: string;
          p_name: string;
          p_category_id: string;
          p_subcategory: string | null;
          p_amount_yen: number;
          p_paid_by: string;
          p_split_ratio_a: number;
          p_split_ratio_b: number;
          p_generate_day: number;
          p_start_month: string;
          p_end_month: string | null;
          p_timezone: string;
          p_is_active: boolean;
          p_base_updated_at: string | null;
        };
        Returns: Database['public']['Tables']['recurring_expense_rules']['Row'];
      };
      generate_recurring_expenses: {
        Args: {
          p_ledger_id?: string | null;
          p_until_month?: string | null;
        };
        Returns: {
          rule_id: string;
          recurring_month: string;
          expense_id: string | null;
          status: string;
          message: string | null;
        }[];
      };
      delete_expense: {
        Args: { p_expense_id: string };
        Returns: undefined;
      };
      delete_expense_offline: {
        Args: { p_expense_id: string; p_ledger_id: string; p_base_updated_at: string | null };
        Returns: undefined;
      };
      get_open_transfer_items: {
        Args: { p_ledger_id: string };
        Returns: {
          expense_id: string;
          ledger_id: string;
          category: string;
          category_id: string | null;
          subcategory: string | null;
          spent_on: string;
          expense_created_at: string;
          expense_updated_at: string;
          payer_user_id: string;
          payee_user_id: string;
          amount_yen: number;
          payer_completed_at: string | null;
          payee_completed_at: string | null;
        }[];
      };
      set_transfer_confirmations: {
        Args: { p_updates: { expense_id: string; confirmed: boolean }[] };
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
export type RecurringExpenseRule = Database['public']['Tables']['recurring_expense_rules']['Row'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type ExpenseSplitRow = Database['public']['Tables']['expense_splits']['Row'];
export type TransferChecklistCompletionRow = Database['public']['Tables']['transfer_checklist_completions']['Row'];
export type TransferChecklistItemRow = Database['public']['Functions']['get_open_transfer_items']['Returns'][number];

export type LedgerMemberProfile = LedgerMember & {
  profile: Profile;
};

export type Expense = ExpenseRow & {
  splits: ExpenseSplitRow[];
};
