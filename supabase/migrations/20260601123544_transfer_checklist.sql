create table public.transfer_checklist_completions (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (expense_id, user_id)
);

create index transfer_checklist_completions_user_id_idx
on public.transfer_checklist_completions(user_id);

alter table public.transfer_checklist_completions enable row level security;

create policy "members can read transfer checklist completions"
on public.transfer_checklist_completions for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = transfer_checklist_completions.expense_id
      and public.is_ledger_member(e.ledger_id, auth.uid())
  )
);

create policy "clients cannot insert transfer checklist completions directly"
on public.transfer_checklist_completions for insert
to authenticated
with check (false);

create policy "clients cannot update transfer checklist completions directly"
on public.transfer_checklist_completions for update
to authenticated
using (false)
with check (false);

create policy "clients cannot delete transfer checklist completions directly"
on public.transfer_checklist_completions for delete
to authenticated
using (false);

grant select on table public.transfer_checklist_completions to authenticated;

create or replace function public.get_open_transfer_items(p_ledger_id uuid)
returns table (
  expense_id uuid,
  ledger_id uuid,
  category text,
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
    e.category,
    e.spent_on,
    e.created_at as expense_created_at,
    e.updated_at as expense_updated_at,
    payer_split.user_id as payer_user_id,
    e.paid_by as payee_user_id,
    payer_split.amount_yen,
    payer_completion.completed_at as payer_completed_at,
    payee_completion.completed_at as payee_completed_at
  from public.expenses e
  join public.expense_splits payer_split
    -- Ledgers are currently constrained to two members; this intentionally yields one
    -- transfer row per shared expense under that product constraint.
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
    and (
      payer_completion.expense_id is null
      or payee_completion.expense_id is null
    )
  order by e.spent_on desc, e.created_at desc;
end;
$$;

create or replace function public.set_transfer_confirmations(p_updates jsonb)
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

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'updates must be an array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    where update_row.expense_id is null
       or update_row.confirmed is null
  ) then
    raise exception 'each update must include expense_id and confirmed';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  ) <> (
    select count(distinct update_row.expense_id)
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  ) then
    raise exception 'duplicate expense updates are not allowed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    left join public.expenses e on e.id = update_row.expense_id
    where e.id is null
  ) then
    raise exception 'expense not found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    join public.expenses e on e.id = update_row.expense_id
    where not public.is_ledger_member(e.ledger_id, current_user_id)
  ) then
    raise exception 'current user is not a ledger member';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    join public.expenses e on e.id = update_row.expense_id
    where e.ownership <> 'shared'
  ) then
    raise exception 'only shared expenses can be confirmed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    join public.expenses e on e.id = update_row.expense_id
    where e.paid_by <> current_user_id
      and not exists (
        select 1
        from public.expense_splits s
        where s.expense_id = e.id
          and s.user_id = current_user_id
          and s.user_id <> e.paid_by
          and s.amount_yen > 0
      )
  ) then
    raise exception 'current user is not part of this transfer';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
    join public.expenses e on e.id = update_row.expense_id
    where not exists (
      select 1
      from public.expense_splits s
      where s.expense_id = e.id
        and s.user_id <> e.paid_by
        and s.amount_yen > 0
    )
  ) then
    raise exception 'expense does not have a transfer item';
  end if;

  insert into public.transfer_checklist_completions (expense_id, user_id)
  select update_row.expense_id, current_user_id
  from jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  where update_row.confirmed
  on conflict (expense_id, user_id) do update
  set completed_at = now();

  delete from public.transfer_checklist_completions completion
  using jsonb_to_recordset(p_updates) as update_row(expense_id uuid, confirmed boolean)
  where completion.expense_id = update_row.expense_id
    and completion.user_id = current_user_id
    and not update_row.confirmed;
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
  previous_expense public.expenses;
  previous_splits jsonb := '{}'::jsonb;
  saved_expense public.expenses;
  saved_splits jsonb := '{}'::jsonb;
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
    into previous_expense
    from public.expenses
    where id = p_expense_id
      and ledger_id = p_ledger_id;

    if previous_expense.id is null then
      raise exception 'expense not found';
    end if;

    select coalesce(
      jsonb_object_agg(user_id::text, amount_yen),
      '{}'::jsonb
    )
    into previous_splits
    from public.expense_splits
    where expense_id = previous_expense.id;

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

  if p_expense_id is not null then
    select coalesce(
      jsonb_object_agg(user_id::text, amount_yen),
      '{}'::jsonb
    )
    into saved_splits
    from public.expense_splits
    where expense_id = saved_expense.id;

    if previous_expense.amount_yen <> saved_expense.amount_yen
       or previous_expense.paid_by <> saved_expense.paid_by
       or previous_expense.ownership <> saved_expense.ownership
       or previous_splits <> saved_splits then
      delete from public.transfer_checklist_completions
      where expense_id = saved_expense.id;
    end if;
  end if;

  return saved_expense;
end;
$$;

grant execute on function public.get_open_transfer_items(uuid) to authenticated;
grant execute on function public.set_transfer_confirmations(jsonb) to authenticated;

alter table public.transfer_checklist_completions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'transfer_checklist_completions'
     ) then
    execute 'alter publication supabase_realtime add table public.transfer_checklist_completions';
  end if;
end $$;
