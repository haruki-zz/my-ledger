do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'category_id'
  ) then
    alter table public.expenses add column category_id text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'subcategory'
  ) then
    alter table public.expenses add column subcategory text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ledger_categories' and column_name = 'category_id'
  ) then
    alter table public.ledger_categories add column category_id text;
  end if;
end $$;

create or replace function public.resolve_primary_category_id(p_category text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_category, '')))
    when 'rent' then 'housing'
    when '房租' then 'housing'
    when 'food & dining' then 'food_dining'
    when '餐饮' then 'food_dining'
    when 'household' then 'household'
    when '日用品' then 'household'
    when 'transport' then 'transport'
    when '交通' then 'transport'
    when 'utilities' then 'utilities'
    when '水电燃气' then 'utilities'
    when 'communications' then 'communications'
    when '通信' then 'communications'
    when 'healthcare' then 'healthcare'
    when '医疗' then 'healthcare'
    when 'entertainment' then 'entertainment'
    when '娱乐' then 'entertainment'
    when 'shopping' then 'shopping'
    when '购物' then 'shopping'
    when 'travel' then 'travel'
    when '旅行' then 'travel'
    when 'other' then 'other'
    when '其他' then 'other'
    else 'other'
  end
$$;

create or replace function public.primary_category_label(p_category_id text)
returns text
language sql
immutable
as $$
  select case p_category_id
    when 'food_dining' then 'Food & Dining'
    when 'household' then 'Household'
    when 'transport' then 'Transport'
    when 'housing' then 'Housing'
    when 'utilities' then 'Utilities'
    when 'communications' then 'Communications'
    when 'healthcare' then 'Healthcare'
    when 'entertainment' then 'Entertainment'
    when 'shopping' then 'Shopping'
    when 'travel' then 'Travel'
    else 'Other'
  end
$$;

create or replace function public.is_primary_category_id(p_category_id text)
returns boolean
language sql
immutable
as $$
  select p_category_id in (
    'food_dining',
    'household',
    'transport',
    'housing',
    'utilities',
    'communications',
    'healthcare',
    'entertainment',
    'shopping',
    'travel',
    'other'
  )
$$;

update public.expenses
set category_id = public.resolve_primary_category_id(category)
where category_id is null;

update public.expenses
set subcategory = nullif(trim(category), '')
where subcategory is null
  and category is not null
  and lower(trim(category)) not in (
    'food & dining', '餐饮', 'household', '日用品', 'transport', '交通',
    'utilities', '水电燃气', 'communications', '通信', 'healthcare', '医疗',
    'entertainment', '娱乐', 'shopping', '购物', 'travel', '旅行',
    'other', '其他'
  );

update public.ledger_categories
set category_id = public.resolve_primary_category_id(category_name)
where category_id is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by ledger_id, category_id
      order by
        case
          when lower(trim(coalesce(category_name, ''))) in (
            'food & dining', 'household', 'transport', 'rent', 'utilities',
            'communications', 'healthcare', 'entertainment', 'shopping', 'travel', 'other',
            '餐饮', '日用品', '交通', '房租', '水电燃气', '通信', '医疗', '娱乐', '购物', '旅行', '其他'
          ) then 0
          else 1
        end,
        sort_order,
        created_at
    ) as duplicate_rank
  from public.ledger_categories
  where category_id is not null
)
delete from public.ledger_categories lc
using ranked
where lc.id = ranked.id
  and ranked.duplicate_rank > 1;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ledger_categories_ledger_id_category_name_key'
      and conrelid = 'public.ledger_categories'::regclass
  ) then
    alter table public.ledger_categories
    drop constraint ledger_categories_ledger_id_category_name_key;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'ledger_categories'
      and indexname = 'ledger_categories_ledger_id_category_id_key'
  ) then
    create unique index ledger_categories_ledger_id_category_id_key
    on public.ledger_categories(ledger_id, category_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_category_id_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
    add constraint expenses_category_id_check
    check (category_id is null or public.is_primary_category_id(category_id));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ledger_categories_category_id_check'
      and conrelid = 'public.ledger_categories'::regclass
  ) then
    alter table public.ledger_categories
    add constraint ledger_categories_category_id_check
    check (category_id is null or public.is_primary_category_id(category_id));
  end if;
end $$;

create or replace function public.seed_default_categories(p_ledger_id uuid)
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

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  insert into public.ledger_categories (ledger_id, category_id, category_name, split_ratio_a, split_ratio_b, sort_order)
  values
    (p_ledger_id, 'food_dining', 'Food & Dining', 50, 50, 10),
    (p_ledger_id, 'household', 'Household', 50, 50, 20),
    (p_ledger_id, 'transport', 'Transport', 50, 50, 30),
    (p_ledger_id, 'housing', 'Housing', 50, 50, 40),
    (p_ledger_id, 'utilities', 'Utilities', 50, 50, 50),
    (p_ledger_id, 'communications', 'Communications', 50, 50, 60),
    (p_ledger_id, 'healthcare', 'Healthcare', 50, 50, 70),
    (p_ledger_id, 'entertainment', 'Entertainment', 50, 50, 80),
    (p_ledger_id, 'shopping', 'Shopping', 50, 50, 90),
    (p_ledger_id, 'travel', 'Travel', 50, 50, 100),
    (p_ledger_id, 'other', 'Other', 50, 50, 110)
  on conflict (ledger_id, category_id) do nothing;
end;
$$;

create or replace function public.save_ledger_category(
  p_ledger_id uuid,
  p_category_id text,
  p_category_name text,
  p_split_ratio_a integer,
  p_split_ratio_b integer,
  p_sort_order integer default 0
)
returns public.ledger_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_category public.ledger_categories;
  normalized_category_id text := trim(p_category_id);
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if not public.is_primary_category_id(normalized_category_id) then
    raise exception 'invalid category_id';
  end if;

  if p_split_ratio_a < 0 or p_split_ratio_a > 100
     or p_split_ratio_b < 0 or p_split_ratio_b > 100
     or p_split_ratio_a + p_split_ratio_b <> 100 then
    raise exception 'split ratios must add up to 100';
  end if;

  insert into public.ledger_categories (
    ledger_id,
    category_id,
    category_name,
    split_ratio_a,
    split_ratio_b,
    sort_order
  )
  values (
    p_ledger_id,
    normalized_category_id,
    coalesce(nullif(trim(coalesce(p_category_name, '')), ''), public.primary_category_label(normalized_category_id)),
    p_split_ratio_a,
    p_split_ratio_b,
    coalesce(p_sort_order, 0)
  )
  on conflict (ledger_id, category_id) do update
  set category_name = excluded.category_name,
      split_ratio_a = excluded.split_ratio_a,
      split_ratio_b = excluded.split_ratio_b,
      sort_order = excluded.sort_order
  returning * into saved_category;

  return saved_category;
end;
$$;

create or replace function public.save_expense(
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
  p_splits jsonb default '[]'::jsonb
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
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

  if p_expense_id is null then
    insert into public.expenses (
      ledger_id,
      amount_yen,
      category,
      category_id,
      subcategory,
      paid_by,
      recorded_by,
      ownership,
      spent_on,
      note
    )
    values (
      p_ledger_id,
      p_amount_yen,
      legacy_category,
      normalized_category_id,
      nullif(trim(coalesce(p_subcategory, '')), ''),
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

    if saved_expense.id is null then
      raise exception 'expense not found';
    end if;

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

  return saved_expense;
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
      id,
      ledger_id,
      amount_yen,
      category,
      category_id,
      subcategory,
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
      legacy_category,
      normalized_category_id,
      nullif(trim(coalesce(p_subcategory, '')), ''),
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

create or replace function public.save_ledger_category_offline(
  p_category_id uuid,
  p_ledger_id uuid,
  p_primary_category_id text,
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
  normalized_category_id text := trim(p_primary_category_id);
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

  if not public.is_primary_category_id(normalized_category_id) then
    raise exception 'invalid category_id';
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
      category_id,
      category_name,
      split_ratio_a,
      split_ratio_b,
      sort_order
    )
    values (
      p_category_id,
      p_ledger_id,
      normalized_category_id,
      coalesce(nullif(trim(coalesce(p_category_name, '')), ''), public.primary_category_label(normalized_category_id)),
      p_split_ratio_a,
      p_split_ratio_b,
      coalesce(p_sort_order, 0)
    )
    on conflict (ledger_id, category_id) do update
    set category_name = excluded.category_name,
        split_ratio_a = excluded.split_ratio_a,
        split_ratio_b = excluded.split_ratio_b,
        sort_order = excluded.sort_order
    returning * into saved_category;
  else
    update public.ledger_categories
    set category_id = normalized_category_id,
        category_name = coalesce(nullif(trim(coalesce(p_category_name, '')), ''), public.primary_category_label(normalized_category_id)),
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
    e.paid_by as payer_user_id,
    payer_split.user_id as payee_user_id,
    payer_split.amount_yen,
    payer_completion.completed_at as payer_completed_at,
    payee_completion.completed_at as payee_completed_at
  from public.expenses e
  join public.expense_splits payer_split
    on payer_split.expense_id = e.id
   and payer_split.user_id <> e.paid_by
   and payer_split.amount_yen > 0
  left join public.transfer_checklist_completions payer_completion
    on payer_completion.expense_id = e.id
   and payer_completion.user_id = e.paid_by
  left join public.transfer_checklist_completions payee_completion
    on payee_completion.expense_id = e.id
   and payee_completion.user_id = payer_split.user_id
  where e.ledger_id = p_ledger_id
    and e.ownership = 'shared'
    and (
      payer_completion.completed_at is null
      or payee_completion.completed_at is null
    )
  order by e.spent_on desc, e.created_at desc;
end;
$$;

grant execute on function public.seed_default_categories(uuid) to authenticated;
grant execute on function public.save_ledger_category(uuid, text, text, integer, integer, integer) to authenticated;
grant execute on function public.save_expense(uuid, uuid, integer, text, text, text, uuid, public.expense_ownership, date, text, jsonb) to authenticated;
grant execute on function public.save_expense_offline(uuid, uuid, integer, text, text, text, uuid, public.expense_ownership, date, text, jsonb, timestamptz) to authenticated;
grant execute on function public.save_ledger_category_offline(uuid, uuid, text, text, integer, integer, integer, timestamptz) to authenticated;
grant execute on function public.get_open_transfer_items(uuid) to authenticated;
