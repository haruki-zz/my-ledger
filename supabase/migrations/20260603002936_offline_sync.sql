do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ledger_categories'
      and column_name = 'updated_at'
  ) then
    alter table public.ledger_categories
    add column updated_at timestamptz not null default now();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'ledger_categories_touch_updated_at'
  ) then
    create trigger ledger_categories_touch_updated_at
    before update on public.ledger_categories
    for each row execute function public.touch_updated_at();
  end if;
end $$;

create or replace function public.save_expense_offline(
  p_expense_id uuid,
  p_ledger_id uuid,
  p_amount_yen integer,
  p_category text,
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
      id,
      ledger_id,
      amount_yen,
      category,
      paid_by,
      recorded_by,
      ownership,
      spent_on,
      note
    )
    values (
      p_expense_id,
      p_ledger_id,
      p_amount_yen,
      trim(p_category),
      p_paid_by,
      current_user_id,
      p_ownership,
      p_spent_on,
      nullif(trim(coalesce(p_note, '')), '')
    )
    returning * into saved_expense;
  else
    update public.expenses
    set amount_yen = p_amount_yen,
        category = trim(p_category),
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

create or replace function public.save_ledger_category_offline(
  p_category_id uuid,
  p_ledger_id uuid,
  p_category_name text,
  p_split_ratio_a integer,
  p_split_ratio_b integer,
  p_sort_order integer default 0,
  p_base_updated_at timestamptz default null
)
returns public.ledger_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_category public.ledger_categories;
  saved_category public.ledger_categories;
  normalized_name text := trim(p_category_name);
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_category_id is null then
    raise exception 'category id is required';
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if normalized_name = '' then
    raise exception 'category name cannot be blank';
  end if;

  if p_split_ratio_a < 0 or p_split_ratio_a > 100
     or p_split_ratio_b < 0 or p_split_ratio_b > 100
     or p_split_ratio_a + p_split_ratio_b <> 100 then
    raise exception 'split ratios must add up to 100';
  end if;

  select *
  into previous_category
  from public.ledger_categories
  where id = p_category_id
    and ledger_id = p_ledger_id;

  if previous_category.id is not null
     and p_base_updated_at is not null
     and previous_category.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  if previous_category.id is null then
    insert into public.ledger_categories (
      id,
      ledger_id,
      category_name,
      split_ratio_a,
      split_ratio_b,
      sort_order
    )
    values (
      p_category_id,
      p_ledger_id,
      normalized_name,
      p_split_ratio_a,
      p_split_ratio_b,
      coalesce(p_sort_order, 0)
    )
    on conflict (ledger_id, category_name) do update
    set split_ratio_a = excluded.split_ratio_a,
        split_ratio_b = excluded.split_ratio_b,
        sort_order = excluded.sort_order
    returning * into saved_category;
  else
    update public.ledger_categories
    set category_name = normalized_name,
        split_ratio_a = p_split_ratio_a,
        split_ratio_b = p_split_ratio_b,
        sort_order = coalesce(p_sort_order, 0)
    where id = p_category_id
      and ledger_id = p_ledger_id
    returning * into saved_category;
  end if;

  return saved_category;
end;
$$;

create or replace function public.delete_ledger_category_offline(
  p_category_id uuid,
  p_ledger_id uuid,
  p_category_name text,
  p_base_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_category public.ledger_categories;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_category
  from public.ledger_categories
  where id = p_category_id
     or (ledger_id = p_ledger_id and category_name = trim(p_category_name));

  if target_category.id is null then
    return;
  end if;

  if not public.is_ledger_member(target_category.ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if target_category.ledger_id <> p_ledger_id then
    raise exception 'category does not belong to ledger';
  end if;

  if p_base_updated_at is not null
     and target_category.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.ledger_categories
  where id = target_category.id;
end;
$$;

grant execute on function public.save_expense_offline(uuid, uuid, integer, text, uuid, public.expense_ownership, date, text, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_expense_offline(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.save_ledger_category_offline(uuid, uuid, text, integer, integer, integer, timestamptz) to authenticated;
grant execute on function public.delete_ledger_category_offline(uuid, uuid, text, timestamptz) to authenticated;
