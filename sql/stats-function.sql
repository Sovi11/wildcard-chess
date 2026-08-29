-- Read-only stats endpoint for Hollow Chess.
--
-- Why this exists: the `events` table is (correctly) unreadable with the public
-- key, so nobody can scrape your numbers. This function is the one exception —
-- it runs as its owner (security definer), so it can read the table, but it
-- returns ONLY aggregate counts, never a single raw row. It cannot write, and
-- it exposes nothing identifying.
--
-- Gated by a passphrase so the public key alone is not enough to read it.
-- CHANGE 'pick-a-passphrase' BELOW before running.

create or replace function hc_stats(pass text, days int default 30)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - (days || ' days')::interval;
  result json;
begin
  if pass is distinct from 'pick-a-passphrase' then
    raise exception 'denied';
  end if;

  select json_build_object(
    'window_days', days,
    'accounts', (select count(*) from profiles),
    'visits',           count(*) filter (where name = 'visit'),
    'unique_visitors',  count(distinct session) filter (where name = 'visit'),
    'chose_guest',      count(*) filter (where name = 'enter' and props->>'as' = 'guest'),
    'tutorial_started', count(*) filter (where name = 'tutorial_start'),
    'tutorial_done',    count(*) filter (where name = 'tutorial_done'),
    'games_started',    count(*) filter (where name = 'game_start'),
    'games_finished',   count(*) filter (where name = 'game_end'),
    'signups',          count(*) filter (where name = 'signup'),
    'signins',          count(*) filter (where name = 'signin'),
    'players',          count(distinct session) filter (where name = 'game_start'),
    'play_rate_pct', round(
      100.0 * count(distinct session) filter (where name = 'game_start')
      / nullif(count(distinct session) filter (where name = 'visit'), 0), 1),
    'avg_board_moves', (
      select round(avg((props->>'boardMoves')::numeric), 2)
      from events where name = 'game_end' and at > since),
    'avg_plies', (
      select round(avg((props->>'plies')::numeric), 1)
      from events where name = 'game_end' and at > since),
    'top_referrers', (
      select coalesce(json_agg(r), '[]'::json) from (
        select props->>'ref' as source, count(distinct session) as visitors
        from events where name = 'visit' and at > since
        group by 1 order by 2 desc limit 8) r),
    'daily', (
      select coalesce(json_agg(d), '[]'::json) from (
        select date_trunc('day', at)::date as day,
               count(distinct session) filter (where name = 'visit') as visitors,
               count(*) filter (where name = 'game_start') as games
        from events where at > since group by 1 order by 1 desc limit 14) d)
  ) into result
  from events where at > since;

  return result;
end;
$$;

-- Only the passphrase-holder can call it, and only to read.
revoke all on function hc_stats(text, int) from public;
grant execute on function hc_stats(text, int) to anon;
