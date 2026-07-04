create or replace function public.sync_budget_template_snapshots(p_template_id uuid)
returns setof public.budget_monthly_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_month date := date_trunc('month', now())::date;
  template_record public.budget_templates;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into template_record
  from public.budget_templates
  where id = p_template_id;

  if template_record.id is null then
    raise exception 'budget template not found';
  end if;
  if template_record.member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;
  if not public.is_active_ledger_member(template_record.ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  update public.budget_monthly_snapshots
  set amount_yen = template_record.amount_yen,
      updated_at = now()
  where ledger_id = template_record.ledger_id
    and member_id = template_record.member_id
    and month >= current_month
    and scope = template_record.scope
    and category_id is not distinct from template_record.category_id
    and source = 'template';

  return query
  select *
  from public.budget_monthly_snapshots
  where ledger_id = template_record.ledger_id
    and member_id = template_record.member_id
    and month >= current_month
    and scope = template_record.scope
    and category_id is not distinct from template_record.category_id
    and source = 'template'
  order by month, scope, category_id;
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
  if p_member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_template
  from public.budget_templates
  where id = p_template_id
    and ledger_id = p_ledger_id;

  if previous_template.id is not null
     and previous_template.member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;

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

  perform public.sync_budget_template_snapshots(saved_template.id);

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
  if p_member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into previous_snapshot
  from public.budget_monthly_snapshots
  where id = p_snapshot_id
    and ledger_id = p_ledger_id;

  if previous_snapshot.id is not null
     and previous_snapshot.member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;

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

create or replace function public.delete_budget_template_offline(
  p_template_id uuid,
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
  current_month date := date_trunc('month', now())::date;
  template_record public.budget_templates;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_active_ledger_member(p_ledger_id, current_user_id) then
    raise exception 'current user is not an active ledger member';
  end if;

  select * into template_record
  from public.budget_templates
  where id = p_template_id
    and ledger_id = p_ledger_id;

  if template_record.id is null then
    return;
  end if;
  if template_record.member_id <> current_user_id then
    raise exception 'budget member must be the current user';
  end if;
  if p_base_updated_at is not null
     and template_record.updated_at <> p_base_updated_at then
    raise sqlstate 'PT409' using message = 'sync_conflict: remote row changed';
  end if;

  delete from public.budget_monthly_snapshots
  where ledger_id = template_record.ledger_id
    and member_id = template_record.member_id
    and month >= current_month
    and scope = template_record.scope
    and category_id is not distinct from template_record.category_id
    and source = 'template';

  delete from public.budget_templates
  where id = template_record.id;
end;
$$;

grant execute on function public.sync_budget_template_snapshots(uuid) to authenticated;
grant execute on function public.delete_budget_template_offline(uuid, uuid, timestamptz) to authenticated;
