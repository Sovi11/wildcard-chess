-- Streak reminders: "your daily streak ends tonight". Applied 2026-11-24.
--
-- A player turns this on from the solved daily. One row per identity, the same
-- identity daily_solves uses (the account id when signed in, else the anonymous
-- device id). A row can carry a browser push address, an email opt-in, or both.
-- Email is only ever sent to a signed-in account that asked for it, and only if
-- a mail provider key has been put in app_secrets ('resend_key').
--
-- Sending: pg_cron calls the streak-remind edge function once a day at 15:30
-- UTC (9pm in India, 8.5 hours before the daily rolls over at 00:00 UTC). It
-- reminds whoever solved yesterday's puzzle, has not solved today's, and has a
-- streak of at least two days.

create table if not exists streak_reminders (
  me        text primary key,
  uid       uuid references auth.users on delete cascade,
  endpoint  text,
  p256dh    text,
  auth      text,
  email     boolean not null default false,
  created   timestamptz not null default now(),
  sent_day  integer not null default 0
);
alter table streak_reminders enable row level security;
revoke all on streak_reminders from anon, authenticated;

-- {on, push, email}
create or replace function hc_streak_remind(p_who text, p_sub json default null, p_email boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare
  me_ text := coalesce(auth.uid()::text, p_who);
  ep text := p_sub->>'endpoint';
  k1 text := p_sub->'keys'->>'p256dh';
  k2 text := p_sub->'keys'->>'auth';
  ok boolean;
  wants_mail boolean := coalesce(p_email, false) and auth.uid() is not null;
begin
  if me_ is null or length(me_) not between 6 and 64 then
    return json_build_object('on', false, 'push', false, 'email', false);
  end if;
  ok := ep is not null and length(ep) < 1000 and k1 is not null and k2 is not null and length(k1) < 200 and length(k2) < 100
    and ep ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/';
  if not ok and not wants_mail then                    -- nothing to remind with
    return json_build_object('on', false, 'push', false, 'email', false);
  end if;
  insert into streak_reminders (me, uid, endpoint, p256dh, auth, email)
  values (me_, auth.uid(), case when ok then ep end, case when ok then k1 end, case when ok then k2 end, wants_mail)
  on conflict (me) do update
    set uid = coalesce(excluded.uid, streak_reminders.uid),
        endpoint = coalesce(excluded.endpoint, streak_reminders.endpoint),
        p256dh = case when excluded.endpoint is not null then excluded.p256dh else streak_reminders.p256dh end,
        auth = case when excluded.endpoint is not null then excluded.auth else streak_reminders.auth end,
        email = excluded.email or streak_reminders.email;
  return (select json_build_object('on', true, 'push', r.endpoint is not null, 'email', r.email) from streak_reminders r where r.me = me_);
end $$;

create or replace function hc_streak_unremind(p_who text) returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from streak_reminders where me = coalesce(auth.uid()::text, p_who) or me = p_who;
  return json_build_object('on', false, 'push', false, 'email', false);
end $$;

-- who is due today: solved yesterday, not today, streak of two or more, not yet reminded
create or replace function hc_streak_due() returns table (me text, uid uuid, endpoint text, p256dh text, auth text, email boolean, streak integer)
language plpgsql stable security definer set search_path = public as $$
declare
  today integer := hc_daily_no();
  r record; n integer; d integer;
begin
  for r in
    select s.* from streak_reminders s
    where s.sent_day < today
      and exists (select 1 from daily_solves a where a.who = s.me and a.day = today - 1)
      and not exists (select 1 from daily_solves a where a.who = s.me and a.day = today)
  loop
    n := 0; d := today - 1;
    while exists (select 1 from daily_solves a where a.who = r.me and a.day = d) loop n := n + 1; d := d - 1; end loop;
    if n >= 2 then
      me := r.me; uid := r.uid; endpoint := r.endpoint; p256dh := r.p256dh; auth := r.auth; email := r.email; streak := n;
      return next;
    end if;
  end loop;
end $$;

revoke all on function hc_streak_remind(text, json, boolean) from public;
revoke all on function hc_streak_unremind(text) from public;
revoke all on function hc_streak_due() from public, anon, authenticated;
grant execute on function hc_streak_remind(text, json, boolean) to anon, authenticated;
grant execute on function hc_streak_unremind(text) to anon, authenticated;

select cron.unschedule('streak-remind') where exists (select 1 from cron.job where jobname = 'streak-remind');
select cron.schedule('streak-remind', '30 15 * * *', $cron$
  select net.http_post(
    url := 'https://ykmenwvniegyhxzxsvod.supabase.co/functions/v1/streak-remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from public.app_secrets where key = 'cron_key')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cron$);
