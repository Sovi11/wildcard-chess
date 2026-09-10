-- Hollow Chess: every migration the live site (v60) expects but the database is missing,
-- generated 2026-09-10 from SUPABASE_SETUP.md + sql/*.sql. Safe to run more than once.
-- Paste the whole file into Supabase -> SQL editor -> Run.

-- 1. onboarding columns (profiles.chess_level is what stops the onboarding form re-asking)
alter table profiles add column if not exists dob date;
alter table profiles add column if not exists chess_level text;
alter table profiles add column if not exists puzzles jsonb;

-- 2. game history (v59)
-- Game history for Hollow Chess. Run once in the Supabase SQL editor.
--
-- Until this exists, a player's past games (the move lists the review replays)
-- live only in their browser's localStorage, capped at 40. This keeps every
-- finished game against the account so the history follows them between
-- devices and survives a cleared cache. Nothing here is public: you can only
-- read and write your own rows.

create table if not exists games (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  at         bigint not null,                    -- ms epoch from the client; doubles as the sync key
  opponent   text,
  bot        text,                               -- ladder bot id, if any
  you_color  text,
  score      numeric,                            -- 1 win, 0.5 draw, 0 loss
  reason     text,                               -- checkmate, resignation, stalemate, fifty…
  plies      integer,
  rated      boolean not null default false,
  elo_before integer,
  elo_after  integer,
  acts       jsonb not null,                     -- every action, replayable from the start position
  unique (user_id, at)
);
alter table games enable row level security;
create policy "read own games"   on games for select using (auth.uid() = user_id);
drop policy if exists "insert own games" on games;
create policy "insert own games" on games for insert with check (auth.uid() = user_id);
create index if not exists games_user_at on games (user_id, at desc);

-- 3. puzzle ratings (v58)
-- Puzzle ratings for Hollow Chess. Run once in the Supabase SQL editor.
--
-- Two ratings play each other, chess.com-style: the player has a puzzle
-- rating, every puzzle has one, and each FIRST attempt is an Elo game between
-- them. Solve it clean (no wrong move, no hint) and you take points off the
-- puzzle; fail and it takes points off you. Puzzle ratings start from a seed
-- computed offline (depth, how many legal actions were on the board) and then
-- drift toward the truth as people attempt them — difficulty is measured, not
-- guessed.
--
-- All the maths runs in hc_puzzle_attempt (security definer) so the public
-- key can never write a rating directly; it can only report an attempt.

alter table profiles add column if not exists puzzle_rating integer not null default 1000;

create table if not exists puzzles (
  id          text primary key,
  rating      integer not null,
  attempts    integer not null default 0,     -- first attempts only: calibration data
  solves      integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table puzzles enable row level security;
drop policy if exists "puzzle ratings are public" on puzzles;
create policy "puzzle ratings are public" on puzzles for select using (true);
-- no insert/update policies: writes happen only inside the function below

create table if not exists puzzle_attempts (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  puzzle_id  text not null,
  solved     boolean not null,
  clean      boolean not null,               -- no wrong move
  hinted     boolean not null default false,
  ms         integer,
  at         timestamptz not null default now()
);
alter table puzzle_attempts enable row level security;
drop policy if exists "read own attempts" on puzzle_attempts;
create policy "read own attempts" on puzzle_attempts for select using (auth.uid() = user_id);
create index if not exists puzzle_attempts_user_puzzle on puzzle_attempts (user_id, puzzle_id);

-- Record an attempt. Rates only the FIRST attempt per (user, puzzle), so a
-- puzzle cannot be farmed; later attempts are logged but do not move anything.
create or replace function hc_puzzle_attempt(
  p_puzzle text, p_seed int, p_solved boolean, p_clean boolean,
  p_hinted boolean default false, p_ms int default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  first      boolean;
  score      numeric;
  r_player   integer;
  r_puzzle   integer;
  expected   numeric;
  d_player   integer;
  d_puzzle   integer;
begin
  if uid is null then raise exception 'sign in to record puzzle attempts'; end if;

  select not exists (select 1 from puzzle_attempts where user_id = uid and puzzle_id = p_puzzle) into first;
  insert into puzzle_attempts (user_id, puzzle_id, solved, clean, hinted, ms)
    values (uid, p_puzzle, p_solved, p_clean, coalesce(p_hinted, false), p_ms);

  -- the puzzle row is created on first contact, at its offline seed
  insert into puzzles (id, rating) values (p_puzzle, greatest(400, least(2400, coalesce(p_seed, 1000))))
    on conflict (id) do nothing;

  select puzzle_rating into r_player from profiles where id = uid;
  if r_player is null then
    -- a profile row may not exist yet (never played a rated game); make one
    insert into profiles (id) values (uid) on conflict (id) do nothing;
    r_player := 1000;
  end if;
  select rating into r_puzzle from puzzles where id = p_puzzle;

  if not first then
    return json_build_object('rated', false, 'player_rating', r_player, 'puzzle_rating', r_puzzle, 'delta', 0);
  end if;

  score    := case when p_solved and p_clean and not coalesce(p_hinted, false) then 1 else 0 end;
  expected := 1.0 / (1.0 + power(10.0, (r_puzzle - r_player) / 400.0));
  d_player := round(32 * (score - expected));     -- K=32: a player's rating should move
  d_puzzle := round(16 * (expected - score));     -- K=16: a puzzle's should settle

  update profiles set puzzle_rating = greatest(100, r_player + d_player) where id = uid;
  update puzzles set rating = greatest(100, r_puzzle + d_puzzle),
                     attempts = attempts + 1, solves = solves + (score::int),
                     updated_at = now()
    where id = p_puzzle;

  return json_build_object('rated', true,
    'player_rating', greatest(100, r_player + d_player),
    'puzzle_rating', greatest(100, r_puzzle + d_puzzle),
    'delta', d_player);
end;
$$;

revoke all on function hc_puzzle_attempt(text, int, boolean, boolean, boolean, int) from public;
grant execute on function hc_puzzle_attempt(text, int, boolean, boolean, boolean, int) to authenticated;

-- 4. analytics summary function
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

