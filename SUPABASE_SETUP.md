# Turning on accounts, cloud ratings and real matchmaking

The game works with none of this. Skip it and you get local ratings, peer-to-peer
matchmaking and no sign-in. Do it and you get Google sign-in, a rating that follows you
between devices, a global leaderboard, and a matchmaking queue that still works when two
players queue an hour apart.

Even with Supabase on, **no moves go through the server**. The queue only introduces two
players by exchanging a PeerJS id; the game itself still runs browser-to-browser.

Budget about 15 minutes.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) (free tier is plenty).
2. **New project** → pick a name and a region near you → wait for it to provision.
3. Go to **Project Settings → API** and copy:
   - **Project URL** (`https://xxxxxxxx.supabase.co`)
   - the **anon** / **publishable** key

> Copy the **anon** key, never the `service_role` key. The anon key is meant to sit in a
> browser — Row Level Security below is what actually protects the data. The service_role
> key bypasses every policy and must never leave a server.

## 2. Create the tables

**SQL Editor → New query**, paste this, hit run:

```sql
-- who you are and how you are rated
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default 'Anonymous',
  elo         integer not null default 500,
  wins        integer not null default 0,
  losses      integer not null default 0,
  draws       integer not null default 0,
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- anyone may read the leaderboard; you may only write your own row
create policy "profiles are public"      on profiles for select using (true);
create policy "insert own profile"       on profiles for insert with check (auth.uid() = id);
create policy "update own profile"       on profiles for update using (auth.uid() = id);

-- players currently looking for a game
create table if not exists queue (
  id          uuid primary key references auth.users on delete cascade,
  elo         integer not null,
  peer_id     text not null,
  created_at  timestamptz not null default now()
);

alter table queue enable row level security;

create policy "queue is readable"        on queue for select using (true);
create policy "manage own queue row"     on queue for all    using (auth.uid() = id)
                                                             with check (auth.uid() = id);

create index if not exists queue_elo_idx on queue (elo, created_at desc);
```

## 3. Turn on Google sign-in *(optional — email already works)*

Supabase enables **email** sign-in by default, and the game detects that: with no Google
provider configured the button reads **Sign in with email** and sends a passwordless login
link. That is fully functional, so you can skip this section entirely and come back to it.

Add Google when you want one-tap sign-in instead of an email round trip.


1. In Supabase: **Authentication → Providers → Google**, toggle it on. Leave the page open,
   you need the **Callback URL** it shows you.
2. In [Google Cloud Console](https://console.cloud.google.com): create a project →
   **APIs & Services → Credentials → Create credentials → OAuth client ID** → type
   **Web application**.
3. Under **Authorised redirect URIs**, paste the callback URL from step 1.
4. Copy the **Client ID** and **Client secret** back into the Supabase Google provider, save.
5. In Supabase: **Authentication → URL Configuration**, set **Site URL** to
   `https://sovi11.github.io/wildcard-chess/` and add the same value under
   **Redirect URLs**. Add `http://localhost:5180` too if you want sign-in to work locally.

## 4. Paste your keys in

Edit `js/config.js`:

```js
window.WCCONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseKey: 'eyJhbGciOi...',
};
```

Commit and push. That is it.

---

## What changes once it is on

| | Off (default) | On |
|---|---|---|
| Rating | local storage, per browser | follows your account anywhere |
| Leaderboard | you plus the bot pool | every real player |
| Matchmaking | both must queue inside ~10s | queue persists for two minutes |
| Sign-in | none | Google |
| Moves | peer-to-peer | still peer-to-peer |

## If something misbehaves

**Sign-in bounces back signed out** — the Site URL or Redirect URLs in Supabase do not match
where the page is actually served from. They must match exactly, scheme included.

**Rating does not save** — open the console. `[cloud] saveProfile: ...` means the RLS
policies did not apply; re-run the SQL in step 2.

**Never matched with anyone** — expected while you are the only player. Open the site in a
second browser, sign in with a different Google account, and queue on both.

**Everything still local** — `js/config.js` is empty, or the Supabase library failed to
load. The console says which.

## 5. Onboarding columns (added later)

The post-sign-in onboarding stores date of birth and chess familiarity. Run this
once in the SQL editor (Dashboard → SQL) — until then the client silently skips
these fields and everything else keeps working:

```sql
alter table profiles add column if not exists dob date;
alter table profiles add column if not exists chess_level text;
alter table profiles add column if not exists puzzles jsonb;   -- solved puzzles + streaks
```

`puzzles` carries puzzle-mode progress (which puzzles are solved, current and
best streak) so it follows the account between devices. Without the column the
game still works; progress just stays on the device, exactly like the rating
does when signed out.

## 6. Puzzle ratings

Run [`sql/puzzles.sql`](sql/puzzles.sql) once in the SQL editor. It adds
`profiles.puzzle_rating`, a `puzzles` table (one rating per puzzle, calibrated
from attempts) and `puzzle_attempts`, plus the `hc_puzzle_attempt` function
that does the Elo maths server-side — the public key can report an attempt but
never write a rating. Only a player's *first* attempt at a puzzle is rated, so
nothing can be farmed. Signed-out players get a local rating against the
puzzles' seed ratings, and the cloud rating takes over when they sign in.

## 7. Game history

Run [`sql/games.sql`](sql/games.sql) once. Every finished game (the full
action list the review replays, plus result, reason and rating change) is then
saved against the account, and merged back into the past-games list on any
device you sign in from. Without the table, history stays in localStorage —
last 40 games, this browser only.

## 8. In-game feedback

The ⌨ Feedback button in the header writes here. Run once in the SQL editor:

```sql
create table if not exists feedback (
  id      bigserial primary key,
  kind    text not null,
  body    text not null,
  contact text,
  context jsonb not null default '{}'::jsonb,
  at      timestamptz not null default now()
);

alter table feedback enable row level security;

-- Anyone may SEND feedback; nobody may read it back with the public key.
drop policy if exists "anyone can send feedback" on feedback;
create policy "anyone can send feedback" on feedback
  for insert to anon
  with check (
    length(body) between 4 and 1200
    and kind in ('fun','bug','confusing','idea','other')
  );

create index if not exists feedback_at_idx on feedback (at desc);
```

Read what comes in:

```sql
select at, kind, body, contact, context->>'elo' as elo, context->>'screen' as screen
from feedback order by at desc limit 50;
```
