create table public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  category_name text not null,
  split_ratio_a integer not null default 50
    check (split_ratio_a >= 0 and split_ratio_a <= 100),
  split_ratio_b integer not null default 50
    check (split_ratio_b >= 0 and split_ratio_b <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, category_name),
  check (split_ratio_a + split_ratio_b = 100),
  check (length(trim(category_name)) > 0)
);

create index ledger_categories_ledger_sort_order_idx
on public.ledger_categories(ledger_id, sort_order, category_name);

create trigger ledger_categories_touch_updated_at
before update on public.ledger_categories
for each row execute function public.touch_updated_at();

alter table public.ledger_categories enable row level security;

create policy "members can read ledger categories"
on public.ledger_categories for select
to authenticated
using (public.is_ledger_member(ledger_id, auth.uid()));

create policy "clients cannot insert ledger categories directly"
on public.ledger_categories for insert
to authenticated
with check (false);

create policy "clients cannot update ledger categories directly"
on public.ledger_categories for update
to authenticated
using (false)
with check (false);

create policy "clients cannot delete ledger categories directly"
on public.ledger_categories for delete
to authenticated
using (false);

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

  insert into public.ledger_categories (ledger_id, category_name, split_ratio_a, split_ratio_b, sort_order)
  values
    (p_ledger_id, '餐饮', 50, 50, 10),
    (p_ledger_id, '日用品', 50, 50, 20),
    (p_ledger_id, '交通', 50, 50, 30),
    (p_ledger_id, '房租', 50, 50, 40),
    (p_ledger_id, '水电燃气', 50, 50, 50),
    (p_ledger_id, '通信', 50, 50, 60),
    (p_ledger_id, '医疗', 50, 50, 70),
    (p_ledger_id, '娱乐', 50, 50, 80),
    (p_ledger_id, '购物', 50, 50, 90),
    (p_ledger_id, '旅行', 50, 50, 100),
    (p_ledger_id, '其他', 50, 50, 110)
  on conflict (ledger_id, category_name) do nothing;
end;
$$;

insert into public.ledger_categories (ledger_id, category_name, split_ratio_a, split_ratio_b, sort_order)
select ledgers.id, category_name, split_ratio_a, split_ratio_b, sort_order
from public.ledgers
cross join (
  values
    ('餐饮', 50, 50, 10),
    ('日用品', 50, 50, 20),
    ('交通', 50, 50, 30),
    ('房租', 50, 50, 40),
    ('水电燃气', 50, 50, 50),
    ('通信', 50, 50, 60),
    ('医疗', 50, 50, 70),
    ('娱乐', 50, 50, 80),
    ('购物', 50, 50, 90),
    ('旅行', 50, 50, 100),
    ('其他', 50, 50, 110)
) as default_categories(category_name, split_ratio_a, split_ratio_b, sort_order)
on conflict (ledger_id, category_name) do nothing;

create or replace function public.save_ledger_category(
  p_ledger_id uuid,
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
  normalized_name text := trim(p_category_name);
begin
  if current_user_id is null then
    raise exception 'not authenticated';
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

  insert into public.ledger_categories (
    ledger_id,
    category_name,
    split_ratio_a,
    split_ratio_b,
    sort_order
  )
  values (
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

  return saved_category;
end;
$$;

create or replace function public.delete_ledger_category(
  p_ledger_id uuid,
  p_category_name text
)
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

  delete from public.ledger_categories
  where ledger_id = p_ledger_id
    and category_name = trim(p_category_name);
end;
$$;

-- Keep this definition in sync with the initial schema's create_ledger RPC.
-- This override adds default category seeding for ledgers created after this migration.
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

  insert into public.ledgers (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), '我们的账本'), current_user_id)
  returning * into created_ledger;

  insert into public.ledger_members (ledger_id, user_id)
  values (created_ledger.id, current_user_id);

  perform public.seed_default_categories(created_ledger.id);

  return created_ledger;
end;
$$;

grant execute on function public.seed_default_categories(uuid) to authenticated;
grant execute on function public.save_ledger_category(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.delete_ledger_category(uuid, text) to authenticated;

alter table public.ledger_categories replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'ledger_categories'
     ) then
    execute 'alter publication supabase_realtime add table public.ledger_categories';
  end if;
end $$;
