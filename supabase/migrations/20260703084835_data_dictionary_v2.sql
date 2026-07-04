-- Data dictionary v2 migration.
--
-- This migration intentionally keeps legacy tables in place as migration
-- sources/backups while introducing the v2 contract used by new code.
-- Legacy RPCs are left untouched by name unless replaced below.

create extension if not exists pgcrypto;

do $$
begin
  create type public.ledger_member_status as enum ('active', 'left');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.transaction_type as enum ('expense', 'income');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.transaction_ownership as enum ('personal', 'shared');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.budget_scope as enum ('total', 'category');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.budget_snapshot_source as enum ('template', 'manual_override');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Ledger ownership and member lifecycle
-- ---------------------------------------------------------------------------

alter table public.ledgers
add column if not exists owner_id uuid references public.profiles(id) on delete restrict;

update public.ledgers
set owner_id = created_by
where owner_id is null;

alter table public.ledgers
alter column owner_id set not null;

alter table public.ledger_members
add column if not exists status public.ledger_member_status not null default 'active',
add column if not exists left_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

update public.ledger_members
set status = 'active',
    left_at = null,
    created_at = coalesce(created_at, joined_at, now()),
    updated_at = coalesce(updated_at, joined_at, now())
where status is null or status <> 'active';

drop trigger if exists ledger_members_touch_updated_at on public.ledger_members;
create trigger ledger_members_touch_updated_at
before update on public.ledger_members
for each row execute function public.touch_updated_at();

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
      and status in ('active', 'left')
  );
$$;

create or replace function public.is_active_ledger_member(p_ledger_id uuid, p_user_id uuid)
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
      and status = 'active'
  );
$$;

create or replace function public.active_ledger_member_count(p_ledger_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ledger_members
  where ledger_id = p_ledger_id
    and status = 'active';
$$;

create or replace function public.ledger_member_count(p_ledger_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.active_ledger_member_count(p_ledger_id);
$$;

create or replace function public.is_ledger_owner(p_ledger_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledgers l
    where l.id = p_ledger_id
      and l.owner_id = p_user_id
      and public.is_active_ledger_member(p_ledger_id, p_user_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id text primary key,
  type public.transaction_type not null,
  parent_id text,
  display_name text not null check (length(trim(display_name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, type),
  constraint categories_parent_type_fkey
    foreign key (parent_id, type)
    references public.categories(id, type)
    on delete restrict
);

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
before update on public.categories
for each row execute function public.touch_updated_at();

create or replace function public.ensure_category_depth()
returns trigger
language plpgsql
as $$
declare
  parent_parent_id text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id
  into parent_parent_id
  from public.categories
  where id = new.parent_id
    and type = new.type;

  if parent_parent_id is not null then
    raise exception 'categories support at most two levels';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_depth_check on public.categories;
create trigger categories_depth_check
before insert or update on public.categories
for each row execute function public.ensure_category_depth();

insert into public.categories (id, type, parent_id, display_name, sort_order)
values
  ('food_dining', 'expense', null, 'Food & Dining', 10),
  ('household', 'expense', null, 'Household', 20),
  ('transport', 'expense', null, 'Transport', 30),
  ('housing', 'expense', null, 'Housing', 40),
  ('utilities', 'expense', null, 'Utilities', 50),
  ('communications', 'expense', null, 'Communications', 60),
  ('healthcare', 'expense', null, 'Healthcare', 70),
  ('entertainment', 'expense', null, 'Entertainment', 80),
  ('shopping', 'expense', null, 'Shopping', 90),
  ('travel', 'expense', null, 'Travel', 100),
  ('other', 'expense', null, 'Other', 110),
  ('salary', 'income', null, 'Salary', 10),
  ('bonus', 'income', null, 'Bonus', 20),
  ('investment_income', 'income', null, 'Investment Income', 30),
  ('gift_income', 'income', null, 'Gift', 40),
  ('other_income', 'income', null, 'Other Income', 90)
on conflict (id) do update
set type = excluded.type,
    parent_id = excluded.parent_id,
    display_name = excluded.display_name,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.categories (id, type, parent_id, display_name, sort_order)
values
  ('food_dining_groceries', 'expense', 'food_dining', 'Groceries', 11),
  ('food_dining_restaurant', 'expense', 'food_dining', 'Restaurant', 12),
  ('food_dining_cafe', 'expense', 'food_dining', 'Cafe', 13),
  ('food_dining_delivery', 'expense', 'food_dining', 'Delivery', 14),
  ('food_dining_drinks', 'expense', 'food_dining', 'Drinks', 15),
  ('food_dining_convenience', 'expense', 'food_dining', 'Convenience', 16),
  ('household_daily_goods', 'expense', 'household', 'Daily Goods', 21),
  ('household_cleaning', 'expense', 'household', 'Cleaning', 22),
  ('household_furniture', 'expense', 'household', 'Furniture', 23),
  ('household_kitchen', 'expense', 'household', 'Kitchen', 24),
  ('household_laundry', 'expense', 'household', 'Laundry', 25),
  ('transport_train', 'expense', 'transport', 'Train', 31),
  ('transport_taxi', 'expense', 'transport', 'Taxi', 32),
  ('transport_bus', 'expense', 'transport', 'Bus', 33),
  ('transport_parking', 'expense', 'transport', 'Parking', 34),
  ('transport_fuel', 'expense', 'transport', 'Fuel', 35),
  ('housing_rent', 'expense', 'housing', 'Rent', 41),
  ('housing_mortgage', 'expense', 'housing', 'Mortgage', 42),
  ('housing_building_fee', 'expense', 'housing', 'Building Fee', 43),
  ('housing_repair', 'expense', 'housing', 'Repair', 44),
  ('housing_moving', 'expense', 'housing', 'Moving', 45),
  ('utilities_electricity', 'expense', 'utilities', 'Electricity', 51),
  ('utilities_gas', 'expense', 'utilities', 'Gas', 52),
  ('utilities_water', 'expense', 'utilities', 'Water', 53),
  ('utilities_heating', 'expense', 'utilities', 'Heating', 54),
  ('communications_mobile', 'expense', 'communications', 'Mobile', 61),
  ('communications_internet', 'expense', 'communications', 'Internet', 62),
  ('communications_phone', 'expense', 'communications', 'Phone', 63),
  ('communications_postage', 'expense', 'communications', 'Postage', 64),
  ('healthcare_doctor', 'expense', 'healthcare', 'Doctor', 71),
  ('healthcare_pharmacy', 'expense', 'healthcare', 'Pharmacy', 72),
  ('healthcare_dental', 'expense', 'healthcare', 'Dental', 73),
  ('healthcare_wellness', 'expense', 'healthcare', 'Wellness', 74),
  ('entertainment_movies_shows', 'expense', 'entertainment', 'Movies & Shows', 81),
  ('entertainment_dating', 'expense', 'entertainment', 'Dating', 82),
  ('entertainment_games', 'expense', 'entertainment', 'Games', 83),
  ('entertainment_music', 'expense', 'entertainment', 'Music', 84),
  ('entertainment_subscription', 'expense', 'entertainment', 'Subscription', 85),
  ('entertainment_hobby', 'expense', 'entertainment', 'Hobby', 86),
  ('entertainment_sports', 'expense', 'entertainment', 'Sports', 87),
  ('shopping_clothes', 'expense', 'shopping', 'Clothes', 91),
  ('shopping_electronics', 'expense', 'shopping', 'Electronics', 92),
  ('shopping_gifts', 'expense', 'shopping', 'Gifts', 93),
  ('shopping_beauty_salon', 'expense', 'shopping', 'Beauty & Salon', 94),
  ('shopping_books', 'expense', 'shopping', 'Books', 95),
  ('travel_hotel', 'expense', 'travel', 'Hotel', 101),
  ('travel_flight', 'expense', 'travel', 'Flight', 102),
  ('travel_local_transport', 'expense', 'travel', 'Local Transport', 103),
  ('travel_activities', 'expense', 'travel', 'Activities', 104),
  ('travel_souvenirs', 'expense', 'travel', 'Souvenirs', 105),
  ('other_insurance', 'expense', 'other', 'Insurance', 111),
  ('other_fees', 'expense', 'other', 'Fees', 112),
  ('other_gift', 'expense', 'other', 'Gift', 113),
  ('other_misc', 'expense', 'other', 'Misc', 114)
on conflict (id) do update
set type = excluded.type,
    parent_id = excluded.parent_id,
    display_name = excluded.display_name,
    sort_order = excluded.sort_order,
    is_active = true;

create or replace view public.v_category_paths
with (security_invoker = true)
as
select
  c.id,
  c.type,
  c.display_name,
  c.parent_id,
  coalesce(parent.id, c.id) as top_level_id,
  coalesce(parent.display_name, c.display_name) as top_level_display_name,
  c.sort_order,
  c.is_active
from public.categories c
left join public.categories parent
  on parent.id = c.parent_id
 and parent.type = c.type;

-- Explicit grants because new public tables may not be exposed automatically.
grant select on public.categories to authenticated;
grant select on public.v_category_paths to authenticated;

-- ---------------------------------------------------------------------------
-- New business tables
-- ---------------------------------------------------------------------------

create table if not exists public.recurring_transaction_rules (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  type public.transaction_type not null,
  name text not null check (length(trim(name)) > 0),
  amount_yen integer not null check (amount_yen > 0),
  category_id text not null,
  generate_day smallint not null default 1 check (generate_day between 1 and 31),
  start_month date not null,
  end_month date,
  timezone text not null default 'Asia/Tokyo',
  is_active boolean not null default true,
  paid_by_member_id uuid references public.profiles(id) on delete restrict,
  ownership public.transaction_ownership,
  owned_by_member_id uuid references public.profiles(id) on delete restrict,
  created_by_member_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transaction_rules_type_fields_check check (
    (
      type = 'expense'
      and paid_by_member_id is not null
      and ownership is not null
      and owned_by_member_id is null
    )
    or
    (
      type = 'income'
      and owned_by_member_id is not null
      and paid_by_member_id is null
      and ownership is null
    )
  ),
  constraint recurring_transaction_rules_start_month_check check (start_month = date_trunc('month', start_month)::date),
  constraint recurring_transaction_rules_end_month_check check (end_month is null or end_month = date_trunc('month', end_month)::date),
  constraint recurring_transaction_rules_end_after_start_check check (end_month is null or end_month >= start_month),
  constraint recurring_transaction_rules_category_fkey foreign key (category_id, type)
    references public.categories(id, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  type public.transaction_type not null,
  amount_yen integer not null check (amount_yen > 0),
  category_id text not null,
  occurred_on date not null,
  note text,
  paid_by_member_id uuid references public.profiles(id) on delete restrict,
  ownership public.transaction_ownership,
  owned_by_member_id uuid references public.profiles(id) on delete restrict,
  recorded_by_member_id uuid not null references public.profiles(id) on delete restrict,
  recurring_rule_id uuid references public.recurring_transaction_rules(id) on delete set null,
  recurring_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_type_fields_check check (
    (
      type = 'expense'
      and paid_by_member_id is not null
      and ownership is not null
      and owned_by_member_id is null
    )
    or
    (
      type = 'income'
      and owned_by_member_id is not null
      and paid_by_member_id is null
      and ownership is null
    )
  ),
  constraint transactions_recurring_month_check check (recurring_month is null or recurring_month = date_trunc('month', recurring_month)::date),
  constraint transactions_category_fkey foreign key (category_id, type)
    references public.categories(id, type)
);

create table if not exists public.transaction_splits (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  responsible_member_id uuid not null references public.profiles(id) on delete cascade,
  amount_yen integer not null check (amount_yen >= 0),
  primary key (transaction_id, responsible_member_id)
);

create table if not exists public.recurring_rule_splits (
  rule_id uuid not null references public.recurring_transaction_rules(id) on delete cascade,
  responsible_member_id uuid not null references public.profiles(id) on delete cascade,
  amount_yen integer not null check (amount_yen >= 0),
  primary key (rule_id, responsible_member_id)
);

create table if not exists public.budget_templates (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete restrict,
  scope public.budget_scope not null,
  category_id text,
  amount_yen integer not null check (amount_yen >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_templates_scope_category_check check (
    (scope = 'total' and category_id is null)
    or (scope = 'category' and category_id is not null)
  )
);

create table if not exists public.budget_monthly_snapshots (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete restrict,
  month date not null,
  scope public.budget_scope not null,
  category_id text,
  amount_yen integer not null check (amount_yen >= 0),
  source public.budget_snapshot_source not null default 'template',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_monthly_snapshots_month_check check (month = date_trunc('month', month)::date),
  constraint budget_monthly_snapshots_scope_category_check check (
    (scope = 'total' and category_id is null)
    or (scope = 'category' and category_id is not null)
  )
);

create unique index if not exists budget_templates_total_key
on public.budget_templates(ledger_id, member_id)
where scope = 'total';

create unique index if not exists budget_templates_category_key
on public.budget_templates(ledger_id, member_id, category_id)
where scope = 'category';

create unique index if not exists budget_monthly_snapshots_total_key
on public.budget_monthly_snapshots(ledger_id, member_id, month)
where scope = 'total';

create unique index if not exists budget_monthly_snapshots_category_key
on public.budget_monthly_snapshots(ledger_id, member_id, month, category_id)
where scope = 'category';

create index if not exists transactions_ledger_occurred_idx
on public.transactions(ledger_id, occurred_on desc, created_at desc);

create index if not exists transactions_ledger_type_occurred_idx
on public.transactions(ledger_id, type, occurred_on desc);

create index if not exists transactions_ledger_category_occurred_idx
on public.transactions(ledger_id, category_id, occurred_on desc);

create unique index if not exists transactions_recurring_rule_month_key
on public.transactions(ledger_id, recurring_rule_id, recurring_month)
where recurring_rule_id is not null;

create index if not exists transaction_splits_responsible_member_idx
on public.transaction_splits(responsible_member_id);

create index if not exists recurring_transaction_rules_ledger_idx
on public.recurring_transaction_rules(ledger_id, is_active, type, category_id);

drop trigger if exists recurring_transaction_rules_touch_updated_at on public.recurring_transaction_rules;
create trigger recurring_transaction_rules_touch_updated_at
before update on public.recurring_transaction_rules
for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute function public.touch_updated_at();

drop trigger if exists budget_templates_touch_updated_at on public.budget_templates;
create trigger budget_templates_touch_updated_at
before update on public.budget_templates
for each row execute function public.touch_updated_at();

drop trigger if exists budget_monthly_snapshots_touch_updated_at on public.budget_monthly_snapshots;
create trigger budget_monthly_snapshots_touch_updated_at
before update on public.budget_monthly_snapshots
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Data migration from legacy tables
-- ---------------------------------------------------------------------------

create table if not exists public.category_migration_audit (
  category_id text,
  subcategory text,
  occurrence_count integer not null,
  decision text not null default 'not_promoted',
  created_at timestamptz not null default now(),
  primary key (category_id, subcategory)
);

with legacy_pairs as (
  select
    coalesce(category_id, public.resolve_primary_category_id(category)) as category_id,
    nullif(trim(subcategory), '') as subcategory,
    count(*)::integer as occurrence_count
  from public.expenses
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
select lp.category_id, lp.subcategory, lp.occurrence_count, 'not_promoted'
from legacy_pairs lp
left join known_categories kc
  on kc.category_id = lp.category_id
 and lower(kc.subcategory) = lower(lp.subcategory)
where kc.subcategory is null
on conflict (category_id, subcategory) do update
set occurrence_count = excluded.occurrence_count;

insert into public.recurring_transaction_rules (
  id,
  ledger_id,
  type,
  name,
  amount_yen,
  category_id,
  generate_day,
  start_month,
  end_month,
  timezone,
  is_active,
  paid_by_member_id,
  ownership,
  owned_by_member_id,
  created_by_member_id,
  created_at,
  updated_at
)
select
  r.id,
  r.ledger_id,
  'expense',
  r.name,
  r.amount_yen,
  coalesce(c.id, r.category_id, 'other'),
  r.generate_day,
  r.start_month,
  r.end_month,
  r.timezone,
  r.is_active,
  r.paid_by,
  r.ownership::text::public.transaction_ownership,
  null,
  r.created_by,
  r.created_at,
  r.updated_at
from public.recurring_expense_rules r
left join public.categories c
  on c.type = 'expense'
 and c.parent_id = coalesce(r.category_id, 'other')
 and lower(c.display_name) = lower(nullif(trim(coalesce(r.subcategory, '')), ''))
on conflict (id) do nothing;

insert into public.transactions (
  id,
  ledger_id,
  type,
  amount_yen,
  category_id,
  occurred_on,
  note,
  paid_by_member_id,
  ownership,
  owned_by_member_id,
  recorded_by_member_id,
  recurring_rule_id,
  recurring_month,
  created_at,
  updated_at
)
select
  e.id,
  e.ledger_id,
  'expense',
  e.amount_yen,
  coalesce(c.id, e.category_id, public.resolve_primary_category_id(e.category), 'other'),
  e.spent_on,
  nullif(trim(concat_ws(E'\n', e.note, case
    when e.subcategory is not null and c.id is null then 'Legacy subcategory: ' || e.subcategory
    else null
  end)), ''),
  e.paid_by,
  e.ownership::text::public.transaction_ownership,
  null,
  e.recorded_by,
  e.recurring_rule_id,
  e.recurring_month,
  e.created_at,
  e.updated_at
from public.expenses e
left join public.categories c
  on c.type = 'expense'
 and c.parent_id = coalesce(e.category_id, public.resolve_primary_category_id(e.category), 'other')
 and lower(c.display_name) = lower(nullif(trim(coalesce(e.subcategory, '')), ''))
on conflict (id) do nothing;

insert into public.transaction_splits (transaction_id, responsible_member_id, amount_yen)
select expense_id, user_id, amount_yen
from public.expense_splits
on conflict (transaction_id, responsible_member_id) do update
set amount_yen = excluded.amount_yen;

with ordered_members as (
  select
    lm.ledger_id,
    lm.user_id,
    row_number() over (partition by lm.ledger_id order by lm.joined_at, lm.user_id) as member_order
  from public.ledger_members lm
  where lm.status = 'active'
),
rule_split_seed as (
  select
    r.id as rule_id,
    om.user_id,
    case
      when om.member_order = 1 then coalesce(r.split_amount_a, round(r.amount_yen * r.split_ratio_a / 100.0)::integer)
      when om.member_order = 2 then coalesce(r.split_amount_b, r.amount_yen - coalesce(r.split_amount_a, round(r.amount_yen * r.split_ratio_a / 100.0)::integer))
      else 0
    end as amount_yen
  from public.recurring_expense_rules r
  join ordered_members om on om.ledger_id = r.ledger_id
  where r.ownership = 'shared'
)
insert into public.recurring_rule_splits (rule_id, responsible_member_id, amount_yen)
select rule_id, user_id, amount_yen
from rule_split_seed
where amount_yen is not null
on conflict (rule_id, responsible_member_id) do update
set amount_yen = excluded.amount_yen;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transfer_checklist_completions'
      and column_name = 'expense_id'
  ) then
    alter table public.transfer_checklist_completions
    drop constraint if exists transfer_checklist_completions_expense_id_fkey;
    alter table public.transfer_checklist_completions
    rename column expense_id to transaction_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transfer_checklist_completions'
      and column_name = 'user_id'
  ) then
    alter table public.transfer_checklist_completions
    rename column user_id to confirmed_by_member_id;
  end if;
end $$;

alter table public.transfer_checklist_completions
add constraint transfer_checklist_completions_transaction_id_fkey
foreign key (transaction_id)
references public.transactions(id)
on delete cascade;

-- ---------------------------------------------------------------------------
-- Invariant triggers
-- ---------------------------------------------------------------------------

create or replace function public.prevent_recorded_by_member_change()
returns trigger
language plpgsql
as $$
begin
  if old.recorded_by_member_id <> new.recorded_by_member_id then
    raise exception 'recorded_by_member_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_prevent_recorded_by_member_change on public.transactions;
create trigger transactions_prevent_recorded_by_member_change
before update on public.transactions
for each row execute function public.prevent_recorded_by_member_change();

create or replace function public.ensure_ledger_owner_is_active_member()
returns trigger
language plpgsql
as $$
begin
  if not public.is_active_ledger_member(new.id, new.owner_id) then
    raise exception 'ledger owner must be an active member';
  end if;
  return new;
end;
$$;

drop trigger if exists ledgers_owner_active_member_check on public.ledgers;
create constraint trigger ledgers_owner_active_member_check
after insert or update of owner_id on public.ledgers
deferrable initially deferred
for each row execute function public.ensure_ledger_owner_is_active_member();

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
    if public.is_ledger_owner(new.ledger_id, new.user_id) then
      raise exception 'ledger owner must transfer ownership before leaving';
    end if;

    if exists (
      select 1
      from public.transactions t
      where t.ledger_id = new.ledger_id
        and t.type = 'expense'
        and t.ownership = 'shared'
        and t.occurred_on <= current_date
        and not exists (
          select 1
          from public.transfer_checklist_completions c
          where c.transaction_id = t.id
            and c.confirmed_by_member_id = new.user_id
        )
    ) then
      raise exception 'cannot leave ledger with open shared transfer confirmations';
    end if;

    if new.left_at is null then
      new.left_at := now();
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

drop trigger if exists ledger_members_lifecycle_check on public.ledger_members;
create constraint trigger ledger_members_lifecycle_check
after insert or update or delete on public.ledger_members
deferrable initially deferred
for each row execute function public.ensure_ledger_member_lifecycle();

create or replace function public.ensure_shared_transaction_allowed()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'expense' and new.ownership = 'shared'
     and public.active_ledger_member_count(new.ledger_id) <> 2 then
    raise exception 'shared expenses require exactly two active ledger members';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_shared_allowed_check on public.transactions;
create trigger transactions_shared_allowed_check
before insert or update on public.transactions
for each row execute function public.ensure_shared_transaction_allowed();

create or replace function public.ensure_shared_recurring_rule_allowed()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'expense' and new.ownership = 'shared'
     and public.active_ledger_member_count(new.ledger_id) <> 2 then
    raise exception 'shared recurring expense rules require exactly two active ledger members';
  end if;
  return new;
end;
$$;

drop trigger if exists recurring_transaction_rules_shared_allowed_check on public.recurring_transaction_rules;
create trigger recurring_transaction_rules_shared_allowed_check
before insert or update on public.recurring_transaction_rules
for each row execute function public.ensure_shared_recurring_rule_allowed();

create or replace function public.ensure_transaction_split_parent()
returns trigger
language plpgsql
as $$
declare
  parent public.transactions;
begin
  select * into parent from public.transactions where id = new.transaction_id;
  if parent.id is null or parent.type <> 'expense' or parent.ownership <> 'shared' then
    raise exception 'transaction_splits only support shared expense transactions';
  end if;
  if not public.is_active_ledger_member(parent.ledger_id, new.responsible_member_id) then
    raise exception 'split responsible member must be active';
  end if;
  return new;
end;
$$;

drop trigger if exists transaction_splits_parent_check on public.transaction_splits;
create trigger transaction_splits_parent_check
before insert or update on public.transaction_splits
for each row execute function public.ensure_transaction_split_parent();

create or replace function public.validate_transaction_splits(p_transaction_id uuid)
returns void
language plpgsql
as $$
declare
  parent public.transactions;
  active_count integer;
  split_count integer;
  split_total integer;
begin
  select * into parent from public.transactions where id = p_transaction_id;
  if parent.id is null then
    return;
  end if;

  select count(*)::integer
  into split_count
  from public.transaction_splits s
  join public.ledger_members lm
    on lm.ledger_id = parent.ledger_id
   and lm.user_id = s.responsible_member_id
   and lm.status = 'active'
  where s.transaction_id = p_transaction_id;

  select coalesce(sum(amount_yen), 0)::integer
  into split_total
  from public.transaction_splits
  where transaction_id = p_transaction_id;

  select public.active_ledger_member_count(parent.ledger_id) into active_count;

  if parent.type = 'expense' and parent.ownership = 'shared' then
    if split_count <> active_count then
      raise exception 'shared transaction split must cover all active ledger members';
    end if;
    if split_total <> parent.amount_yen then
      raise exception 'shared transaction split total must equal amount_yen';
    end if;
  elsif split_total <> 0 then
    raise exception 'non-shared transactions must not have splits';
  end if;
end;
$$;

create or replace function public.ensure_transaction_splits_complete_from_split()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_transaction_splits(coalesce(new.transaction_id, old.transaction_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_transaction_splits_complete_from_transaction()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_transaction_splits(new.id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists transaction_splits_complete_check on public.transaction_splits;
create constraint trigger transaction_splits_complete_check
after insert or update or delete on public.transaction_splits
deferrable initially deferred
for each row execute function public.ensure_transaction_splits_complete_from_split();

drop trigger if exists transactions_split_complete_check on public.transactions;
create constraint trigger transactions_split_complete_check
after insert or update on public.transactions
deferrable initially deferred
for each row execute function public.ensure_transaction_splits_complete_from_transaction();

create or replace function public.ensure_recurring_rule_split_parent()
returns trigger
language plpgsql
as $$
declare
  parent public.recurring_transaction_rules;
begin
  select * into parent from public.recurring_transaction_rules where id = new.rule_id;
  if parent.id is null or parent.type <> 'expense' or parent.ownership <> 'shared' then
    raise exception 'recurring_rule_splits only support shared expense rules';
  end if;
  if not public.is_active_ledger_member(parent.ledger_id, new.responsible_member_id) then
    raise exception 'rule split responsible member must be active';
  end if;
  return new;
end;
$$;

drop trigger if exists recurring_rule_splits_parent_check on public.recurring_rule_splits;
create trigger recurring_rule_splits_parent_check
before insert or update on public.recurring_rule_splits
for each row execute function public.ensure_recurring_rule_split_parent();

create or replace function public.validate_recurring_rule_splits(p_rule_id uuid)
returns void
language plpgsql
as $$
declare
  parent public.recurring_transaction_rules;
  active_count integer;
  split_count integer;
  split_total integer;
begin
  select * into parent from public.recurring_transaction_rules where id = p_rule_id;
  if parent.id is null then
    return;
  end if;

  select count(*)::integer
  into split_count
  from public.recurring_rule_splits s
  join public.ledger_members lm
    on lm.ledger_id = parent.ledger_id
   and lm.user_id = s.responsible_member_id
   and lm.status = 'active'
  where s.rule_id = p_rule_id;

  select coalesce(sum(amount_yen), 0)::integer
  into split_total
  from public.recurring_rule_splits
  where rule_id = p_rule_id;

  select public.active_ledger_member_count(parent.ledger_id) into active_count;

  if parent.type = 'expense' and parent.ownership = 'shared' then
    if split_count <> active_count then
      raise exception 'shared recurring rule split must cover all active ledger members';
    end if;
    if split_total <> parent.amount_yen then
      raise exception 'shared recurring rule split total must equal amount_yen';
    end if;
  elsif split_total <> 0 then
    raise exception 'non-shared recurring rules must not have splits';
  end if;
end;
$$;

create or replace function public.ensure_recurring_rule_splits_complete_from_split()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_recurring_rule_splits(coalesce(new.rule_id, old.rule_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_recurring_rule_splits_complete_from_rule()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_recurring_rule_splits(new.id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists recurring_rule_splits_complete_check on public.recurring_rule_splits;
create constraint trigger recurring_rule_splits_complete_check
after insert or update or delete on public.recurring_rule_splits
deferrable initially deferred
for each row execute function public.ensure_recurring_rule_splits_complete_from_split();

drop trigger if exists recurring_transaction_rules_split_complete_check on public.recurring_transaction_rules;
create constraint trigger recurring_transaction_rules_split_complete_check
after insert or update on public.recurring_transaction_rules
deferrable initially deferred
for each row execute function public.ensure_recurring_rule_splits_complete_from_rule();

create or replace function public.ensure_budget_category_and_member()
returns trigger
language plpgsql
as $$
begin
  if not public.is_active_ledger_member(new.ledger_id, new.member_id) then
    raise exception 'budget member must be an active ledger member';
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.categories
    where id = new.category_id
      and type = 'expense'
  ) then
    raise exception 'budget category must be an expense category';
  end if;

  return new;
end;
$$;

drop trigger if exists budget_templates_category_member_check on public.budget_templates;
create trigger budget_templates_category_member_check
before insert or update on public.budget_templates
for each row execute function public.ensure_budget_category_and_member();

drop trigger if exists budget_monthly_snapshots_category_member_check on public.budget_monthly_snapshots;
create trigger budget_monthly_snapshots_category_member_check
before insert or update on public.budget_monthly_snapshots
for each row execute function public.ensure_budget_category_and_member();

create or replace function public.validate_budget_template_total(p_ledger_id uuid, p_member_id uuid)
returns void
language plpgsql
as $$
declare
  total_amount integer;
  category_amount integer;
begin
  select amount_yen into total_amount
  from public.budget_templates
  where ledger_id = p_ledger_id
    and member_id = p_member_id
    and scope = 'total';

  select coalesce(sum(amount_yen), 0)::integer into category_amount
  from public.budget_templates
  where ledger_id = p_ledger_id
    and member_id = p_member_id
    and scope = 'category';

  if total_amount is not null and category_amount > total_amount then
    raise exception 'category budget templates cannot exceed total budget template';
  end if;
end;
$$;

create or replace function public.ensure_budget_template_total()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_budget_template_total(coalesce(new.ledger_id, old.ledger_id), coalesce(new.member_id, old.member_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists budget_templates_total_check on public.budget_templates;
create constraint trigger budget_templates_total_check
after insert or update or delete on public.budget_templates
deferrable initially deferred
for each row execute function public.ensure_budget_template_total();

create or replace function public.validate_budget_snapshot_total(p_ledger_id uuid, p_member_id uuid, p_month date)
returns void
language plpgsql
as $$
declare
  total_amount integer;
  category_amount integer;
begin
  select amount_yen into total_amount
  from public.budget_monthly_snapshots
  where ledger_id = p_ledger_id
    and member_id = p_member_id
    and month = p_month
    and scope = 'total';

  select coalesce(sum(amount_yen), 0)::integer into category_amount
  from public.budget_monthly_snapshots
  where ledger_id = p_ledger_id
    and member_id = p_member_id
    and month = p_month
    and scope = 'category';

  if total_amount is not null and category_amount > total_amount then
    raise exception 'category budget snapshots cannot exceed total budget snapshot';
  end if;
end;
$$;

create or replace function public.ensure_budget_snapshot_total()
returns trigger
language plpgsql
as $$
begin
  perform public.validate_budget_snapshot_total(
    coalesce(new.ledger_id, old.ledger_id),
    coalesce(new.member_id, old.member_id),
    coalesce(new.month, old.month)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists budget_monthly_snapshots_total_check on public.budget_monthly_snapshots;
create constraint trigger budget_monthly_snapshots_total_check
after insert or update or delete on public.budget_monthly_snapshots
deferrable initially deferred
for each row execute function public.ensure_budget_snapshot_total();

create or replace function public.ensure_transfer_completion_parent()
returns trigger
language plpgsql
as $$
declare
  parent public.transactions;
begin
  select * into parent from public.transactions where id = new.transaction_id;
  if parent.id is null or parent.type <> 'expense' or parent.ownership <> 'shared' then
    raise exception 'only shared expense transactions can be confirmed';
  end if;
  if not public.is_ledger_member(parent.ledger_id, new.confirmed_by_member_id) then
    raise exception 'confirmation member must belong to ledger history';
  end if;
  return new;
end;
$$;

drop trigger if exists transfer_checklist_completions_parent_check on public.transfer_checklist_completions;
create trigger transfer_checklist_completions_parent_check
before insert or update on public.transfer_checklist_completions
for each row execute function public.ensure_transfer_completion_parent();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.recurring_transaction_rules enable row level security;
alter table public.recurring_rule_splits enable row level security;
alter table public.budget_templates enable row level security;
alter table public.budget_monthly_snapshots enable row level security;
alter table public.category_migration_audit enable row level security;

drop policy if exists "authenticated users can read categories" on public.categories;
create policy "authenticated users can read categories"
on public.categories for select
to authenticated
using (true);

drop policy if exists "members can read transactions" on public.transactions;
create policy "members can read transactions"
on public.transactions for select
to authenticated
using (public.is_ledger_member(ledger_id, (select auth.uid())));

drop policy if exists "members can read transaction splits" on public.transaction_splits;
create policy "members can read transaction splits"
on public.transaction_splits for select
to authenticated
using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_splits.transaction_id
      and public.is_ledger_member(t.ledger_id, (select auth.uid()))
  )
);

drop policy if exists "members can read recurring transaction rules" on public.recurring_transaction_rules;
create policy "members can read recurring transaction rules"
on public.recurring_transaction_rules for select
to authenticated
using (public.is_ledger_member(ledger_id, (select auth.uid())));

drop policy if exists "members can read recurring rule splits" on public.recurring_rule_splits;
create policy "members can read recurring rule splits"
on public.recurring_rule_splits for select
to authenticated
using (
  exists (
    select 1 from public.recurring_transaction_rules r
    where r.id = recurring_rule_splits.rule_id
      and public.is_ledger_member(r.ledger_id, (select auth.uid()))
  )
);

drop policy if exists "members can read budget templates" on public.budget_templates;
create policy "members can read budget templates"
on public.budget_templates for select
to authenticated
using (public.is_ledger_member(ledger_id, (select auth.uid())));

drop policy if exists "members can read budget snapshots" on public.budget_monthly_snapshots;
create policy "members can read budget snapshots"
on public.budget_monthly_snapshots for select
to authenticated
using (public.is_ledger_member(ledger_id, (select auth.uid())));

drop policy if exists "category migration audit is admin only" on public.category_migration_audit;
create policy "category migration audit is admin only"
on public.category_migration_audit for all
to authenticated
using (false)
with check (false);

drop policy if exists "members can read transfer completions" on public.transfer_checklist_completions;
drop policy if exists "members can insert own transfer completion" on public.transfer_checklist_completions;
drop policy if exists "members can update own transfer completion" on public.transfer_checklist_completions;
drop policy if exists "members can delete own transfer completion" on public.transfer_checklist_completions;

create policy "members can read transfer completions"
on public.transfer_checklist_completions for select
to authenticated
using (
  exists (
    select 1 from public.transactions t
    where t.id = transfer_checklist_completions.transaction_id
      and public.is_ledger_member(t.ledger_id, (select auth.uid()))
  )
);

create policy "transfer completions are written through RPC"
on public.transfer_checklist_completions for all
to authenticated
using (false)
with check (false);

grant select on public.transactions to authenticated;
grant select on public.transaction_splits to authenticated;
grant select on public.recurring_transaction_rules to authenticated;
grant select on public.recurring_rule_splits to authenticated;
grant select on public.budget_templates to authenticated;
grant select on public.budget_monthly_snapshots to authenticated;

alter table public.transactions replica identity full;
alter table public.transaction_splits replica identity full;
alter table public.recurring_transaction_rules replica identity full;
alter table public.recurring_rule_splits replica identity full;
alter table public.budget_templates replica identity full;
alter table public.budget_monthly_snapshots replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'transactions',
      'transaction_splits',
      'recurring_transaction_rules',
      'recurring_rule_splits',
      'budget_templates',
      'budget_monthly_snapshots'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
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
  values (current_user_id, 'User')
  on conflict (id) do nothing;

  insert into public.ledgers (name, owner_id, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Shared Ledger'), current_user_id, current_user_id)
  returning * into created_ledger;

  insert into public.ledger_members (ledger_id, user_id, status, joined_at, left_at)
  values (created_ledger.id, current_user_id, 'active', now(), null);

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

  if public.active_ledger_member_count(target_ledger.id) >= 2
     and not public.is_ledger_member(target_ledger.id, current_user_id) then
    raise exception 'ledger already has MAX_LEDGER_MEMBERS = 2 active members';
  end if;

  insert into public.profiles (id, display_name)
  values (current_user_id, 'User')
  on conflict (id) do nothing;

  insert into public.ledger_members (ledger_id, user_id, status, joined_at, left_at)
  values (target_ledger.id, current_user_id, 'active', now(), null)
  on conflict (ledger_id, user_id) do update
  set status = 'active',
      joined_at = now(),
      left_at = null;

  return target_ledger;
end;
$$;

create or replace function public.transfer_ledger_ownership(p_ledger_id uuid, p_new_owner_id uuid)
returns public.ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  updated_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_ledger_owner(p_ledger_id, current_user_id) then
    raise exception 'only current ledger owner can transfer ownership';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, p_new_owner_id) then
    raise exception 'new owner must be an active ledger member';
  end if;

  update public.ledgers
  set owner_id = p_new_owner_id
  where id = p_ledger_id
  returning * into updated_ledger;

  return updated_ledger;
end;
$$;

create or replace function public.rotate_ledger_invite_code(p_ledger_id uuid)
returns public.ledgers
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_code text;
  updated_ledger public.ledgers;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_ledger_owner(p_ledger_id, current_user_id) then
    raise exception 'only ledger owner can rotate invite code';
  end if;

  loop
    next_code := public.generate_invite_code();
    exit when not exists (select 1 from public.ledgers where invite_code = next_code);
  end loop;

  update public.ledgers
  set invite_code = next_code
  where id = p_ledger_id
  returning * into updated_ledger;

  return updated_ledger;
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
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  update public.ledger_members
  set status = 'left',
      left_at = now()
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
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_ledger_owner(p_ledger_id, current_user_id) then
    raise exception 'only ledger owner can delete ledger';
  end if;

  delete from public.ledgers where id = p_ledger_id;
end;
$$;

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

  if saved_transaction.type = 'expense' then
    insert into public.expenses (
      id, ledger_id, amount_yen, category, category_id, subcategory,
      paid_by, recorded_by, ownership, spent_on, note, recurring_rule_id,
      recurring_month, created_at, updated_at
    )
    select
      saved_transaction.id,
      saved_transaction.ledger_id,
      saved_transaction.amount_yen,
      cp.top_level_display_name,
      cp.top_level_id,
      case when cp.parent_id is not null then cp.display_name else null end,
      saved_transaction.paid_by_member_id,
      saved_transaction.recorded_by_member_id,
      saved_transaction.ownership::public.expense_ownership,
      saved_transaction.occurred_on,
      saved_transaction.note,
      saved_transaction.recurring_rule_id,
      saved_transaction.recurring_month,
      saved_transaction.created_at,
      saved_transaction.updated_at
    from public.v_category_paths cp
    where cp.id = saved_transaction.category_id
      and cp.type = saved_transaction.type
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
    where expense_id = saved_transaction.id;

    insert into public.expense_splits (expense_id, user_id, amount_yen)
    select transaction_id, responsible_member_id, amount_yen
    from public.transaction_splits
    where transaction_id = saved_transaction.id;
  end if;

  return saved_transaction;
end;
$$;

create or replace function public.delete_transaction_offline(
  p_transaction_id uuid,
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
  target_transaction public.transactions;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into target_transaction
  from public.transactions
  where id = p_transaction_id
    and ledger_id = p_ledger_id;

  if target_transaction.id is null then
    return;
  end if;
  if not public.is_active_ledger_member(target_transaction.ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;
  if p_base_updated_at is not null and target_transaction.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.expenses where id = p_transaction_id;
  delete from public.transactions where id = p_transaction_id;
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
  saved_transaction public.transactions;
  saved_expense public.expenses;
  target_category_id text;
begin
  select coalesce(c.id, p_category_id, 'other')
  into target_category_id
  from (select 1) seed
  left join public.categories c
    on c.type = 'expense'
   and c.parent_id = coalesce(p_category_id, 'other')
   and lower(c.display_name) = lower(nullif(trim(coalesce(p_subcategory, '')), ''));

  saved_transaction := public.save_transaction_offline(
    p_expense_id,
    p_ledger_id,
    'expense',
    p_amount_yen,
    target_category_id,
    p_spent_on,
    p_note,
    p_paid_by,
    p_ownership::text::public.transaction_ownership,
    null,
    p_splits,
    p_base_updated_at
  );

  select * into saved_expense
  from public.expenses
  where id = saved_transaction.id;

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
begin
  perform public.delete_transaction_offline(p_expense_id, p_ledger_id, p_base_updated_at);
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
begin
  return public.save_expense_offline(
    coalesce(p_expense_id, gen_random_uuid()),
    p_ledger_id,
    p_amount_yen,
    p_category_id,
    p_category,
    p_subcategory,
    p_paid_by,
    p_ownership,
    p_spent_on,
    p_note,
    p_splits,
    null
  );
end;
$$;

create or replace function public.save_recurring_transaction_rule_offline(
  p_rule_id uuid,
  p_ledger_id uuid,
  p_type public.transaction_type,
  p_name text,
  p_amount_yen integer,
  p_category_id text,
  p_generate_day integer,
  p_start_month date,
  p_end_month date default null,
  p_timezone text default 'Asia/Tokyo',
  p_is_active boolean default true,
  p_paid_by_member_id uuid default null,
  p_ownership public.transaction_ownership default null,
  p_owned_by_member_id uuid default null,
  p_splits jsonb default '[]'::jsonb,
  p_base_updated_at timestamptz default null
)
returns public.recurring_transaction_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_rule public.recurring_transaction_rules;
  saved_rule public.recurring_transaction_rules;
  split_item jsonb;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_rule
  from public.recurring_transaction_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;

  if previous_rule.id is not null
     and p_base_updated_at is not null
     and previous_rule.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  if previous_rule.id is null then
    insert into public.recurring_transaction_rules (
      id, ledger_id, type, name, amount_yen, category_id, generate_day,
      start_month, end_month, timezone, is_active,
      paid_by_member_id, ownership, owned_by_member_id, created_by_member_id
    )
    values (
      p_rule_id, p_ledger_id, p_type, trim(p_name), p_amount_yen, trim(p_category_id), p_generate_day,
      p_start_month, p_end_month, coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'), coalesce(p_is_active, true),
      p_paid_by_member_id, p_ownership, p_owned_by_member_id, current_user_id
    )
    returning * into saved_rule;
  else
    update public.recurring_transaction_rules
    set type = p_type,
        name = trim(p_name),
        amount_yen = p_amount_yen,
        category_id = trim(p_category_id),
        generate_day = p_generate_day,
        start_month = p_start_month,
        end_month = p_end_month,
        timezone = coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'),
        is_active = coalesce(p_is_active, true),
        paid_by_member_id = p_paid_by_member_id,
        ownership = p_ownership,
        owned_by_member_id = p_owned_by_member_id
    where id = p_rule_id
      and ledger_id = p_ledger_id
    returning * into saved_rule;

    delete from public.recurring_rule_splits
    where rule_id = saved_rule.id;
  end if;

  if p_type = 'expense' and p_ownership = 'shared' then
    if jsonb_typeof(p_splits) <> 'array' then
      raise exception 'splits must be an array';
    end if;

    for split_item in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.recurring_rule_splits (rule_id, responsible_member_id, amount_yen)
      values (
        saved_rule.id,
        (split_item ->> 'responsible_member_id')::uuid,
        (split_item ->> 'amount_yen')::integer
      );
    end loop;
  end if;

  return saved_rule;
end;
$$;

create or replace function public.delete_recurring_transaction_rule_offline(
  p_rule_id uuid,
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
  target_rule public.recurring_transaction_rules;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into target_rule
  from public.recurring_transaction_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;

  if target_rule.id is null then
    return;
  end if;
  if not public.is_active_ledger_member(target_rule.ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;
  if p_base_updated_at is not null and target_rule.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.recurring_transaction_rules where id = p_rule_id;
end;
$$;

create or replace function public.save_recurring_expense_rule_offline(
  p_rule_id uuid,
  p_ledger_id uuid,
  p_name text,
  p_category_id text,
  p_subcategory text,
  p_amount_yen integer,
  p_paid_by uuid,
  p_ownership public.expense_ownership,
  p_split_ratio_a integer,
  p_split_ratio_b integer,
  p_split_amount_a integer,
  p_split_amount_b integer,
  p_generate_day integer,
  p_start_month date,
  p_end_month date default null,
  p_timezone text default 'Asia/Tokyo',
  p_is_active boolean default true,
  p_base_updated_at timestamptz default null
)
returns public.recurring_expense_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_rule public.recurring_transaction_rules;
  saved_legacy public.recurring_expense_rules;
  member_record record;
  splits jsonb := '[]'::jsonb;
  member_index integer := 0;
  target_category_id text;
begin
  select coalesce(c.id, p_category_id, 'other')
  into target_category_id
  from (select 1) seed
  left join public.categories c
    on c.type = 'expense'
   and c.parent_id = coalesce(p_category_id, 'other')
   and lower(c.display_name) = lower(nullif(trim(coalesce(p_subcategory, '')), ''));

  if p_ownership = 'shared' then
    for member_record in
      select user_id
      from public.ledger_members
      where ledger_id = p_ledger_id
        and status = 'active'
      order by joined_at, user_id
    loop
      member_index := member_index + 1;
      splits := splits || jsonb_build_array(jsonb_build_object(
        'responsible_member_id',
        member_record.user_id,
        'amount_yen',
        case
          when member_index = 1 then coalesce(p_split_amount_a, round(p_amount_yen * p_split_ratio_a / 100.0)::integer)
          when member_index = 2 then coalesce(p_split_amount_b, p_amount_yen - coalesce(p_split_amount_a, round(p_amount_yen * p_split_ratio_a / 100.0)::integer))
          else 0
        end
      ));
    end loop;
  end if;

  saved_rule := public.save_recurring_transaction_rule_offline(
    p_rule_id,
    p_ledger_id,
    'expense',
    p_name,
    p_amount_yen,
    target_category_id,
    p_generate_day,
    p_start_month,
    p_end_month,
    p_timezone,
    p_is_active,
    p_paid_by,
    p_ownership::text::public.transaction_ownership,
    null,
    splits,
    p_base_updated_at
  );

  insert into public.recurring_expense_rules (
    id, ledger_id, name, category_id, subcategory, amount_yen, paid_by,
    ownership, split_ratio_a, split_ratio_b, split_amount_a, split_amount_b,
    generate_day, start_month, end_month, timezone, is_active, created_by,
    created_at, updated_at
  )
  values (
    saved_rule.id, saved_rule.ledger_id, saved_rule.name, p_category_id,
    nullif(trim(coalesce(p_subcategory, '')), ''), saved_rule.amount_yen, p_paid_by,
    p_ownership, p_split_ratio_a, p_split_ratio_b, p_split_amount_a, p_split_amount_b,
    saved_rule.generate_day, saved_rule.start_month, saved_rule.end_month,
    saved_rule.timezone, saved_rule.is_active, saved_rule.created_by_member_id,
    saved_rule.created_at, saved_rule.updated_at
  )
  on conflict (id) do update
  set name = excluded.name,
      category_id = excluded.category_id,
      subcategory = excluded.subcategory,
      amount_yen = excluded.amount_yen,
      paid_by = excluded.paid_by,
      ownership = excluded.ownership,
      split_ratio_a = excluded.split_ratio_a,
      split_ratio_b = excluded.split_ratio_b,
      split_amount_a = excluded.split_amount_a,
      split_amount_b = excluded.split_amount_b,
      generate_day = excluded.generate_day,
      start_month = excluded.start_month,
      end_month = excluded.end_month,
      timezone = excluded.timezone,
      is_active = excluded.is_active
  returning * into saved_legacy;

  return saved_legacy;
end;
$$;

create or replace function public.delete_recurring_expense_rule_offline(
  p_rule_id uuid,
  p_ledger_id uuid,
  p_base_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_recurring_transaction_rule_offline(p_rule_id, p_ledger_id, p_base_updated_at);
  delete from public.recurring_expense_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;
end;
$$;

create or replace function public.last_day_of_month(p_month date)
returns date
language sql
immutable
as $$
  select (date_trunc('month', p_month)::date + interval '1 month - 1 day')::date;
$$;

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

      saved_transaction := null;
      month_cursor := (month_cursor + interval '1 month')::date;
    end loop;
  end loop;
end;
$$;

create or replace function public.generate_recurring_expenses(
  p_ledger_id uuid default null,
  p_until_month date default null
)
returns table (
  rule_id uuid,
  recurring_month date,
  expense_id uuid,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    generated.rule_id,
    generated.recurring_month,
    generated.transaction_id as expense_id,
    case
      when generated.status = 'created' then 'inserted'
      when generated.status = 'skipped' then 'exists'
      else generated.status
    end as status,
    generated.message
  from public.generate_recurring_transactions(p_ledger_id, p_until_month) generated;
end;
$$;

create or replace function public.save_budget_template_offline(
  p_template_id uuid,
  p_ledger_id uuid,
  p_member_id uuid,
  p_scope public.budget_scope,
  p_category_id text,
  p_amount_yen integer,
  p_base_updated_at timestamptz default null
)
returns public.budget_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_template public.budget_templates;
  saved_template public.budget_templates;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_template
  from public.budget_templates
  where id = p_template_id
    and ledger_id = p_ledger_id;

  if previous_template.id is not null
     and p_base_updated_at is not null
     and previous_template.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  insert into public.budget_templates (id, ledger_id, member_id, scope, category_id, amount_yen)
  values (p_template_id, p_ledger_id, p_member_id, p_scope, nullif(trim(coalesce(p_category_id, '')), ''), p_amount_yen)
  on conflict (id) do update
  set member_id = excluded.member_id,
      scope = excluded.scope,
      category_id = excluded.category_id,
      amount_yen = excluded.amount_yen
  returning * into saved_template;

  return saved_template;
end;
$$;

create or replace function public.save_budget_monthly_snapshot_offline(
  p_snapshot_id uuid,
  p_ledger_id uuid,
  p_member_id uuid,
  p_month date,
  p_scope public.budget_scope,
  p_category_id text,
  p_amount_yen integer,
  p_source public.budget_snapshot_source default 'manual_override',
  p_base_updated_at timestamptz default null
)
returns public.budget_monthly_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  previous_snapshot public.budget_monthly_snapshots;
  saved_snapshot public.budget_monthly_snapshots;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_snapshot
  from public.budget_monthly_snapshots
  where id = p_snapshot_id
    and ledger_id = p_ledger_id;

  if previous_snapshot.id is not null
     and p_base_updated_at is not null
     and previous_snapshot.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  insert into public.budget_monthly_snapshots (id, ledger_id, member_id, month, scope, category_id, amount_yen, source)
  values (
    p_snapshot_id, p_ledger_id, p_member_id, date_trunc('month', p_month)::date,
    p_scope, nullif(trim(coalesce(p_category_id, '')), ''), p_amount_yen, p_source
  )
  on conflict (id) do update
  set member_id = excluded.member_id,
      month = excluded.month,
      scope = excluded.scope,
      category_id = excluded.category_id,
      amount_yen = excluded.amount_yen,
      source = excluded.source
  returning * into saved_snapshot;

  return saved_snapshot;
end;
$$;

create or replace function public.ensure_budget_monthly_snapshots(p_ledger_id uuid, p_month date)
returns setof public.budget_monthly_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_month date := date_trunc('month', p_month)::date;
  template_record public.budget_templates;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  for template_record in
    select bt.*
    from public.budget_templates bt
    join public.ledger_members lm
      on lm.ledger_id = bt.ledger_id
     and lm.user_id = bt.member_id
     and lm.status = 'active'
    where bt.ledger_id = p_ledger_id
  loop
    insert into public.budget_monthly_snapshots (
      ledger_id, member_id, month, scope, category_id, amount_yen, source
    )
    values (
      template_record.ledger_id, template_record.member_id, target_month,
      template_record.scope, template_record.category_id, template_record.amount_yen, 'template'
    )
    on conflict do nothing;
  end loop;

  return query
  select *
  from public.budget_monthly_snapshots
  where ledger_id = p_ledger_id
    and month = target_month
  order by member_id, scope, category_id;
end;
$$;

drop function if exists public.get_open_transfer_items(uuid);

create function public.get_open_transfer_items(p_ledger_id uuid)
returns table (
  transaction_id uuid,
  expense_id uuid,
  ledger_id uuid,
  category text,
  category_id text,
  subcategory text,
  occurred_on date,
  spent_on date,
  transaction_created_at timestamptz,
  transaction_updated_at timestamptz,
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
  if current_user_id is not null and not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  return query
  select
    t.id,
    t.id,
    t.ledger_id,
    cp.top_level_display_name,
    t.category_id,
    case when cp.parent_id is not null then cp.display_name else null end,
    t.occurred_on,
    t.occurred_on,
    t.created_at,
    t.updated_at,
    t.created_at,
    t.updated_at,
    debtor_split.responsible_member_id,
    t.paid_by_member_id,
    debtor_split.amount_yen,
    payer_completion.completed_at,
    payee_completion.completed_at
  from public.transactions t
  left join public.v_category_paths cp on cp.id = t.category_id and cp.type = t.type
  join public.transaction_splits debtor_split
    on debtor_split.transaction_id = t.id
   and debtor_split.responsible_member_id <> t.paid_by_member_id
   and debtor_split.amount_yen > 0
  left join public.transfer_checklist_completions payer_completion
    on payer_completion.transaction_id = t.id
   and payer_completion.confirmed_by_member_id = debtor_split.responsible_member_id
  left join public.transfer_checklist_completions payee_completion
    on payee_completion.transaction_id = t.id
   and payee_completion.confirmed_by_member_id = t.paid_by_member_id
  where t.ledger_id = p_ledger_id
    and t.type = 'expense'
    and t.ownership = 'shared'
    and t.occurred_on <= current_date
    and (payer_completion.completed_at is null or payee_completion.completed_at is null)
  order by t.occurred_on asc, t.created_at asc;
end;
$$;

create or replace function public.set_transfer_confirmations(
  p_updates jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  update_row jsonb;
  target_transaction public.transactions;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'updates must be an array';
  end if;

  for update_row in select * from jsonb_array_elements(p_updates)
  loop
    select * into target_transaction
    from public.transactions
    where id = coalesce(update_row ->> 'transaction_id', update_row ->> 'expense_id')::uuid;

    if target_transaction.id is null then
      raise exception 'transaction not found';
    end if;
    if not public.is_active_ledger_member(target_transaction.ledger_id, current_user_id) then
      raise exception 'current user is not an active ledger member';
    end if;

    if coalesce((update_row ->> 'confirmed')::boolean, false) then
      insert into public.transfer_checklist_completions (transaction_id, confirmed_by_member_id)
      values (target_transaction.id, current_user_id)
      on conflict (transaction_id, confirmed_by_member_id) do update
      set completed_at = now();
    else
      delete from public.transfer_checklist_completions
      where transaction_id = target_transaction.id
        and confirmed_by_member_id = current_user_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.create_ledger(text) to authenticated;
grant execute on function public.join_ledger_by_invite(text) to authenticated;
grant execute on function public.transfer_ledger_ownership(uuid, uuid) to authenticated;
grant execute on function public.rotate_ledger_invite_code(uuid) to authenticated;
grant execute on function public.leave_ledger(uuid) to authenticated;
grant execute on function public.delete_ledger(uuid) to authenticated;
grant execute on function public.save_transaction_offline(uuid, uuid, public.transaction_type, integer, text, date, text, uuid, public.transaction_ownership, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_transaction_offline(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.save_recurring_transaction_rule_offline(uuid, uuid, public.transaction_type, text, integer, text, integer, date, date, text, boolean, uuid, public.transaction_ownership, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_recurring_transaction_rule_offline(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.generate_recurring_transactions(uuid, date) to authenticated;
grant execute on function public.save_budget_template_offline(uuid, uuid, uuid, public.budget_scope, text, integer, timestamptz) to authenticated;
grant execute on function public.save_budget_monthly_snapshot_offline(uuid, uuid, uuid, date, public.budget_scope, text, integer, public.budget_snapshot_source, timestamptz) to authenticated;
grant execute on function public.ensure_budget_monthly_snapshots(uuid, date) to authenticated;
grant execute on function public.get_open_transfer_items(uuid) to authenticated;
grant execute on function public.set_transfer_confirmations(jsonb) to authenticated;
