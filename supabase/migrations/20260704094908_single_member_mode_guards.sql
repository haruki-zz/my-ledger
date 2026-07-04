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
  values (coalesce(nullif(trim(p_name), ''), 'Ledger'), current_user_id, current_user_id)
  returning * into created_ledger;

  insert into public.ledger_members (ledger_id, user_id, status, joined_at, left_at)
  values (created_ledger.id, current_user_id, 'active', now(), null)
  on conflict (ledger_id, user_id) do update
  set status = 'active',
      joined_at = now(),
      left_at = null;

  perform public.seed_default_categories(created_ledger.id);

  return created_ledger;
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

  if coalesce(target_ledger.owner_id, target_ledger.created_by) = current_user_id then
    raise exception 'ledger owner must delete the ledger';
  end if;

  if exists (
    select 1
    from public.expenses e
    join public.expense_splits payer_split
      on payer_split.expense_id = e.id
     and payer_split.user_id <> e.paid_by
     and payer_split.amount_yen > 0
    left join public.transfer_checklist_completions payer_completion
      on payer_completion.expense_id = e.id
     and payer_completion.user_id = payer_split.user_id
    left join public.transfer_checklist_completions payee_completion
      on payee_completion.expense_id = e.id
     and payee_completion.user_id = e.paid_by
    where e.ledger_id = p_ledger_id
      and e.ownership = 'shared'
      and (payer_split.user_id = current_user_id or e.paid_by = current_user_id)
      and (
        payer_completion.expense_id is null
        or payee_completion.expense_id is null
      )
  ) then
    raise exception 'cannot leave ledger with open shared transfer confirmations';
  end if;

  delete from public.ledger_members
  where ledger_id = p_ledger_id
    and user_id = current_user_id;
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
  current_user_id uuid := auth.uid();
  previous_rule public.recurring_expense_rules;
  saved_rule public.recurring_expense_rules;
  normalized_category_id text := trim(p_category_id);
  normalized_ownership public.expense_ownership := coalesce(p_ownership, 'shared');
  normalized_split_amount_a integer;
  normalized_split_amount_b integer;
  next_is_active boolean := coalesce(p_is_active, true);
  member_count integer;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_rule_id is null then
    raise exception 'rule id is required';
  end if;

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if not public.is_ledger_member(p_ledger_id, p_paid_by) then
    raise exception 'paid_by must be a ledger member';
  end if;

  if not public.is_primary_category_id(normalized_category_id) then
    raise exception 'invalid category_id';
  end if;

  if p_amount_yen <= 0 then
    raise exception 'amount_yen must be positive';
  end if;

  if p_split_ratio_a < 0 or p_split_ratio_a > 100
     or p_split_ratio_b < 0 or p_split_ratio_b > 100
     or p_split_ratio_a + p_split_ratio_b <> 100 then
    raise exception 'split ratios must add up to 100';
  end if;

  if normalized_ownership = 'shared' then
    normalized_split_amount_a := p_split_amount_a;
    normalized_split_amount_b := p_split_amount_b;

    if normalized_split_amount_a is null or normalized_split_amount_b is null then
      raise exception 'split amounts are required for shared recurring expenses';
    end if;

    if normalized_split_amount_a < 0 or normalized_split_amount_b < 0 then
      raise exception 'split amounts must be non-negative';
    end if;

    if normalized_split_amount_a + normalized_split_amount_b <> p_amount_yen then
      raise exception 'split amounts must add up to amount_yen';
    end if;
  else
    normalized_split_amount_a := null;
    normalized_split_amount_b := null;
  end if;

  if p_generate_day < 1 or p_generate_day > 31 then
    raise exception 'generate_day must be between 1 and 31';
  end if;

  if p_start_month <> date_trunc('month', p_start_month)::date then
    raise exception 'start_month must be a month start date';
  end if;

  if p_end_month is not null and p_end_month <> date_trunc('month', p_end_month)::date then
    raise exception 'end_month must be a month start date';
  end if;

  if p_end_month is not null and p_end_month < p_start_month then
    raise exception 'end_month cannot be before start_month';
  end if;

  select *
  into previous_rule
  from public.recurring_expense_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;

  if previous_rule.id is not null
     and p_base_updated_at is not null
     and previous_rule.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  member_count := public.ledger_member_count(p_ledger_id);
  if normalized_ownership = 'shared' and member_count <> 2 then
    if previous_rule.id is null
       or previous_rule.ownership <> 'shared'
       or next_is_active
       or previous_rule.name <> trim(p_name)
       or previous_rule.category_id <> normalized_category_id
       or coalesce(previous_rule.subcategory, '') <> coalesce(nullif(trim(coalesce(p_subcategory, '')), ''), '')
       or previous_rule.amount_yen <> p_amount_yen
       or previous_rule.paid_by <> p_paid_by
       or previous_rule.split_ratio_a <> p_split_ratio_a
       or previous_rule.split_ratio_b <> p_split_ratio_b
       or coalesce(previous_rule.split_amount_a, -1) <> coalesce(normalized_split_amount_a, -1)
       or coalesce(previous_rule.split_amount_b, -1) <> coalesce(normalized_split_amount_b, -1)
       or previous_rule.generate_day <> p_generate_day
       or previous_rule.start_month <> p_start_month
       or coalesce(previous_rule.end_month, '0001-01-01'::date) <> coalesce(p_end_month, '0001-01-01'::date)
       or previous_rule.timezone <> coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo') then
      raise exception 'shared recurring expense requires two ledger members';
    end if;
  end if;

  if previous_rule.id is null then
    insert into public.recurring_expense_rules (
      id,
      ledger_id,
      name,
      category_id,
      subcategory,
      amount_yen,
      paid_by,
      ownership,
      split_ratio_a,
      split_ratio_b,
      split_amount_a,
      split_amount_b,
      generate_day,
      start_month,
      end_month,
      timezone,
      is_active,
      created_by
    )
    values (
      p_rule_id,
      p_ledger_id,
      trim(p_name),
      normalized_category_id,
      nullif(trim(coalesce(p_subcategory, '')), ''),
      p_amount_yen,
      p_paid_by,
      normalized_ownership,
      p_split_ratio_a,
      p_split_ratio_b,
      normalized_split_amount_a,
      normalized_split_amount_b,
      p_generate_day,
      p_start_month,
      p_end_month,
      coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'),
      next_is_active,
      current_user_id
    )
    returning * into saved_rule;
  else
    update public.recurring_expense_rules
    set name = trim(p_name),
        category_id = normalized_category_id,
        subcategory = nullif(trim(coalesce(p_subcategory, '')), ''),
        amount_yen = p_amount_yen,
        paid_by = p_paid_by,
        ownership = normalized_ownership,
        split_ratio_a = p_split_ratio_a,
        split_ratio_b = p_split_ratio_b,
        split_amount_a = normalized_split_amount_a,
        split_amount_b = normalized_split_amount_b,
        generate_day = p_generate_day,
        start_month = p_start_month,
        end_month = p_end_month,
        timezone = coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'),
        is_active = next_is_active
    where id = p_rule_id
      and ledger_id = p_ledger_id
    returning * into saved_rule;
  end if;

  return saved_rule;
end;
$$;

grant execute on function public.create_ledger(text) to authenticated;
grant execute on function public.leave_ledger(uuid) to authenticated;
grant execute on function public.save_recurring_expense_rule_offline(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  uuid,
  public.expense_ownership,
  integer,
  integer,
  integer,
  integer,
  integer,
  date,
  date,
  text,
  boolean,
  timestamptz
) to authenticated;
