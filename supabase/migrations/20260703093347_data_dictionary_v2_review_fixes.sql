-- Review fixes for data dictionary v2 migration.
--
-- This migration is intentionally additive/corrective because
-- 20260703084835_data_dictionary_v2.sql may already have been pushed.

-- ---------------------------------------------------------------------------
-- 1. Owner leave protection must not depend on is_ledger_owner(), because the
--    AFTER UPDATE lifecycle trigger observes the row after status changed to
--    left, making is_active_ledger_member() false.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_ledger_member_lifecycle()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
  ledger_exists boolean;
begin
  select exists(select 1 from public.ledgers where id = coalesce(new.ledger_id, old.ledger_id))
  into ledger_exists;

  if not ledger_exists then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.status = 'active' then
    select count(*)::integer
    into active_count
    from public.ledger_members
    where ledger_id = new.ledger_id
      and status = 'active';

    if active_count > 2 then
      raise exception 'ledger already has MAX_LEDGER_MEMBERS = 2 active members';
    end if;

    if new.left_at is not null then
      raise exception 'active ledger member must not have left_at';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'left' then
    if exists (
      select 1
      from public.ledgers l
      where l.id = old.ledger_id
        and l.owner_id = old.user_id
    ) then
      raise exception 'ledger owner must transfer ownership before leaving';
    end if;

    if exists (
      select 1
      from public.transactions t
      where t.ledger_id = old.ledger_id
        and t.type = 'expense'
        and t.ownership = 'shared'
        and t.occurred_on <= current_date
        and not exists (
          select 1
          from public.transfer_checklist_completions c
          where c.transaction_id = t.id
            and c.confirmed_by_member_id = old.user_id
        )
    ) then
      raise exception 'cannot leave ledger with open shared transfer confirmations';
    end if;
  end if;

  select count(*)::integer
  into active_count
  from public.ledger_members
  where ledger_id = coalesce(new.ledger_id, old.ledger_id)
    and status = 'active';

  if active_count < 1 or active_count > 2 then
    raise exception 'active ledger member count must be between 1 and 2';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Shared mirror helper for current legacy app readers. Existing app code
--    still reads expenses/expense_splits, so recurring generation must mirror
--    generated expense transactions back to those legacy tables.
-- ---------------------------------------------------------------------------

create or replace function public.sync_expense_legacy_from_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_transaction public.transactions;
begin
  select *
  into target_transaction
  from public.transactions
  where id = p_transaction_id;

  if target_transaction.id is null or target_transaction.type <> 'expense' then
    return;
  end if;

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
    target_transaction.ownership::public.expense_ownership,
    target_transaction.occurred_on,
    target_transaction.note,
    target_transaction.recurring_rule_id,
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

-- Backfill any expense transactions generated after v2 migration but before
-- this fix and therefore missing from legacy app-facing tables.
select public.sync_expense_legacy_from_transaction(t.id)
from public.transactions t
left join public.expenses e on e.id = t.id
where t.type = 'expense'
  and e.id is null;

-- ---------------------------------------------------------------------------
-- 3. save_transaction_offline should use the shared mirror helper so the
--    mirror logic stays consistent with recurring generation.
-- ---------------------------------------------------------------------------

create or replace function public.save_transaction_offline(
  p_transaction_id uuid,
  p_ledger_id uuid,
  p_type public.transaction_type,
  p_amount_yen integer,
  p_category_id text,
  p_occurred_on date,
  p_note text,
  p_paid_by_member_id uuid default null,
  p_ownership public.transaction_ownership default null,
  p_owned_by_member_id uuid default null,
  p_splits jsonb default '[]'::jsonb,
  p_base_updated_at timestamptz default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_transaction public.transactions;
  saved_transaction public.transactions;
  split_item jsonb;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_transaction
  from public.transactions
  where id = p_transaction_id
    and ledger_id = p_ledger_id;

  if previous_transaction.id is not null
     and p_base_updated_at is not null
     and previous_transaction.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  if previous_transaction.id is null then
    insert into public.transactions (
      id, ledger_id, type, amount_yen, category_id, occurred_on, note,
      paid_by_member_id, ownership, owned_by_member_id, recorded_by_member_id
    )
    values (
      p_transaction_id, p_ledger_id, p_type, p_amount_yen, trim(p_category_id), p_occurred_on,
      nullif(trim(coalesce(p_note, '')), ''),
      p_paid_by_member_id, p_ownership, p_owned_by_member_id, current_user_id
    )
    returning * into saved_transaction;
  else
    update public.transactions
    set type = p_type,
        amount_yen = p_amount_yen,
        category_id = trim(p_category_id),
        occurred_on = p_occurred_on,
        note = nullif(trim(coalesce(p_note, '')), ''),
        paid_by_member_id = p_paid_by_member_id,
        ownership = p_ownership,
        owned_by_member_id = p_owned_by_member_id
    where id = p_transaction_id
      and ledger_id = p_ledger_id
    returning * into saved_transaction;

    delete from public.transaction_splits
    where transaction_id = saved_transaction.id;

    if previous_transaction.amount_yen <> saved_transaction.amount_yen
       or previous_transaction.paid_by_member_id is distinct from saved_transaction.paid_by_member_id
       or previous_transaction.ownership is distinct from saved_transaction.ownership then
      delete from public.transfer_checklist_completions
      where transaction_id = saved_transaction.id;
    end if;
  end if;

  if p_type = 'expense' and p_ownership = 'shared' then
    if jsonb_typeof(p_splits) <> 'array' then
      raise exception 'splits must be an array';
    end if;

    for split_item in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.transaction_splits (transaction_id, responsible_member_id, amount_yen)
      values (
        saved_transaction.id,
        coalesce(split_item ->> 'responsible_member_id', split_item ->> 'user_id')::uuid,
        (split_item ->> 'amount_yen')::integer
      );
    end loop;
  end if;

  perform public.sync_expense_legacy_from_transaction(saved_transaction.id);

  return saved_transaction;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. generate_recurring_transactions must mirror generated expense rows to
--    legacy tables while the app still reads expenses/expense_splits.
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_transactions(
  p_ledger_id uuid default null,
  p_until_month date default null
)
returns table (
  rule_id uuid,
  recurring_month date,
  transaction_id uuid,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_until date := coalesce(date_trunc('month', p_until_month)::date, date_trunc('month', now())::date);
  rule_record public.recurring_transaction_rules;
  month_cursor date;
  occurred date;
  saved_transaction public.transactions;
  rule_split record;
begin
  if current_user_id is not null and p_ledger_id is not null
     and not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  for rule_record in
    select *
    from public.recurring_transaction_rules
    where is_active = true
      and (p_ledger_id is null or ledger_id = p_ledger_id)
      and start_month <= target_until
      and (end_month is null or end_month >= start_month)
    order by ledger_id, start_month, id
  loop
    month_cursor := rule_record.start_month;
    while month_cursor <= target_until
      and (rule_record.end_month is null or month_cursor <= rule_record.end_month)
    loop
      occurred := month_cursor + (least(rule_record.generate_day, extract(day from public.last_day_of_month(month_cursor))::integer) - 1);
      saved_transaction := null;

      begin
        insert into public.transactions (
          ledger_id, type, amount_yen, category_id, occurred_on, note,
          paid_by_member_id, ownership, owned_by_member_id, recorded_by_member_id,
          recurring_rule_id, recurring_month
        )
        values (
          rule_record.ledger_id, rule_record.type, rule_record.amount_yen, rule_record.category_id, occurred, rule_record.name,
          rule_record.paid_by_member_id, rule_record.ownership, rule_record.owned_by_member_id, rule_record.created_by_member_id,
          rule_record.id, month_cursor
        )
        on conflict (ledger_id, recurring_rule_id, recurring_month) where recurring_rule_id is not null
        do nothing
        returning * into saved_transaction;

        if saved_transaction.id is null then
          select * into saved_transaction
          from public.transactions
          where ledger_id = rule_record.ledger_id
            and recurring_rule_id = rule_record.id
            and recurring_month = month_cursor;
          status := 'skipped';
          message := 'already exists';
        else
          if rule_record.type = 'expense' and rule_record.ownership = 'shared' then
            for rule_split in
              select * from public.recurring_rule_splits where rule_id = rule_record.id
            loop
              insert into public.transaction_splits (transaction_id, responsible_member_id, amount_yen)
              values (saved_transaction.id, rule_split.responsible_member_id, rule_split.amount_yen);
            end loop;
          end if;
          status := 'created';
          message := null;
        end if;

        perform public.sync_expense_legacy_from_transaction(saved_transaction.id);

        rule_id := rule_record.id;
        recurring_month := month_cursor;
        transaction_id := saved_transaction.id;
        return next;
      exception when others then
        rule_id := rule_record.id;
        recurring_month := month_cursor;
        transaction_id := null;
        status := 'error';
        message := sqlerrm;
        return next;
      end;

      month_cursor := (month_cursor + interval '1 month')::date;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Audit recurring rules whose legacy free-text subcategory was not promoted
--    to a global second-level category.
-- ---------------------------------------------------------------------------

with legacy_pairs as (
  select
    coalesce(category_id, 'other') as category_id,
    nullif(trim(subcategory), '') as subcategory,
    count(*)::integer as occurrence_count
  from public.recurring_expense_rules
  where nullif(trim(coalesce(subcategory, '')), '') is not null
  group by 1, 2
),
known_categories as (
  select parent_id as category_id, display_name as subcategory
  from public.categories
  where type = 'expense'
    and parent_id is not null
)
insert into public.category_migration_audit (category_id, subcategory, occurrence_count, decision)
select lp.category_id, lp.subcategory, lp.occurrence_count, 'not_promoted_recurring'
from legacy_pairs lp
left join known_categories kc
  on kc.category_id = lp.category_id
 and lower(kc.subcategory) = lower(lp.subcategory)
where kc.subcategory is null
on conflict (category_id, subcategory) do update
set occurrence_count = public.category_migration_audit.occurrence_count + excluded.occurrence_count,
    decision = case
      when public.category_migration_audit.decision = 'not_promoted' then 'not_promoted_expense_and_recurring'
      else public.category_migration_audit.decision
    end;
