// Sends the "arena starts in 1 hour" browser notification to every registered
// device. Called by pg_cron on Sundays at 13:30 UTC (see sql/arena-remind.sql).
//
// Guarded by a key held only in the app_secrets table, so verify_jwt is off.
// The VAPID key pair is generated here on first run and kept in the same
// table; the public half is the one in js/main.js (ARENA_VAPID).
//
// Body: {}            the weekly run; does nothing unless an arena starts within 90 minutes
//       {init: true}  make sure the VAPID keys exist, return the public one
//       {test: who}   send a test notification to one device id

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function secret(key: string): Promise<string | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

Deno.serve(async (req: Request) => {
  const key = await secret("cron_key");
  if (!key || req.headers.get("x-cron-key") !== key) return json({ error: "forbidden" }, 403);
  let body: { init?: boolean; test?: string } = {};
  try { body = await req.json(); } catch (_e) { /* empty body */ }

  let pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await db.from("app_secrets").upsert([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }]);
    pub = k.publicKey; priv = k.privateKey;
  }
  if (body.init) return json({ vapid_public: pub });
  webpush.setVapidDetails("mailto:hollowchess11@gmail.com", pub, priv);

  const { data: clock, error } = await db.rpc("hc_arena_clock");
  if (error || !clock) return json({ error: "no clock" }, 500);
  const mins = Math.round((new Date(clock.starts).getTime() - Date.now()) / 60000);
  const test = typeof body.test === "string" ? body.test : null;
  if (!test && (clock.live || mins < 0 || mins > 90)) return json({ skipped: true, mins });

  let q = db.from("arena_reminders").select("who,endpoint,p256dh,auth").not("endpoint", "is", null);
  q = test ? q.eq("who", test) : q.lt("sent_week", clock.week);
  const { data: rows } = await q.limit(5000);

  const payload = JSON.stringify({
    title: test ? "Hollow Chess: test reminder" : "Arena starts in " + (mins >= 50 ? "1 hour" : mins + " minutes"),
    body: test ? "This is what the reminder looks like. The real one arrives 1 hour before the arena."
               : "One hour of ranked games on a board that moves. Win 2, draw 1, most points wins. Tap to open.",
    url: "/#arena",
    tag: "arena-" + clock.week,
  });

  const sent: string[] = [], gone: string[] = [];
  let failed = 0;
  const list = rows ?? [];
  for (let i = 0; i < list.length; i += 25) {
    await Promise.all(list.slice(i, i + 25).map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent.push(r.who);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(r.who); else failed++;
      }
    }));
  }
  if (!test && sent.length) await db.from("arena_reminders").update({ sent_week: clock.week }).in("who", sent);
  // a subscription the push service no longer knows: keep the registration, drop the dead endpoint
  if (gone.length) await db.from("arena_reminders").update({ endpoint: null, p256dh: null, auth: null }).in("who", gone);
  return json({ sent: sent.length, gone: gone.length, failed, mins });
});
