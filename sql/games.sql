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
create policy "insert own games" on games for insert with check (auth.uid() = user_id);
create index if not exists games_user_at on games (user_id, at desc);
