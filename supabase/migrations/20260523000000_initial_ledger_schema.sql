create extension if not exists pgcrypto;

create type public.expense_ownership as enum ('personal', 'shared');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_members (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  amount_yen integer not null check (amount_yen > 0),
  category text not null,
  paid_by uuid not null references public.profiles(id) on delete restrict,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  ownership public.expense_ownership not null,
  spent_on date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_yen integer not null check (amount_yen >= 0),
  primary key (expense_id, user_id)
);

create index ledger_members_user_id_idx on public.ledger_members(user_id);
create index expenses_ledger_spent_on_idx on public.expenses(ledger_id, spent_on desc, created_at desc);
create index expense_splits_user_id_idx on public.expense_splits(user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger ledgers_touch_updated_at
before update on public.ledgers
for each row execute function public.touch_updated_at();

create trigger expenses_touch_updated_at
before update on public.expenses
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    '用户'
  );

  insert into public.profiles (id, display_name)
  values (new.id, candidate_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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

create or replace function public.prevent_recorded_by_change()
returns trigger
language plpgsql
as $$
begin
  if old.recorded_by <> new.recorded_by then
    raise exception 'recorded_by cannot be changed';
  end if;

  return new;
end;
$$;

create trigger expenses_prevent_recorded_by_change
before update on public.expenses
for each row execute function public.prevent_recorded_by_change();

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

  insert into public.ledger_members (ledger_id, user_id)
  values (target_ledger.id, current_user_id)
  on conflict do nothing;

  return target_ledger;
end;
$$;

create or replace function public.save_expense(
  p_expense_id uuid,
  p_ledger_id uuid,
  p_amount_yen integer,
  p_category text,
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
begin
  if current_user_id is null then
    raise exception 'not authenticated';
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

  if p_expense_id is null then
    insert into public.expenses (
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
    select *
    into saved_expense
    from public.expenses
    where id = p_expense_id
      and ledger_id = p_ledger_id;

    if saved_expense.id is null then
      raise exception 'expense not found';
    end if;

    update public.expenses
    set amount_yen = p_amount_yen,
        category = trim(p_category),
        paid_by = p_paid_by,
        ownership = p_ownership,
        spent_on = p_spent_on,
        note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_expense_id
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

  return saved_expense;
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger_id uuid;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select ledger_id
  into target_ledger_id
  from public.expenses
  where id = p_expense_id;

  if target_ledger_id is null then
    return;
  end if;

  if not public.is_ledger_member(target_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  delete from public.expenses
  where id = p_expense_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.ledger_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

create policy "authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create policy "users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read ledgers"
on public.ledgers for select
to authenticated
using (public.is_ledger_member(id, auth.uid()));

create policy "members can read ledger members"
on public.ledger_members for select
to authenticated
using (public.is_ledger_member(ledger_id, auth.uid()));

create policy "members can read expenses"
on public.expenses for select
to authenticated
using (public.is_ledger_member(ledger_id, auth.uid()));

create policy "members can read expense splits"
on public.expense_splits for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and public.is_ledger_member(e.ledger_id, auth.uid())
  )
);

grant execute on function public.create_ledger(text) to authenticated;
grant execute on function public.join_ledger_by_invite(text) to authenticated;
grant execute on function public.save_expense(uuid, uuid, integer, text, uuid, public.expense_ownership, date, text, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

alter table public.expenses replica identity full;
alter table public.expense_splits replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'expenses'
     ) then
    execute 'alter publication supabase_realtime add table public.expenses';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'expense_splits'
     ) then
    execute 'alter publication supabase_realtime add table public.expense_splits';
  end if;
end $$;
