type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ExpenseOwnership = 'personal' | 'shared';
export type LedgerMemberStatus = 'active' | 'left';
export type TransactionType = 'expense' | 'income';
export type TransactionOwnership = 'personal' | 'shared';
export type BudgetScope = 'total' | 'category';
export type BudgetSnapshotSource = 'template' | 'manual_override';

type Database = {
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
          owner_id: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          owner_id?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          owner_id?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      ledger_members: {
        Row: {
          ledger_id: string;
          user_id: string;
          status?: LedgerMemberStatus;
          joined_at: string;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          ledger_id: string;
          user_id: string;
          status?: LedgerMemberStatus;
          joined_at?: string;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ledger_id?: string;
          user_id?: string;
          status?: LedgerMemberStatus;
          joined_at?: string;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          type: TransactionType;
          parent_id: string | null;
          display_name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          type: TransactionType;
          parent_id?: string | null;
          display_name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: TransactionType;
          parent_id?: string | null;
          display_name?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
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
          ownership: ExpenseOwnership;
          split_ratio_a: number;
          split_ratio_b: number;
          split_amount_a: number | null;
          split_amount_b: number | null;
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
          ownership?: ExpenseOwnership;
          split_ratio_a?: number;
          split_ratio_b?: number;
          split_amount_a?: number | null;
          split_amount_b?: number | null;
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
          ownership?: ExpenseOwnership;
          split_ratio_a?: number;
          split_ratio_b?: number;
          split_amount_a?: number | null;
          split_amount_b?: number | null;
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
      transactions: {
        Row: {
          id: string;
          ledger_id: string;
          type: TransactionType;
          amount_yen: number;
          category_id: string;
          occurred_on: string;
          note: string | null;
          paid_by_member_id: string | null;
          ownership: TransactionOwnership | null;
          owned_by_member_id: string | null;
          recorded_by_member_id: string;
          recurring_rule_id: string | null;
          recurring_month: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          type: TransactionType;
          amount_yen: number;
          category_id: string;
          occurred_on: string;
          note?: string | null;
          paid_by_member_id?: string | null;
          ownership?: TransactionOwnership | null;
          owned_by_member_id?: string | null;
          recorded_by_member_id: string;
          recurring_rule_id?: string | null;
          recurring_month?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          type?: TransactionType;
          amount_yen?: number;
          category_id?: string;
          occurred_on?: string;
          note?: string | null;
          paid_by_member_id?: string | null;
          ownership?: TransactionOwnership | null;
          owned_by_member_id?: string | null;
          recorded_by_member_id?: string;
          recurring_rule_id?: string | null;
          recurring_month?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      transaction_splits: {
        Row: {
          transaction_id: string;
          responsible_member_id: string;
          amount_yen: number;
        };
        Insert: {
          transaction_id: string;
          responsible_member_id: string;
          amount_yen: number;
        };
        Update: {
          transaction_id?: string;
          responsible_member_id?: string;
          amount_yen?: number;
        };
      };
      recurring_transaction_rules: {
        Row: {
          id: string;
          ledger_id: string;
          type: TransactionType;
          name: string;
          amount_yen: number;
          category_id: string;
          generate_day: number;
          start_month: string;
          end_month: string | null;
          timezone: string;
          is_active: boolean;
          paid_by_member_id: string | null;
          ownership: TransactionOwnership | null;
          owned_by_member_id: string | null;
          created_by_member_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          type: TransactionType;
          name: string;
          amount_yen: number;
          category_id: string;
          generate_day?: number;
          start_month: string;
          end_month?: string | null;
          timezone?: string;
          is_active?: boolean;
          paid_by_member_id?: string | null;
          ownership?: TransactionOwnership | null;
          owned_by_member_id?: string | null;
          created_by_member_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          type?: TransactionType;
          name?: string;
          amount_yen?: number;
          category_id?: string;
          generate_day?: number;
          start_month?: string;
          end_month?: string | null;
          timezone?: string;
          is_active?: boolean;
          paid_by_member_id?: string | null;
          ownership?: TransactionOwnership | null;
          owned_by_member_id?: string | null;
          created_by_member_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      recurring_rule_splits: {
        Row: {
          rule_id: string;
          responsible_member_id: string;
          amount_yen: number;
        };
        Insert: {
          rule_id: string;
          responsible_member_id: string;
          amount_yen: number;
        };
        Update: {
          rule_id?: string;
          responsible_member_id?: string;
          amount_yen?: number;
        };
      };
      budget_templates: {
        Row: {
          id: string;
          ledger_id: string;
          member_id: string;
          scope: BudgetScope;
          category_id: string | null;
          amount_yen: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          member_id: string;
          scope: BudgetScope;
          category_id?: string | null;
          amount_yen: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          member_id?: string;
          scope?: BudgetScope;
          category_id?: string | null;
          amount_yen?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      budget_monthly_snapshots: {
        Row: {
          id: string;
          ledger_id: string;
          member_id: string;
          month: string;
          scope: BudgetScope;
          category_id: string | null;
          amount_yen: number;
          source: BudgetSnapshotSource;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ledger_id: string;
          member_id: string;
          month: string;
          scope: BudgetScope;
          category_id?: string | null;
          amount_yen: number;
          source?: BudgetSnapshotSource;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ledger_id?: string;
          member_id?: string;
          month?: string;
          scope?: BudgetScope;
          category_id?: string | null;
          amount_yen?: number;
          source?: BudgetSnapshotSource;
          created_at?: string;
          updated_at?: string;
        };
      };
      transfer_checklist_completions: {
        Row: {
          transaction_id: string;
          confirmed_by_member_id: string;
          completed_at: string;
        };
        Insert: {
          transaction_id: string;
          confirmed_by_member_id: string;
          completed_at?: string;
        };
        Update: {
          transaction_id?: string;
          confirmed_by_member_id?: string;
          completed_at?: string;
        };
      };
    };
    Views: {
      v_category_paths: {
        Row: {
          id: string;
          type: TransactionType;
          display_name: string;
          parent_id: string | null;
          top_level_id: string;
          top_level_display_name: string;
          sort_order: number;
          is_active: boolean;
        };
      };
    };
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
      transfer_ledger_ownership: {
        Args: { p_ledger_id: string; p_new_owner_id: string };
        Returns: Database['public']['Tables']['ledgers']['Row'];
      };
      rotate_ledger_invite_code: {
        Args: { p_ledger_id: string };
        Returns: Database['public']['Tables']['ledgers']['Row'];
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
          p_ownership: ExpenseOwnership;
          p_split_ratio_a: number;
          p_split_ratio_b: number;
          p_split_amount_a: number | null;
          p_split_amount_b: number | null;
          p_generate_day: number;
          p_start_month: string;
          p_end_month: string | null;
          p_timezone: string;
          p_is_active: boolean;
          p_base_updated_at: string | null;
        };
        Returns: Database['public']['Tables']['recurring_expense_rules']['Row'];
      };
      save_transaction_offline: {
        Args: {
          p_transaction_id: string;
          p_ledger_id: string;
          p_type: TransactionType;
          p_amount_yen: number;
          p_category_id: string;
          p_occurred_on: string;
          p_note: string | null;
          p_paid_by_member_id?: string | null;
          p_ownership?: TransactionOwnership | null;
          p_owned_by_member_id?: string | null;
          p_splits?: Json;
          p_base_updated_at?: string | null;
        };
        Returns: Database['public']['Tables']['transactions']['Row'];
      };
      delete_transaction_offline: {
        Args: { p_transaction_id: string; p_ledger_id: string; p_base_updated_at: string | null };
        Returns: undefined;
      };
      save_recurring_transaction_rule_offline: {
        Args: {
          p_rule_id: string;
          p_ledger_id: string;
          p_type: TransactionType;
          p_name: string;
          p_amount_yen: number;
          p_category_id: string;
          p_generate_day: number;
          p_start_month: string;
          p_end_month?: string | null;
          p_timezone?: string;
          p_is_active?: boolean;
          p_paid_by_member_id?: string | null;
          p_ownership?: TransactionOwnership | null;
          p_owned_by_member_id?: string | null;
          p_splits?: Json;
          p_base_updated_at?: string | null;
        };
        Returns: Database['public']['Tables']['recurring_transaction_rules']['Row'];
      };
      delete_recurring_transaction_rule_offline: {
        Args: { p_rule_id: string; p_ledger_id: string; p_base_updated_at: string | null };
        Returns: undefined;
      };
      generate_recurring_transactions: {
        Args: {
          p_ledger_id?: string | null;
          p_until_month?: string | null;
        };
        Returns: {
          rule_id: string;
          recurring_month: string;
          transaction_id: string | null;
          status: string;
          message: string | null;
        }[];
      };
      save_budget_template_offline: {
        Args: {
          p_template_id: string;
          p_ledger_id: string;
          p_member_id: string;
          p_scope: BudgetScope;
          p_category_id: string | null;
          p_amount_yen: number;
          p_base_updated_at?: string | null;
        };
        Returns: Database['public']['Tables']['budget_templates']['Row'];
      };
      save_budget_monthly_snapshot_offline: {
        Args: {
          p_snapshot_id: string;
          p_ledger_id: string;
          p_member_id: string;
          p_month: string;
          p_scope: BudgetScope;
          p_category_id: string | null;
          p_amount_yen: number;
          p_source?: BudgetSnapshotSource;
          p_base_updated_at?: string | null;
        };
        Returns: Database['public']['Tables']['budget_monthly_snapshots']['Row'];
      };
      sync_budget_template_snapshots: {
        Args: { p_template_id: string };
        Returns: Database['public']['Tables']['budget_monthly_snapshots']['Row'][];
      };
      delete_budget_template_offline: {
        Args: {
          p_template_id: string;
          p_ledger_id: string;
          p_base_updated_at?: string | null;
        };
        Returns: undefined;
      };
      ensure_budget_monthly_snapshots: {
        Args: { p_ledger_id: string; p_month: string };
        Returns: Database['public']['Tables']['budget_monthly_snapshots']['Row'][];
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
      delete_recurring_expense_rule_offline: {
        Args: { p_rule_id: string; p_ledger_id: string; p_base_updated_at: string | null };
        Returns: undefined;
      };
      get_open_transfer_items: {
        Args: { p_ledger_id: string };
        Returns: {
          transaction_id?: string;
          expense_id: string;
          ledger_id: string;
          category: string;
          category_id: string | null;
          subcategory: string | null;
          occurred_on?: string;
          spent_on: string;
          transaction_created_at?: string;
          transaction_updated_at?: string;
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
        Args: { p_updates: { transaction_id?: string; expense_id?: string; confirmed: boolean }[] };
        Returns: undefined;
      };
    };
    Enums: {
      expense_ownership: ExpenseOwnership;
      ledger_member_status: LedgerMemberStatus;
      transaction_type: TransactionType;
      transaction_ownership: TransactionOwnership;
      budget_scope: BudgetScope;
      budget_snapshot_source: BudgetSnapshotSource;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Ledger = Database['public']['Tables']['ledgers']['Row'];
export type LedgerMember = Database['public']['Tables']['ledger_members']['Row'];
export type LedgerCategory = Database['public']['Tables']['ledger_categories']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type TransactionSplitRow = Database['public']['Tables']['transaction_splits']['Row'];
export type RecurringTransactionRule = Database['public']['Tables']['recurring_transaction_rules']['Row'];
export type RecurringRuleSplitRow = Database['public']['Tables']['recurring_rule_splits']['Row'];
export type BudgetTemplate = Database['public']['Tables']['budget_templates']['Row'];
export type BudgetMonthlySnapshot = Database['public']['Tables']['budget_monthly_snapshots']['Row'];
export type RecurringExpenseRule = Database['public']['Tables']['recurring_expense_rules']['Row'];
export type ExpenseRow = Database['public']['Tables']['expenses']['Row'];
export type ExpenseSplitRow = Database['public']['Tables']['expense_splits']['Row'];
export type TransferChecklistItemRow = Database['public']['Functions']['get_open_transfer_items']['Returns'][number];

export type LedgerMemberProfile = LedgerMember & {
  profile: Profile;
};

export type Expense = ExpenseRow & {
  splits: ExpenseSplitRow[];
};

export type Transaction = TransactionRow & {
  splits: TransactionSplitRow[];
};
