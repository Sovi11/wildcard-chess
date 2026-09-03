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
