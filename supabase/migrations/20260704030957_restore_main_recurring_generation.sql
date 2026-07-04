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
  split_b integer;
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
        split_a := coalesce(
          rule_record.split_amount_a,
          round((rule_record.amount_yen * rule_record.split_ratio_a)::numeric / 100)::integer
        );
        split_b := coalesce(rule_record.split_amount_b, rule_record.amount_yen - split_a);
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
        on conflict do nothing
        returning id into inserted_expense_id;

        if inserted_expense_id is not null then
          if rule_record.ownership = 'shared' then
            insert into public.expense_splits (expense_id, user_id, amount_yen)
            values
              (inserted_expense_id, member_a, split_a),
              (inserted_expense_id, member_b, split_b);
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

grant execute on function public.generate_recurring_expenses(uuid, date) to authenticated;
