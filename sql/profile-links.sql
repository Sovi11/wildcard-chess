-- v91: a player may link their chess.com and Lichess usernames to their profile.
alter table public.profiles add column if not exists chesscom text check (chesscom is null or chesscom ~ '^[A-Za-z0-9_-]{2,30}$');
alter table public.profiles add column if not exists lichess  text check (lichess  is null or lichess  ~ '^[A-Za-z0-9_-]{2,30}$');
