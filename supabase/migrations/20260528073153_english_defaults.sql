create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'User'
  );

  insert into public.profiles (id, display_name)
  values (new.id, candidate_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.seed_default_categories(p_ledger_id uuid)
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

  if not public.is_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not a ledger member';
  end if;

  insert into public.ledger_categories (ledger_id, category_name, split_ratio_a, split_ratio_b, sort_order)
  values
    (p_ledger_id, 'Food & Dining', 50, 50, 10),
    (p_ledger_id, 'Household', 50, 50, 20),
    (p_ledger_id, 'Transport', 50, 50, 30),
    (p_ledger_id, 'Rent', 50, 50, 40),
    (p_ledger_id, 'Utilities', 50, 50, 50),
    (p_ledger_id, 'Communications', 50, 50, 60),
    (p_ledger_id, 'Healthcare', 50, 50, 70),
    (p_ledger_id, 'Entertainment', 50, 50, 80),
    (p_ledger_id, 'Shopping', 50, 50, 90),
    (p_ledger_id, 'Travel', 50, 50, 100),
    (p_ledger_id, 'Other', 50, 50, 110)
  on conflict (ledger_id, category_name) do nothing;
end;
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

  insert into public.ledgers (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Shared Ledger'), current_user_id)
  returning * into created_ledger;

  insert into public.ledger_members (ledger_id, user_id)
  values (created_ledger.id, current_user_id);

  perform public.seed_default_categories(created_ledger.id);

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

  if public.ledger_member_count(target_ledger.id) >= 2
     and not public.is_ledger_member(target_ledger.id, current_user_id) then
    raise exception 'ledger already has two members';
  end if;

  insert into public.profiles (id, display_name)
  values (current_user_id, 'User')
  on conflict (id) do nothing;

  insert into public.ledger_members (ledger_id, user_id)
  values (target_ledger.id, current_user_id)
  on conflict do nothing;

  return target_ledger;
end;
$$;

grant execute on function public.seed_default_categories(uuid) to authenticated;
