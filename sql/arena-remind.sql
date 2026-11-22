-- Arena registration: a player registers once and gets a browser notification
-- one hour before every Sunday Arena. Applied 2026-11-22.
--
-- One row per device (the anonymous device id), because a push subscription
-- belongs to a browser, not to an account. A row with no endpoint is a player
-- who registered where notifications are unavailable; they count, and use the
-- calendar link instead. Nothing is readable or writable directly.
--
-- Sending: pg_cron calls the arena-remind edge function at 13:30 UTC on
-- Sundays. The function is guarded by a key that lives only in app_secrets,
-- next to the VAPID key pair it generated for itself on first run. No secret
-- is in this repository.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;          -- no policies: service role only
revoke all on app_secrets from anon, authenticated;
insert into app_secrets (key, value) values ('cron_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table if not exists arena_reminders (
  who       text primary key,
  uid       uuid references auth.users on delete cascade,
  endpoint  text,
  p256dh    text,
  auth      text,
  created   timestamptz not null default now(),
  sent_week integer not null default 0
);
alter table arena_reminders enable row level security;
revoke all on arena_reminders from anon, authenticated;

-- {registered, push, count}
create or replace function hc_arena_register(p_who text, p_sub json default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  ep text := p_sub->>'endpoint';
  k1 text := p_sub->'keys'->>'p256dh';
  k2 text := p_sub->'keys'->>'auth';
  ok boolean;
begin
  if p_who is null or length(p_who) not between 6 and 64 then
    return json_build_object('registered', false, 'push', false, 'count', 0);
  end if;
  -- only real push services, so the sender can never be pointed anywhere else
  ok := ep is not null and length(ep) < 1000 and k1 is not null and k2 is not null and length(k1) < 200 and length(k2) < 100
    and ep ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/';
  insert into arena_reminders (who, uid, endpoint, p256dh, auth)
  values (p_who, auth.uid(), case when ok then ep end, case when ok then k1 end, case when ok then k2 end)
  on conflict (who) do update
    set uid = coalesce(excluded.uid, arena_reminders.uid),
        endpoint = coalesce(excluded.endpoint, arena_reminders.endpoint),
        p256dh = case when excluded.endpoint is not null then excluded.p256dh else arena_reminders.p256dh end,
        auth = case when excluded.endpoint is not null then excluded.auth else arena_reminders.auth end;
  return json_build_object('registered', true,
    'push', (select endpoint is not null from arena_reminders where who = p_who),
    'count', (select count(distinct coalesce(uid::text, who)) from arena_reminders));
end $$;

create or replace function hc_arena_unregister(p_who text) returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from arena_reminders where who = p_who;
  return json_build_object('registered', false, 'push', false,
    'count', (select count(distinct coalesce(uid::text, who)) from arena_reminders));
end $$;

-- standings, now with the registration count and whether this device is registered
create or replace function hc_arena_board(p_who text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  c  json := hc_arena_clock();
  w  integer := case when (c->>'live')::boolean then (c->>'week')::integer else (c->>'week')::integer - 1 end;
  me text := coalesce(auth.uid()::text, p_who);
begin
  return json_build_object(
    'live', (c->>'live')::boolean, 'next_week', (c->>'week')::integer, 'starts', c->'starts', 'ends', c->'ends',
    'week', w,
    'players', (select count(*) from arena_scores where week = w),
    'registered', (select count(distinct coalesce(uid::text, who)) from arena_reminders),
    'reg', (select json_build_object('push', r.endpoint is not null) from arena_reminders r where r.who = p_who),
    'rows', (select coalesce(json_agg(x), '[]'::json) from (
        select coalesce(nullif(p.name, ''), 'Guest') as name, a.pts, a.games, a.wins, (a.who = me) as you
        from arena_scores a left join profiles p on p.id = a.uid
        where a.week = w order by a.pts desc, a.games asc, a.last_at asc limit 10) x),
    'you', (select json_build_object('pts', y.pts, 'games', y.games, 'wins', y.wins,
              'rank', (select count(*) + 1 from arena_scores o where o.week = w and (o.pts > y.pts or (o.pts = y.pts and o.games < y.games))))
            from arena_scores y where y.week = w and y.who = me)
  );
end $$;

revoke all on function hc_arena_register(text, json) from public;
revoke all on function hc_arena_unregister(text) from public;
grant execute on function hc_arena_register(text, json) to anon, authenticated;
grant execute on function hc_arena_unregister(text) to anon, authenticated;

-- one hour before the arena, every Sunday
select cron.unschedule('arena-remind') where exists (select 1 from cron.job where jobname = 'arena-remind');
select cron.schedule('arena-remind', '30 13 * * 0', $cron$
  select net.http_post(
    url := 'https://ykmenwvniegyhxzxsvod.supabase.co/functions/v1/arena-remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from public.app_secrets where key = 'cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cron$);

-- event names (see events-policy.sql: the insert policy is an allowlist)
drop policy if exists "anon can log events" on public.events;
create policy "anon can log events" on public.events for insert to anon, authenticated
with check (name = any (array[
  'visit','enter','tutorial_start','tutorial_done','game_start','game_end','signup','signin',
  'game_leave','game_return','game_resume','first_move',
  'puzzle_start','puzzle_solved','puzzle_rated','feedback','skip_wait','support_click',
  'signup_prompt','signup_prompt_click','share','daily_start','daily_solved','arena_open','arena_game',
  'arena_register','intro'
]::text[]));
