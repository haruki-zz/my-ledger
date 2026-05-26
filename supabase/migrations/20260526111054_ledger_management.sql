alter table public.ledger_members
drop constraint if exists ledger_members_ledger_id_fkey;

alter table public.ledger_members
add constraint ledger_members_ledger_id_fkey
foreign key (ledger_id)
references public.ledgers(id)
on delete cascade;

alter table public.expenses
drop constraint if exists expenses_ledger_id_fkey;

alter table public.expenses
add constraint expenses_ledger_id_fkey
foreign key (ledger_id)
references public.ledgers(id)
on delete cascade;

alter table public.ledger_categories
drop constraint if exists ledger_categories_ledger_id_fkey;

alter table public.ledger_categories
add constraint ledger_categories_ledger_id_fkey
foreign key (ledger_id)
references public.ledgers(id)
on delete cascade;

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

  if target_ledger.created_by = current_user_id then
    raise exception 'ledger owner must delete the ledger';
  end if;

  delete from public.ledger_members
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

  if target_ledger.created_by <> current_user_id then
    raise exception 'only the ledger owner can delete the ledger';
  end if;

  delete from public.ledgers
  where id = p_ledger_id;
end;
$$;

grant execute on function public.leave_ledger(uuid) to authenticated;
grant execute on function public.delete_ledger(uuid) to authenticated;
