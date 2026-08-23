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

## 3. Turn on Google sign-in

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
