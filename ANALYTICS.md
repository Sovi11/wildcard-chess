# Analytics

Two layers. Neither collects personal data.

1. **Cloudflare Web Analytics** — traffic: visitors, pageviews, referrers,
   countries, devices. Cookie-free. (Add the beacon snippet to `index.html`.)
2. **Supabase events** (`js/stats.js`) — product behaviour that hosting stats
   cannot see: who starts a game, who finishes one, guest vs signed-in, and
   whether players actually use the board mechanic.

## One-time setup

Run this once in the Supabase [SQL editor](https://supabase.com/dashboard/project/ykmenwvniegyhxzxsvod/sql):

```sql
create table if not exists events (
  id      bigserial primary key,
  name    text        not null,
  props   jsonb       not null default '{}'::jsonb,
  session text,
  at      timestamptz not null default now()
);

alter table events enable row level security;

-- Visitors may only APPEND, and only known event names. They can never read
-- the table back, so nobody can scrape your numbers with the public key.
drop policy if exists "anon can log events" on events;
create policy "anon can log events" on events
  for insert to anon
  with check (name in (
    'visit','enter','tutorial_start','tutorial_done',
    'game_start','game_end','signup','signin'
  ));

create index if not exists events_at_idx   on events (at desc);
create index if not exists events_name_idx on events (name);
```

## The events

| Event | When | Useful props |
|---|---|---|
| `visit` | every page load | `ref` (referring domain), `mobile`, `pwa`, `w` |
| `enter` | welcome screen choice | `as: 'guest'` |
| `tutorial_start` / `tutorial_done` | walkthrough opened / finished | — |
| `game_start` | any game begins | `mode` (ranked/hotseat/online/link), `opponent`, `signedIn` |
| `game_end` | game finishes (once) | `result`, `reason`, `plies`, `boardMoves`, `vsBot`, `rated`, `signedIn` |
| `signup` / `signin` | account created / returning login | — |

`boardMoves` is the one that matters most for design: it counts terrain moves
per game. If it trends toward zero, players are ignoring the entire premise.

Localhost is excluded, so development never pollutes the numbers.

## Reading the numbers

Paste into the SQL editor. **The dashboard overview:**

```sql
select
  count(*) filter (where name = 'visit')                         as visits,
  count(distinct session) filter (where name = 'visit')          as unique_visitors,
  count(*) filter (where name = 'game_start')                    as games_started,
  count(*) filter (where name = 'game_end')                      as games_finished,
  count(*) filter (where name = 'signup')                        as signups,
  count(*) filter (where name = 'enter' and props->>'as' = 'guest') as chose_guest,
  count(*) filter (where name = 'tutorial_done')                 as tutorial_completed
from events
where at > now() - interval '30 days';
```

**Where is traffic coming from** (did Reddit work?):

```sql
select props->>'ref' as source, count(distinct session) as visitors
from events where name = 'visit' and at > now() - interval '7 days'
group by 1 order by 2 desc;
```

**Do people actually play?** (the conversion that matters):

```sql
select
  count(distinct session) filter (where name = 'visit')      as visited,
  count(distinct session) filter (where name = 'game_start') as played,
  round(100.0 * count(distinct session) filter (where name = 'game_start')
        / nullif(count(distinct session) filter (where name = 'visit'), 0), 1) as pct
from events where at > now() - interval '30 days';
```

**Is the core mechanic being used?**

```sql
select
  round(avg((props->>'boardMoves')::int), 1) as avg_board_moves_per_game,
  round(avg((props->>'plies')::int), 1)      as avg_plies,
  count(*) filter (where (props->>'boardMoves')::int = 0) as games_with_zero
from events where name = 'game_end' and at > now() - interval '30 days';
```

**Daily trend:**

```sql
select date_trunc('day', at)::date as day,
       count(distinct session) filter (where name = 'visit')  as visitors,
       count(*) filter (where name = 'game_start')            as games
from events where at > now() - interval '30 days'
group by 1 order by 1 desc;
```

## Housekeeping

Anyone with the public key could append junk rows (the policy limits them to
known event names, but not volume). At this scale that is a non-issue; if it
ever happens, delete the offending window:

```sql
delete from events where at > 'YYYY-MM-DD' and session = '<offender>';
```

## Letting Claude read the stats

`events` is unreadable with the public key by design. To let a session pull
numbers without handing over any secret key, install the read-only aggregate
function in [`sql/stats-function.sql`](sql/stats-function.sql) — change the
passphrase inside it first, then run it in the SQL editor.

It is `security definer` (so it can read the table), returns **aggregates
only** — never a raw row — and has no write path. Calling it:

```bash
curl -s -X POST \
  "https://ykmenwvniegyhxzxsvod.supabase.co/rest/v1/rpc/hc_stats" \
  -H "apikey: <publishable key>" \
  -H "Authorization: Bearer <publishable key>" \
  -H "Content-Type: application/json" \
  -d '{"pass":"<your passphrase>","days":30}'
```

To revoke access later:

```sql
drop function if exists hc_stats(text, int);
```
