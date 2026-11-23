-- The 'signup_gate' event: a guest reached something that asks for an account
-- (game review after the first, kept history, a name on the boards, a streak
-- on every device). Applied 2026-11-23; 'badge' (a badge was earned) added 2026-11-24. The insert policy is an allowlist.
drop policy if exists "anon can log events" on public.events;
create policy "anon can log events" on public.events for insert to anon, authenticated
with check (name = any (array[
  'visit','enter','tutorial_start','tutorial_done','game_start','game_end','signup','signin',
  'game_leave','game_return','game_resume','first_move',
  'puzzle_start','puzzle_solved','puzzle_rated','feedback','skip_wait','support_click',
  'signup_prompt','signup_prompt_click','share','daily_start','daily_solved','arena_open','arena_game',
  'arena_register','intro','signup_gate','badge'
]::text[]));
