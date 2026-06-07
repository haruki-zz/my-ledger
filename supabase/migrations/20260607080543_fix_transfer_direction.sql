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
    debtor_split.user_id as payer_user_id,
    e.paid_by as payee_user_id,
    debtor_split.amount_yen,
    payer_completion.completed_at as payer_completed_at,
    payee_completion.completed_at as payee_completed_at
  from public.expenses e
  join public.expense_splits debtor_split
    on debtor_split.expense_id = e.id
   and debtor_split.user_id <> e.paid_by
   and debtor_split.amount_yen > 0
  left join public.transfer_checklist_completions payer_completion
    on payer_completion.expense_id = e.id
   and payer_completion.user_id = debtor_split.user_id
  left join public.transfer_checklist_completions payee_completion
    on payee_completion.expense_id = e.id
   and payee_completion.user_id = e.paid_by
  where e.ledger_id = p_ledger_id
    and e.ownership = 'shared'
    and (
      payer_completion.completed_at is null
      or payee_completion.completed_at is null
    )
  order by e.spent_on desc, e.created_at desc;
end;
$$;

grant execute on function public.get_open_transfer_items(uuid) to authenticated;

comment on function public.get_open_transfer_items(uuid)
is 'Returns open shared transfer items where payer_user_id is the debtor who should transfer and payee_user_id is the original paid_by recipient.';
