-- Event names the site may log anonymously. The policy is an allowlist, so a
-- new WCSTATS.track('name') does NOTHING until its name is added here: the
-- insert is rejected silently (stats.js swallows errors by design). Applied
-- 2026-11-12; before that game_leave, first_move, puzzle_* etc. never landed.
drop policy if exists "anon can log events" on public.events;
create policy "anon can log events" on public.events for insert to anon, authenticated
with check (name = any (array[
  'visit','enter','tutorial_start','tutorial_done','game_start','game_end','signup','signin',
  'game_leave','game_return','game_resume','first_move',
  'puzzle_start','puzzle_solved','puzzle_rated','feedback','skip_wait','support_click'
]::text[]));
