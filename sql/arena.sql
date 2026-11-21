-- The Sunday Arena: one hour a week, everyone plays ranked games, most points
-- wins. Applied 2026-11-21.
--
-- Window: Sundays 14:30-15:30 UTC (8-9pm IST). Arena #1 is 2026-11-22.
-- A win is 2 points, a draw 1. The server's clock decides whether the arena
-- is open, so a result can only ever land inside the hour. One row per player
-- per week: the account when signed in, the anonymous device id otherwise.
-- Nothing is readable or writable directly; the functions return only names,
-- points and game counts.

create table if not exists arena_scores (
  week    integer not null,
  who     text not null,
  uid     uuid references auth.users on delete cascade,
  pts     integer not null default 0,
  games   integer not null default 0,
  wins    integer not null default 0,
  last_at timestamptz not null default now(),
  primary key (week, who)
);
alter table arena_scores enable row level security;

-- {live, week, starts, ends}: week is the arena that is open, or the next one
create or replace function hc_arena_clock() returns json
language plpgsql stable set search_path = public as $$
declare
  t0 timestamptz := timestamptz '2026-11-22 14:30:00+00';
  k  integer := floor(extract(epoch from (now() - t0)) / 604800);
  s  timestamptz;
begin
  if k >= 0 and now() < t0 + make_interval(days => 7 * k) + interval '1 hour' then
    s := t0 + make_interval(days => 7 * k);
    return json_build_object('live', true, 'week', k + 1, 'starts', s, 'ends', s + interval '1 hour');
  end if;
  s := t0 + make_interval(days => 7 * (k + 1));
  return json_build_object('live', false, 'week', k + 2, 'starts', s, 'ends', s + interval '1 hour');
end $$;

-- standings: the open arena, or the last one played when none is open
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
    'rows', (select coalesce(json_agg(x), '[]'::json) from (
        select coalesce(nullif(p.name, ''), 'Guest') as name, a.pts, a.games, a.wins, (a.who = me) as you
        from arena_scores a left join profiles p on p.id = a.uid
        where a.week = w order by a.pts desc, a.games asc, a.last_at asc limit 10) x),
    'you', (select json_build_object('pts', y.pts, 'games', y.games, 'wins', y.wins,
              'rank', (select count(*) + 1 from arena_scores o where o.week = w and (o.pts > y.pts or (o.pts = y.pts and o.games < y.games))))
            from arena_scores y where y.week = w and y.who = me)
  );
end $$;

-- report one finished game: p_score is 1 (win), 0.5 (draw) or 0 (loss)
create or replace function hc_arena_report(p_who text, p_score numeric) returns json
language plpgsql security definer set search_path = public as $$
declare
  c   json := hc_arena_clock();
  me  text := coalesce(auth.uid()::text, p_who);
  add integer := case when p_score >= 1 then 2 when p_score > 0 then 1 else 0 end;
begin
  if (c->>'live')::boolean and me is not null and length(me) between 6 and 64 and p_score is not null then
    insert into arena_scores (week, who, uid, pts, games, wins)
    values ((c->>'week')::integer, me, auth.uid(), add, 1, case when add = 2 then 1 else 0 end)
    on conflict (week, who) do update
      set pts = arena_scores.pts + excluded.pts, games = arena_scores.games + 1,
          wins = arena_scores.wins + excluded.wins, last_at = now(),
          uid = coalesce(arena_scores.uid, excluded.uid)
      where arena_scores.last_at < now() - interval '40 seconds';   -- no game is that short
  end if;
  return hc_arena_board(p_who);
end $$;

revoke all on function hc_arena_board(text) from public;
revoke all on function hc_arena_report(text, numeric) from public;
grant execute on function hc_arena_clock() to anon, authenticated;
grant execute on function hc_arena_board(text) to anon, authenticated;
grant execute on function hc_arena_report(text, numeric) to anon, authenticated;

-- event names (see events-policy.sql: the insert policy is an allowlist)
drop policy if exists "anon can log events" on public.events;
create policy "anon can log events" on public.events for insert to anon, authenticated
with check (name = any (array[
  'visit','enter','tutorial_start','tutorial_done','game_start','game_end','signup','signin',
  'game_leave','game_return','game_resume','first_move',
  'puzzle_start','puzzle_solved','puzzle_rated','feedback','skip_wait','support_click',
  'signup_prompt','signup_prompt_click','share','daily_start','daily_solved','arena_open','arena_game'
]::text[]));
