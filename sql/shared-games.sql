-- v92: short game links. hollowchess.com/#r=<id> looks the game up here.
-- No direct table access: both functions are security definer and validate input.
create table if not exists public.shared_games (
  id text primary key,
  code text not null check (length(code) between 3 and 3200 and code ~ '^[A-Za-z0-9_-]+$'),
  at timestamptz not null default now()
);
alter table public.shared_games enable row level security;

create or replace function public.hc_share_game(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id text;
begin
  if p_code is null or length(p_code) < 3 or length(p_code) > 3200 or p_code !~ '^[A-Za-z0-9_-]+$' then return null; end if;
  v_id := substr(translate(encode(digest(p_code, 'sha256'), 'base64'), '+/=', 'xyz'), 1, 8);
  insert into shared_games (id, code) values (v_id, p_code) on conflict (id) do nothing;
  return v_id;
end $$;

create or replace function public.hc_shared_game(p_id text) returns text
language sql stable security definer set search_path = public as $$
  select code from shared_games where id = p_id;
$$;

revoke all on function public.hc_share_game(text) from public;
revoke all on function public.hc_shared_game(text) from public;
grant execute on function public.hc_share_game(text) to anon, authenticated;
grant execute on function public.hc_shared_game(text) to anon, authenticated;
