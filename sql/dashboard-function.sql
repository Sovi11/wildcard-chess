-- Read-only data for the traffic dashboard at hollowchess.com/dashboard.html.
--
-- Same shape of deal as hc_stats: security definer so it can read `events`,
-- returns only aggregates, never a raw row. It does not hold a passphrase of
-- its own: it calls hc_stats(pass, 1) first, which raises 'denied' on a wrong
-- one, so there is exactly one secret to rotate (in stats-function.sql).
--
-- Days are cut in India time, so "today" on the dashboard is your today.

create or replace function hc_dashboard(pass text, days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  tz      constant text := 'Asia/Kolkata';
  d       int := greatest(1, least(coalesce(days, 30), 365));
  today   date := (now() at time zone tz)::date;
  start_d date := today - (d - 1);
  prev_d  date := start_d - d;
  result  json;
begin
  perform hc_stats(pass, 1);            -- raises 'denied' unless the passphrase is right

  with ev as (
    select name, session, props, (at at time zone tz)::date as day
    from events
    where at >= (prev_d::timestamp at time zone tz)
  ),
  cur as (select * from ev where day >= start_d),
  prv as (select * from ev where day < start_d),
  series as (
    select g::date as day,
      (select count(distinct session) from cur where cur.day = g::date and name = 'visit')      as visitors,
      (select count(distinct session) from cur where cur.day = g::date and name = 'game_start') as players,
      (select count(*) from cur where cur.day = g::date and name = 'game_start')                as games_started,
      (select count(*) from cur where cur.day = g::date and name = 'game_end')                  as games_finished,
      (select count(*) from cur where cur.day = g::date and name in ('signup'))                 as signups
    from generate_series(start_d, today, interval '1 day') g
  ),
  tot as (
    select
      count(distinct session) filter (where name = 'visit')          as visitors,
      count(distinct session) filter (where name = 'enter')          as entered,
      count(distinct session) filter (where name = 'tutorial_done')  as tutorial_done,
      count(distinct session) filter (where name = 'game_start')     as players,
      count(distinct session) filter (where name = 'game_end')       as finishers,
      count(*) filter (where name = 'game_start')                    as games_started,
      count(*) filter (where name = 'game_end')                      as games_finished,
      count(*) filter (where name = 'signup')                        as signups,
      count(distinct session) filter (where name = 'puzzle_start')   as puzzle_sessions,
      count(*) filter (where name = 'puzzle_solved')                 as puzzles_solved
    from cur
  ),
  ptot as (
    select
      count(distinct session) filter (where name = 'visit')      as visitors,
      count(distinct session) filter (where name = 'game_start') as players,
      count(*) filter (where name = 'game_start')                as games_started,
      count(*) filter (where name = 'game_end')                  as games_finished,
      count(*) filter (where name = 'signup')                    as signups
    from prv
  ),
  second_game as (
    select count(*) filter (where c >= 2) as sessions_2plus, count(*) as sessions_any
    from (select session, count(*) c from cur where name = 'game_start' group by session) t
  ),
  refs as (
    select coalesce(nullif(props->>'ref', ''), 'direct') as source, count(distinct session) as visitors
    from cur where name = 'visit' group by 1 order by 2 desc limit 8
  ),
  plats as (
    select coalesce(props->>'platform', 'web') as platform, count(distinct session) as visitors
    from cur where name = 'visit' group by 1 order by 2 desc
  ),
  devs as (
    select
      count(distinct props->>'dev')                                             as devices,
      count(distinct props->>'dev') filter (where (props->>'day')::int >= 1)    as returning
    from cur where name = 'visit' and props ? 'dev'
  )
  select json_build_object(
    'generated_at', now(),
    'days', d, 'from', start_d, 'to', today, 'timezone', tz,
    'accounts', (select count(*) from profiles),
    'totals', (select row_to_json(tot) from tot),
    'previous', (select row_to_json(ptot) from ptot),
    'second_game', (select row_to_json(second_game) from second_game),
    'devices', (select row_to_json(devs) from devs),
    'daily', (select json_agg(row_to_json(series) order by day) from series),
    'referrers', (select coalesce(json_agg(row_to_json(refs)), '[]'::json) from refs),
    'platforms', (select coalesce(json_agg(row_to_json(plats)), '[]'::json) from plats)
  ) into result;
  return result;
end;
$$;

revoke all on function hc_dashboard(text, int) from public;
grant execute on function hc_dashboard(text, int) to anon, authenticated;
