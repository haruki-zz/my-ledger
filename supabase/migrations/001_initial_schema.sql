create extension if not exists pgcrypto;

create type member_slot as enum ('member_a', 'member_b');
create type expense_scope as enum ('personal', 'shared');
create type transaction_status as enum ('confirmed', 'pending_amount');
create type split_mode as enum ('ratio', 'amount');
create type template_kind as enum ('fixed', 'variable');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  default_split_mode split_mode not null default 'ratio',
  default_member_a_ratio integer,
  default_member_b_ratio integer,
  default_member_a_amount_jpy integer,
  default_member_b_amount_jpy integer,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint default_ratio_valid check (
    default_split_mode <> 'ratio'
    or (
      coalesce(default_member_a_ratio, 0) >= 0
      and coalesce(default_member_b_ratio, 0) >= 0
      and coalesce(default_member_a_ratio, 0) + coalesce(default_member_b_ratio, 0) > 0
    )
  ),
  constraint default_amount_valid check (
    default_split_mode <> 'amount'
    or (
      coalesce(default_member_a_amount_jpy, 0) >= 0
      and coalesce(default_member_b_amount_jpy, 0) >= 0
    )
  )
);

create table public.ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot member_slot not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (ledger_id, user_id),
  unique (ledger_id, slot)
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  created_by_member_id uuid references public.ledger_members(id),
  used_by_member_id uuid references public.ledger_members(id),
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null,
  color text not null default '#475569',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (ledger_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  amount_jpy integer,
  scope expense_scope not null,
  status transaction_status not null default 'confirmed',
  category_id uuid not null references public.categories(id),
  paid_by_member_id uuid references public.ledger_members(id),
  owner_member_id uuid references public.ledger_members(id),
  occurred_on date not null,
  billing_month text,
  note text,
  split_mode split_mode,
  member_a_share_amount_jpy integer not null default 0,
  member_b_share_amount_jpy integer not null default 0,
  recurring_template_id uuid,
  created_by_member_id uuid not null references public.ledger_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amount_state_valid check (
    (status = 'pending_amount' and amount_jpy is null)
    or (status = 'confirmed' and amount_jpy is not null and amount_jpy >= 0)
  ),
  constraint personal_shape_valid check (
    scope <> 'personal'
    or (
      owner_member_id is not null
      and split_mode is null
      and member_a_share_amount_jpy = 0
      and member_b_share_amount_jpy = 0
    )
  ),
  constraint shared_shape_valid check (
    scope <> 'shared'
    or (
      owner_member_id is null
      and paid_by_member_id is not null
      and split_mode is not null
    )
  ),
  constraint confirmed_shared_total_valid check (
    status <> 'confirmed'
    or scope <> 'shared'
    or member_a_share_amount_jpy + member_b_share_amount_jpy = amount_jpy
  )
);

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null,
  template_kind template_kind not null,
  category_id uuid not null references public.categories(id),
  paid_by_member_id uuid not null references public.ledger_members(id),
  amount_jpy integer,
  generation_day integer not null check (generation_day between 1 and 31),
  split_mode split_mode not null,
  member_a_ratio integer,
  member_b_ratio integer,
  member_a_share_amount_jpy integer,
  member_b_share_amount_jpy integer,
  is_active boolean not null default true,
  last_generated_month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_amount_valid check (
    (template_kind = 'fixed' and amount_jpy is not null and amount_jpy >= 0)
    or (template_kind = 'variable' and amount_jpy is null)
  ),
  constraint recurring_ratio_valid check (
    split_mode <> 'ratio'
    or (
      coalesce(member_a_ratio, 0) >= 0
      and coalesce(member_b_ratio, 0) >= 0
      and coalesce(member_a_ratio, 0) + coalesce(member_b_ratio, 0) > 0
    )
  )
);

alter table public.transactions
  add constraint transactions_recurring_template_fkey
  foreign key (recurring_template_id)
  references public.recurring_templates(id)
  on delete set null;

create unique index transactions_recurring_once_per_month
  on public.transactions (ledger_id, recurring_template_id, billing_month)
  where recurring_template_id is not null and billing_month is not null;

create or replace function public.is_ledger_member(target_ledger_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_members
    where ledger_id = target_ledger_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.current_member_id(target_ledger_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from public.ledger_members
  where ledger_id = target_ledger_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.random_invite_code()
returns text
language sql
as $$
  select upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
$$;

create or replace function public.seed_categories(target_ledger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (ledger_id, name, color, sort_order)
  values
    (target_ledger_id, '家賃', '#2563eb', 10),
    (target_ledger_id, '水道光熱費', '#0891b2', 20),
    (target_ledger_id, '食材', '#16a34a', 30),
    (target_ledger_id, '外食', '#dc2626', 40),
    (target_ledger_id, '日用品', '#ca8a04', 50),
    (target_ledger_id, '交通', '#7c3aed', 60),
    (target_ledger_id, '医療', '#db2777', 70),
    (target_ledger_id, 'その他', '#475569', 80)
  on conflict (ledger_id, name) do nothing;
end;
$$;

create or replace function public.create_ledger_with_owner(
  ledger_name text,
  member_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ledger_id uuid;
  new_member_id uuid;
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。';
  end if;

  new_code := public.random_invite_code();

  insert into public.ledgers (
    name,
    invite_code,
    default_split_mode,
    default_member_a_ratio,
    default_member_b_ratio,
    created_by
  )
  values (
    coalesce(nullif(trim(ledger_name), ''), 'ふたりの家計簿'),
    new_code,
    'ratio',
    50,
    50,
    auth.uid()
  )
  returning id into new_ledger_id;

  insert into public.ledger_members (ledger_id, user_id, slot, display_name)
  values (
    new_ledger_id,
    auth.uid(),
    'member_a',
    coalesce(nullif(trim(member_display_name), ''), '自分')
  )
  returning id into new_member_id;

  insert into public.invite_codes (ledger_id, code, created_by_member_id)
  values (new_ledger_id, new_code, new_member_id);

  perform public.seed_categories(new_ledger_id);
  return new_ledger_id;
end;
$$;

create or replace function public.join_ledger_by_invite(
  invite_code_input text,
  member_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_ledger_id uuid;
  member_count integer;
  new_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です。';
  end if;

  select ledger_id
  into target_ledger_id
  from public.invite_codes
  where code = upper(trim(invite_code_input))
    and (expires_at is null or expires_at > now())
  limit 1;

  if target_ledger_id is null then
    raise exception '招待コードが見つかりません。';
  end if;

  if exists (
    select 1 from public.ledger_members
    where ledger_id = target_ledger_id and user_id = auth.uid()
  ) then
    return target_ledger_id;
  end if;

  select count(*)
  into member_count
  from public.ledger_members
  where ledger_id = target_ledger_id;

  if member_count >= 2 then
    raise exception 'この家計簿はすでに 2 人で利用されています。';
  end if;

  insert into public.ledger_members (ledger_id, user_id, slot, display_name)
  values (
    target_ledger_id,
    auth.uid(),
    'member_b',
    coalesce(nullif(trim(member_display_name), ''), '相手')
  )
  returning id into new_member_id;

  update public.invite_codes
  set used_by_member_id = new_member_id
  where ledger_id = target_ledger_id
    and code = upper(trim(invite_code_input));

  return target_ledger_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.ledger_members enable row level security;
alter table public.invite_codes enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_templates enable row level security;

create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

create policy "ledgers_member_select" on public.ledgers
  for select using (public.is_ledger_member(id));

create policy "ledgers_member_update" on public.ledgers
  for update using (public.is_ledger_member(id));

create policy "ledger_members_member_select" on public.ledger_members
  for select using (public.is_ledger_member(ledger_id));

create policy "ledger_members_self_update" on public.ledger_members
  for update using (user_id = auth.uid());

create policy "invite_codes_member_select" on public.invite_codes
  for select using (public.is_ledger_member(ledger_id));

create policy "categories_member_all" on public.categories
  for all using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

create policy "transactions_member_all" on public.transactions
  for all using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

create policy "recurring_templates_member_all" on public.recurring_templates
  for all using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));
