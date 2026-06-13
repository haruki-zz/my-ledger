revoke all on function public.save_recurring_expense_rule_offline(
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
) from public, anon;

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

revoke all on function public.generate_recurring_expenses(uuid, date) from public, anon;
grant execute on function public.generate_recurring_expenses(uuid, date) to authenticated;
