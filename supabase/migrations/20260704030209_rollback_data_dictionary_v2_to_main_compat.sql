-- Temporarily restore database behavior expected by main branch.
--
-- This is a compatibility rollback, not a destructive purge of v2 data:
-- v2 tables/types are intentionally kept so the migration can be rolled
-- forward again later. The old main app reads/writes legacy tables and RPCs.

-- Stop v2 lifecycle triggers that conflict with main's physical leave model.
drop trigger if exists ledger_members_lifecycle_check on public.ledger_members;
drop trigger if exists ledgers_owner_active_member_check on public.ledgers;

-- Ensure all v2 expense transactions are visible to legacy app readers.
do $$
begin
  if to_regclass('public.transactions') is not null
     and to_regclass('public.v_category_paths') is not null then
    insert into public.expenses (
      id, ledger_id, amount_yen, category, category_id, subcategory,
      paid_by, recorded_by, ownership, spent_on, note, recurring_rule_id,
      recurring_month, created_at, updated_at
    )
    select
      t.id,
      t.ledger_id,
      t.amount_yen,
      cp.top_level_display_name,
      cp.top_level_id,
      case when cp.parent_id is not null then cp.display_name else null end,
      t.paid_by_member_id,
      t.recorded_by_member_id,
      t.ownership::text::public.expense_ownership,
      t.occurred_on,
      t.note,
      case when rer.id is not null then t.recurring_rule_id else null end,
      t.recurring_month,
      t.created_at,
      t.updated_at
    from public.transactions t
    join public.v_category_paths cp on cp.id = t.category_id and cp.type = t.type
    left join public.recurring_expense_rules rer on rer.id = t.recurring_rule_id
    where t.type = 'expense'
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

    delete from public.expense_splits es
    using public.transactions t
    where es.expense_id = t.id
      and t.type = 'expense';

    insert into public.expense_splits (expense_id, user_id, amount_yen)
    select transaction_id, responsible_member_id, amount_yen
    from public.transaction_splits
    on conflict (expense_id, user_id) do update
    set amount_yen = excluded.amount_yen;
  end if;
end $$;

-- Restore transfer_checklist_completions column names expected by main.
drop trigger if exists transfer_checklist_completions_parent_check on public.transfer_checklist_completions;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transfer_checklist_completions'
      and column_name = 'transaction_id'
  ) then
    alter table public.transfer_checklist_completions
    drop constraint if exists transfer_checklist_completions_transaction_id_fkey;
    alter table public.transfer_checklist_completions
    rename column transaction_id to expense_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transfer_checklist_completions'
      and column_name = 'confirmed_by_member_id'
  ) then
    alter table public.transfer_checklist_completions
    rename column confirmed_by_member_id to user_id;
  end if;
end $$;

alter table public.transfer_checklist_completions
drop constraint if exists transfer_checklist_completions_transaction_id_fkey;

alter table public.transfer_checklist_completions
drop constraint if exists transfer_checklist_completions_expense_id_fkey;

alter table public.transfer_checklist_completions
add constraint transfer_checklist_completions_expense_id_fkey
foreign key (expense_id)
references public.expenses(id)
on delete cascade;

-- Restore helper functions to main-compatible behavior.
create or replace function public.is_ledger_member(p_ledger_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_members
    where ledger_id = p_ledger_id
      and user_id = p_user_id
  );
$$;

create or replace function public.ledger_member_count(p_ledger_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ledger_members
  where ledger_id = p_ledger_id;
$$;

create or replace function public.create_ledger(p_name text)
returns public.ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  values (current_user_id, '用户')
  on conflict (id) do nothing;

  insert into public.ledgers (name, owner_id, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Shared Ledger'), current_user_id, current_user_id)
  returning * into created_ledger;

  insert into public.ledger_members (ledger_id, user_id, status, joined_at, left_at)
  values (created_ledger.id, current_user_id, 'active', now(), null);

  perform public.seed_default_categories(created_ledger.id);

  return created_ledger;
end;
$$;

create or replace function public.join_ledger_by_invite(p_invite_code text)
returns public.ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_ledger
  from public.ledgers
  where invite_code = upper(trim(p_invite_code));

  if target_ledger.id is null then
    raise exception 'invite code not found';
  end if;

  if public.ledger_member_count(target_ledger.id) >= 2
     and not public.is_ledger_member(target_ledger.id, current_user_id) then
    raise exception 'ledger already has two members';
  end if;

  insert into public.profiles (id, display_name)
  values (current_user_id, '用户')
  on conflict (id) do nothing;

  insert into public.ledger_members (ledger_id, user_id, status, joined_at, left_at)
  values (target_ledger.id, current_user_id, 'active', now(), null)
  on conflict (ledger_id, user_id) do update
  set status = 'active',
      joined_at = now(),
      left_at = null;

  perform public.seed_default_categories(target_ledger.id);

  return target_ledger;
end;
$$;

create or replace function public.leave_ledger(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_ledger
  from public.ledgers
  where id = p_ledger_id;

  if target_ledger.id is null then
    return;
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if target_ledger.created_by = current_user_id then
    raise exception 'ledger owner must delete the ledger';
  end if;

  delete from public.ledger_members
  where ledger_id = p_ledger_id
    and user_id = current_user_id;
end;
$$;

create or replace function public.delete_ledger(p_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_ledger
  from public.ledgers
  where id = p_ledger_id;

  if target_ledger.id is null then
    return;
  end if;

  if target_ledger.created_by <> current_user_id then
    raise exception 'only the ledger owner can delete the ledger';
  end if;

  delete from public.ledgers
  where id = p_ledger_id;
end;
$$;

create or replace function public.save_expense_offline(
  p_expense_id uuid,
  p_ledger_id uuid,
  p_amount_yen integer,
  p_category_id text,
  p_category text,
  p_subcategory text,
  p_paid_by uuid,
  p_ownership public.expense_ownership,
  p_spent_on date,
  p_note text,
  p_splits jsonb default '[]'::jsonb,
  p_base_updated_at timestamptz default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_expense public.expenses;
  saved_expense public.expenses;
  split_item jsonb;
  split_user_id uuid;
  split_amount integer;
  split_total integer := 0;
  split_count integer := 0;
  normalized_category_id text := trim(p_category_id);
  legacy_category text := coalesce(nullif(trim(coalesce(p_category, '')), ''), public.primary_category_label(normalized_category_id));
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_expense_id is null then
    raise exception 'expense id is required';
  end if;

  if p_amount_yen <= 0 then
    raise exception 'amount_yen must be positive';
  end if;

  if not public.is_primary_category_id(normalized_category_id) then
    raise exception 'invalid category_id';
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if not public.is_ledger_member(p_ledger_id, p_paid_by) then
    raise exception 'paid_by must be a ledger member';
  end if;

  select *
  into previous_expense
  from public.expenses
  where id = p_expense_id
    and ledger_id = p_ledger_id;

  if previous_expense.id is not null
     and p_base_updated_at is not null
     and previous_expense.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  if previous_expense.id is null then
    insert into public.expenses (
      id, ledger_id, amount_yen, category, category_id, subcategory,
      paid_by, recorded_by, ownership, spent_on, note
    )
    values (
      p_expense_id, p_ledger_id, p_amount_yen, legacy_category, normalized_category_id,
      nullif(trim(coalesce(p_subcategory, '')), ''), p_paid_by, current_user_id,
      p_ownership, p_spent_on, nullif(trim(coalesce(p_note, '')), '')
    )
    returning * into saved_expense;
  else
    update public.expenses
    set amount_yen = p_amount_yen,
        category = legacy_category,
        category_id = normalized_category_id,
        subcategory = nullif(trim(coalesce(p_subcategory, '')), ''),
        paid_by = p_paid_by,
        ownership = p_ownership,
        spent_on = p_spent_on,
        note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_expense_id
      and ledger_id = p_ledger_id
    returning * into saved_expense;

    delete from public.expense_splits
    where expense_id = saved_expense.id;
  end if;

  if p_ownership = 'shared' then
    if jsonb_typeof(p_splits) <> 'array' then
      raise exception 'splits must be an array';
    end if;

    for split_item in select * from jsonb_array_elements(p_splits)
    loop
      split_user_id := (split_item ->> 'user_id')::uuid;
      split_amount := (split_item ->> 'amount_yen')::integer;

      if split_amount < 0 then
        raise exception 'split amount must be non-negative';
      end if;

      if not public.is_ledger_member(p_ledger_id, split_user_id) then
        raise exception 'split user must be a ledger member';
      end if;

      insert into public.expense_splits (expense_id, user_id, amount_yen)
      values (saved_expense.id, split_user_id, split_amount);

      split_total := split_total + split_amount;
      split_count := split_count + 1;
    end loop;

    if split_count <> public.ledger_member_count(p_ledger_id) then
      raise exception 'shared expense must include every ledger member';
    end if;

    if split_total <> p_amount_yen then
      raise exception 'split total must equal amount_yen';
    end if;
  end if;

  if previous_expense.id is not null
     and (
       previous_expense.amount_yen <> saved_expense.amount_yen
       or previous_expense.paid_by <> saved_expense.paid_by
       or previous_expense.ownership <> saved_expense.ownership
     ) then
    delete from public.transfer_checklist_completions
    where expense_id = saved_expense.id;
  end if;

  return saved_expense;
end;
$$;

create or replace function public.delete_expense_offline(
  p_expense_id uuid,
  p_ledger_id uuid,
  p_base_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_expense public.expenses;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_expense
  from public.expenses
  where id = p_expense_id
    and ledger_id = p_ledger_id;

  if target_expense.id is null then
    return;
  end if;

  if not public.is_ledger_member(target_expense.ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if p_base_updated_at is not null
     and target_expense.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.expenses
  where id = p_expense_id;
end;
$$;

drop function if exists public.get_open_transfer_items(uuid);

create function public.get_open_transfer_items(p_ledger_id uuid)
returns table (
  expense_id uuid,
  ledger_id uuid,
  category text,
  category_id text,
  subcategory text,
  spent_on date,
  expense_created_at timestamptz,
  expense_updated_at timestamptz,
  payer_user_id uuid,
  payee_user_id uuid,
  amount_yen integer,
  payer_completed_at timestamptz,
  payee_completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  return query
  select
    e.id as expense_id,
    e.ledger_id,
    coalesce(e.category, public.primary_category_label(coalesce(e.category_id, public.resolve_primary_category_id(e.category)))) as category,
    coalesce(e.category_id, public.resolve_primary_category_id(e.category)) as category_id,
    e.subcategory,
    e.spent_on,
    e.created_at as expense_created_at,
    e.updated_at as expense_updated_at,
    debtor_split.user_id as payer_user_id,
    e.paid_by as payee_user_id,
    debtor_split.amount_yen,
    payer_completion.completed_at as payer_completed_at,
    payee_completion.completed_at as payee_completed_at
  from public.expenses e
  join public.expense_splits debtor_split
    on debtor_split.expense_id = e.id
   and debtor_split.user_id <> e.paid_by
   and debtor_split.amount_yen > 0
  left join public.transfer_checklist_completions payer_completion
    on payer_completion.expense_id = e.id
   and payer_completion.user_id = debtor_split.user_id
  left join public.transfer_checklist_completions payee_completion
    on payee_completion.expense_id = e.id
   and payee_completion.user_id = e.paid_by
  where e.ledger_id = p_ledger_id
    and e.ownership = 'shared'
    and e.spent_on <= (now() at time zone 'Asia/Tokyo')::date
    and (
      payer_completion.completed_at is null
      or payee_completion.completed_at is null
    )
  order by e.spent_on desc, e.created_at desc;
end;
$$;

create or replace function public.set_transfer_confirmations(p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'updates must be an array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    where update_row.expense_id is null
       or update_row.confirmed is null
  ) then
    raise exception 'each update must include expense_id and confirmed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    join public.expenses e on e.id = update_row.expense_id
    where not public.is_ledger_member(e.ledger_id, current_user_id)
  ) then
    raise exception 'current user is not a ledger member';
  end if;

  insert into public.transfer_checklist_completions (expense_id, user_id)
  select update_row.expense_id, current_user_id
  from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  where update_row.confirmed
  on conflict (expense_id, user_id) do update
  set completed_at = now();

  delete from public.transfer_checklist_completions completion
  using jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  where completion.expense_id = update_row.expense_id
    and completion.user_id = current_user_id
    and not update_row.confirmed;
end;
$$;

-- Restore transfer completion RLS policies to legacy table shape.
drop policy if exists "members can read transfer completions" on public.transfer_checklist_completions;
drop policy if exists "transfer completions are written through RPC" on public.transfer_checklist_completions;
drop policy if exists "members can insert own transfer completion" on public.transfer_checklist_completions;
drop policy if exists "members can update own transfer completion" on public.transfer_checklist_completions;
drop policy if exists "members can delete own transfer completion" on public.transfer_checklist_completions;

create policy "members can read transfer completions"
on public.transfer_checklist_completions for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = transfer_checklist_completions.expense_id
      and public.is_ledger_member(e.ledger_id, auth.uid())
  )
);

create policy "members can insert own transfer completion"
on public.transfer_checklist_completions for insert
to authenticated
with check (user_id = auth.uid());

create policy "members can update own transfer completion"
on public.transfer_checklist_completions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "members can delete own transfer completion"
on public.transfer_checklist_completions for delete
to authenticated
using (user_id = auth.uid());

grant execute on function public.create_ledger(text) to authenticated;
grant execute on function public.join_ledger_by_invite(text) to authenticated;
grant execute on function public.leave_ledger(uuid) to authenticated;
grant execute on function public.delete_ledger(uuid) to authenticated;
grant execute on function public.save_expense_offline(uuid, uuid, integer, text, text, text, uuid, public.expense_ownership, date, text, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_expense_offline(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.get_open_transfer_items(uuid) to authenticated;
grant execute on function public.set_transfer_confirmations(jsonb) to authenticated;
