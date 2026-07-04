-- Fix enum-to-enum cast in the legacy expenses mirror.
--
-- Postgres does not allow direct casts between distinct enum types. The v2
-- transaction mirror must cast transaction_ownership -> text ->
-- expense_ownership before writing the legacy expenses table.

create or replace function public.sync_expense_legacy_from_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_transaction public.transactions;
  legacy_recurring_rule_id uuid;
begin
  select *
  into target_transaction
  from public.transactions
  where id = p_transaction_id;

  if target_transaction.id is null or target_transaction.type <> 'expense' then
    return;
  end if;

  select r.id
  into legacy_recurring_rule_id
  from public.recurring_expense_rules r
  where r.id = target_transaction.recurring_rule_id;

  insert into public.expenses (
    id, ledger_id, amount_yen, category, category_id, subcategory,
    paid_by, recorded_by, ownership, spent_on, note, recurring_rule_id,
    recurring_month, created_at, updated_at
  )
  select
    target_transaction.id,
    target_transaction.ledger_id,
    target_transaction.amount_yen,
    cp.top_level_display_name,
    cp.top_level_id,
    case when cp.parent_id is not null then cp.display_name else null end,
    target_transaction.paid_by_member_id,
    target_transaction.recorded_by_member_id,
    target_transaction.ownership::text::public.expense_ownership,
    target_transaction.occurred_on,
    target_transaction.note,
    legacy_recurring_rule_id,
    target_transaction.recurring_month,
    target_transaction.created_at,
    target_transaction.updated_at
  from public.v_category_paths cp
  where cp.id = target_transaction.category_id
    and cp.type = target_transaction.type
  on conflict (id) do update
  set amount_yen = excluded.amount_yen,
      category = excluded.category,
      category_id = excluded.category_id,
      subcategory = excluded.subcategory,
      paid_by = excluded.paid_by,
      ownership = excluded.ownership,
      spent_on = excluded.spent_on,
      note = excluded.note,
      recurring_rule_id = excluded.recurring_rule_id,
      recurring_month = excluded.recurring_month;

  delete from public.expense_splits
  where expense_id = target_transaction.id;

  insert into public.expense_splits (expense_id, user_id, amount_yen)
  select transaction_id, responsible_member_id, amount_yen
  from public.transaction_splits
  where transaction_id = target_transaction.id;
end;
$$;

-- Backfill any expense transactions still missing from legacy app-facing table.
select public.sync_expense_legacy_from_transaction(t.id)
from public.transactions t
left join public.expenses e on e.id = t.id
where t.type = 'expense'
  and e.id is null;
