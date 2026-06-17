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
declare
  current_user_id uuid := auth.uid();
  target_rule public.recurring_expense_rules;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_rule
  from public.recurring_expense_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;

  if target_rule.id is null then
    return;
  end if;

  if not public.is_ledger_member(target_rule.ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  if p_base_updated_at is not null
     and target_rule.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.recurring_expense_rules
  where id = p_rule_id
    and ledger_id = p_ledger_id;
end;
$$;

grant execute on function public.delete_recurring_expense_rule_offline(uuid, uuid, timestamptz) to authenticated;
