-- All raw data stays private. Public callers can submit only validated behavioral events.
create table public.pnu_events (
  id uuid primary key,
  session_id uuid not null,
  campaign text not null check(campaign = 'pnu-halloween-2026'),
  event_name text not null check(event_name in ('page_view','program_view','ticket_view','checkout_start','demo_complete','button_click')),
  button_id text check(length(button_id) <= 60),
  utm_source text not null default '' check(length(utm_source)<=80),
  utm_medium text not null default '' check(length(utm_medium)<=80),
  utm_campaign text not null default '' check(length(utm_campaign)<=80),
  created_at timestamptz not null default clock_timestamp()
);
create index pnu_events_campaign_time_idx on public.pnu_events(campaign,created_at);
create index pnu_events_session_time_idx on public.pnu_events(session_id,created_at);
alter table public.pnu_events enable row level security;
revoke all on public.pnu_events from anon, authenticated;

-- Populate ONLY from a payment-provider webhook after checking its signature,
-- payment status, amount, currency, and server-owned order/session mapping.
create table public.pnu_purchases (
  id uuid primary key default gen_random_uuid(),
  provider_payment_id text not null unique,
  session_id uuid not null,
  amount_krw integer not null check(amount_krw > 0),
  paid_at timestamptz not null default now()
);
create index pnu_purchases_session_idx on public.pnu_purchases(session_id,paid_at);
alter table public.pnu_purchases enable row level security;
revoke all on public.pnu_purchases from anon, authenticated;
grant all on public.pnu_events,public.pnu_purchases to service_role;

create function public.pnu_collect(batch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(batch) <> 'array' or jsonb_array_length(batch)>30 then
    raise exception 'Invalid batch';
  end if;
  for item in select value from jsonb_array_elements(batch) loop
    if item->>'event_name' = 'button_click' and coalesce(item->>'button_id','') not in
      ('nav_program','nav_ticket','hero_ticket','hero_program','ticket_apply','checkout_demo') then
      raise exception 'Invalid button';
    end if;
    insert into public.pnu_events(id,session_id,campaign,event_name,button_id,utm_source,utm_medium,utm_campaign)
    values ((item->>'id')::uuid,(item->>'session_id')::uuid,item->>'campaign',item->>'event_name',
      case when item->>'event_name'='button_click' then item->>'button_id' else null end,
      coalesce(item->>'utm_source',''),coalesce(item->>'utm_medium',''),coalesce(item->>'utm_campaign',''))
    on conflict(id) do nothing;
  end loop;
end;
$$;
revoke all on function public.pnu_collect(jsonb) from public,anon,authenticated;
grant execute on function public.pnu_collect(jsonb) to anon,authenticated;

create function public.pnu_dashboard(date_from timestamptz,date_to timestamptz,source_filter text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'pnu_admin','false') <> 'true' then
    raise exception '운영자 권한이 필요합니다.' using errcode='42501';
  end if;
  if date_from is null or date_to is null or date_from>date_to or date_to-date_from > interval '366 days' then
    raise exception '조회 기간은 최대 366일입니다.';
  end if;
  with events as materialized (
    select * from public.pnu_events where campaign='pnu-halloween-2026' and created_at between date_from and date_to
  ), visits as (
    select distinct on(session_id) session_id,created_at,coalesce(nullif(utm_source,''),'direct') as source
    from events where event_name='page_view' order by session_id,created_at
  ), cohort as (
    select * from visits where source_filter is null or source=source_filter
  ), funnel as (
    select c.*,t.ts as ticket_at,ch.ts as checkout_at,d.ts as demo_at
    from cohort c
    left join lateral(select min(created_at) ts from events e where e.session_id=c.session_id and e.event_name='ticket_view' and e.created_at>=c.created_at)t on true
    left join lateral(select min(created_at) ts from events e where e.session_id=c.session_id and e.event_name='checkout_start' and e.created_at>=t.ts)ch on true
    left join lateral(select min(created_at) ts from events e where e.session_id=c.session_id and e.event_name='demo_complete' and e.created_at>=ch.ts)d on true
  ), purchases as (
    select p.* from public.pnu_purchases p join cohort c using(session_id)
    where p.paid_at between date_from and date_to and p.paid_at>=c.created_at
  ), clicks as (
    select e.button_id,count(*) as clicks,count(distinct e.session_id) as sessions
    from events e join cohort c using(session_id) where e.event_name='button_click' group by e.button_id order by count(*) desc
  ), sources as (
    select c.source,count(distinct c.session_id) as sessions,count(distinct p.id) as purchases
    from cohort c left join purchases p using(session_id) group by c.source order by count(distinct c.session_id) desc
  ) select jsonb_build_object(
    'sessions',(select count(*) from funnel),'ticket',(select count(ticket_at) from funnel),
    'checkout',(select count(checkout_at) from funnel),'demo',(select count(demo_at) from funnel),
    'purchases',(select count(*) from purchases),'buyers',(select count(distinct session_id) from purchases),'revenue',(select coalesce(sum(amount_krw),0) from purchases),
    'clicks',coalesce((select jsonb_agg(to_jsonb(clicks)) from clicks),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(sources)) from sources),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.pnu_dashboard(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.pnu_dashboard(timestamptz,timestamptz,text) to authenticated;
