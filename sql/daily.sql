-- The daily puzzle: one puzzle a day, the same for everyone, and a count of
-- who solved it. Applied 2026-11-21.
--
-- The day rolls over at 00:00 UTC and is numbered from launch (Daily #1 =
-- 2026-11-21). The server decides what "today" is, so a solve can only ever
-- land on the current day. One row per player per day: signed in, the player
-- is the account; signed out, the anonymous device id the site already keeps.
-- Nothing is readable or writable directly: both functions are security
-- definer and return only counts, times and public display names.

create table if not exists daily_solves (
  day    integer not null,
  who    text not null,
  uid    uuid references auth.users on delete cascade,
  ms     integer not null,
  clean  boolean not null,                 -- first try, no hint
  at     timestamptz not null default now(),
  primary key (day, who)
);
alter table daily_solves enable row level security;

create or replace function hc_daily_no() returns integer
language sql stable set search_path = public as $$
  select ((now() at time zone 'utc')::date - date '2026-11-21') + 1
$$;

create or replace function hc_daily_stats(p_who text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  d  integer := hc_daily_no();
  me text := coalesce(auth.uid()::text, p_who);
begin
  return (
    select json_build_object(
      'day', d,
      'solved', count(*),
      'clean', count(*) filter (where s.clean),
      'median_ms', coalesce(round(percentile_cont(0.5) within group (order by s.ms)), 0),
      'fastest', (select coalesce(json_agg(x), '[]'::json) from (
          select coalesce(nullif(p.name, ''), 'Guest') as name, f.ms
          from daily_solves f left join profiles p on p.id = f.uid
          where f.day = d and f.clean order by f.ms, f.at limit 5) x),
      'you', (select json_build_object('ms', y.ms, 'clean', y.clean,
                'rank', (select count(*) + 1 from daily_solves o where o.day = d and o.ms < y.ms))
              from daily_solves y where y.day = d and y.who = me)
    )
    from daily_solves s where s.day = d
  );
end $$;

create or replace function hc_daily_solve(p_who text, p_ms integer, p_clean boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  me text := coalesce(auth.uid()::text, p_who);
begin
  if me is not null and length(me) between 6 and 64 and p_ms is not null then
    insert into daily_solves (day, who, uid, ms, clean)
    values (hc_daily_no(), me, auth.uid(), greatest(1000, least(p_ms, 86400000)), coalesce(p_clean, false))
    on conflict (day, who) do nothing;                -- the first solve of the day is the one that counts
  end if;
  return hc_daily_stats(p_who);
end $$;

revoke all on function hc_daily_stats(text) from public;
revoke all on function hc_daily_solve(text, integer, boolean) from public;
grant execute on function hc_daily_no() to anon, authenticated;
grant execute on function hc_daily_stats(text) to anon, authenticated;
grant execute on function hc_daily_solve(text, integer, boolean) to anon, authenticated;

-- event names for the daily (see events-policy.sql: the insert policy is an allowlist)
drop policy if exists "anon can log events" on public.events;
create policy "anon can log events" on public.events for insert to anon, authenticated
with check (name = any (array[
  'visit','enter','tutorial_start','tutorial_done','game_start','game_end','signup','signin',
  'game_leave','game_return','game_resume','first_move',
  'puzzle_start','puzzle_solved','puzzle_rated','feedback','skip_wait','support_click',
  'signup_prompt','signup_prompt_click','share','daily_start','daily_solved'
]::text[]));
