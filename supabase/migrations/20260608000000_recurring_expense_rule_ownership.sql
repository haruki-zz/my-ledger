alter table public.recurring_expense_rules
add column if not exists ownership public.expense_ownership not null default 'shared';

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
      coalesce(p_ownership, 'shared'),
      p_split_ratio_a,
      p_split_ratio_b,
      p_generate_day,
      p_start_month,
      p_end_month,
      coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'),
      coalesce(p_is_active, true),
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
        ownership = coalesce(p_ownership, 'shared'),
        split_ratio_a = p_split_ratio_a,
        split_ratio_b = p_split_ratio_b,
        generate_day = p_generate_day,
        start_month = p_start_month,
        end_month = p_end_month,
        timezone = coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'Asia/Tokyo'),
        is_active = coalesce(p_is_active, true)
    where id = p_rule_id
      and ledger_id = p_ledger_id
    returning * into saved_rule;
  end if;

  return saved_rule;
end;
$$;

create or replace function public.generate_recurring_expenses(
  p_ledger_id uuid default null,
  p_until_month date default date_trunc('month', now())::date
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
declare
  current_user_id uuid := auth.uid();
  normalized_until_month date := date_trunc('month', coalesce(p_until_month, now()::date))::date;
  rule_record public.recurring_expense_rules;
  month_to_generate date;
  last_month date;
  last_day integer;
  generated_spent_on date;
  member_a uuid;
  member_b uuid;
  split_a integer;
  inserted_expense_id uuid;
begin
  if current_user_id is not null and p_ledger_id is null then
    raise exception 'p_ledger_id is required for authenticated clients';
  end if;

  if p_ledger_id is not null
     and (current_user_id is null or not public.is_ledger_member(p_ledger_id, current_user_id)) then
    raise exception 'current user is not a ledger member';
  end if;

  for rule_record in
    select *
    from public.recurring_expense_rules
    where is_active = true
      and start_month <= normalized_until_month
      and (p_ledger_id is null or ledger_id = p_ledger_id)
      and (end_month is null or end_month >= start_month)
    order by ledger_id, start_month, id
  loop
    if not public.is_ledger_member(rule_record.ledger_id, rule_record.paid_by) then
      rule_id := rule_record.id;
      recurring_month := normalized_until_month;
      expense_id := null;
      status := 'skipped';
      message := 'paid_by is no longer a ledger member';
      return next;
      continue;
    end if;

    if rule_record.ownership = 'shared' then
      select lm.user_id
      into member_a
      from public.ledger_members lm
      where lm.ledger_id = rule_record.ledger_id
      order by lm.joined_at asc
      limit 1;

      select lm.user_id
      into member_b
      from public.ledger_members lm
      where lm.ledger_id = rule_record.ledger_id
      order by lm.joined_at asc
      offset 1
      limit 1;

      if member_a is null or member_b is null or public.ledger_member_count(rule_record.ledger_id) <> 2 then
        rule_id := rule_record.id;
        recurring_month := normalized_until_month;
        expense_id := null;
        status := 'skipped';
        message := 'shared recurring expenses require exactly two ledger members';
        return next;
        continue;
      end if;
    end if;

    month_to_generate := rule_record.start_month;
    last_month := least(normalized_until_month, coalesce(rule_record.end_month, normalized_until_month));

    while month_to_generate <= last_month loop
      begin
        last_day := extract(day from (month_to_generate + interval '1 month - 1 day'))::integer;
        generated_spent_on := month_to_generate + (least(rule_record.generate_day, last_day) - 1);
        split_a := round((rule_record.amount_yen * rule_record.split_ratio_a)::numeric / 100)::integer;
        inserted_expense_id := null;

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
          note,
          recurring_rule_id,
          recurring_month
        )
        values (
          rule_record.ledger_id,
          rule_record.amount_yen,
          public.primary_category_label(rule_record.category_id),
          rule_record.category_id,
          rule_record.subcategory,
          rule_record.paid_by,
          rule_record.created_by,
          rule_record.ownership,
          generated_spent_on,
          rule_record.name,
          rule_record.id,
          month_to_generate
        )
        on conflict (ledger_id, recurring_rule_id, recurring_month)
        where recurring_rule_id is not null
        do nothing
        returning id into inserted_expense_id;

        if inserted_expense_id is not null then
          if rule_record.ownership = 'shared' then
            insert into public.expense_splits (expense_id, user_id, amount_yen)
            values
              (inserted_expense_id, member_a, split_a),
              (inserted_expense_id, member_b, rule_record.amount_yen - split_a);
          end if;

          rule_id := rule_record.id;
          recurring_month := month_to_generate;
          expense_id := inserted_expense_id;
          status := 'inserted';
          message := null;
          return next;
        else
          rule_id := rule_record.id;
          recurring_month := month_to_generate;
          expense_id := null;
          status := 'exists';
          message := null;
          return next;
        end if;
      exception when others then
        rule_id := rule_record.id;
        recurring_month := month_to_generate;
        expense_id := null;
        status := 'error';
        message := sqlerrm;
        return next;
      end;

      month_to_generate := (month_to_generate + interval '1 month')::date;
    end loop;
  end loop;
end;
$$;

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
  date,
  date,
  text,
  boolean,
  timestamptz
) to authenticated;
