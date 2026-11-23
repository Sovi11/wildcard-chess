// Tells a player their daily streak ends tonight. Called by pg_cron once a day
// at 15:30 UTC (see sql/streak-remind.sql), 8.5 hours before the daily rolls over.
//
// Who: hc_streak_due() — asked for reminders, solved yesterday, not yet today,
// streak of two or more, not already reminded today.
// How: a browser notification where the row has a push address; an email where
// a signed-in account opted in AND a mail key ('resend_key') is in app_secrets.
// Without that key the email part quietly does nothing.
//
// Guarded by the cron key held only in app_secrets, so verify_jwt is off.
// Body: {}            the daily run
//       {test: me}    send one test reminder to that identity, whatever its streak

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
type Row = { me: string; uid: string | null; endpoint: string | null; p256dh: string | null; auth: string | null; email: boolean; streak: number };

Deno.serve(async (req: Request) => {
  const key = await secret("cron_key");
  if (!key || req.headers.get("x-cron-key") !== key) return json({ error: "forbidden" }, 403);
  let body: { test?: string } = {};
  try { body = await req.json(); } catch (_e) { /* empty body */ }
  const test = typeof body.test === "string" ? body.test : null;

  const pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (pub && priv) webpush.setVapidDetails("mailto:hollowchess11@gmail.com", pub, priv);
  const mailKey = await secret("resend_key");
  const mailFrom = (await secret("mail_from")) || "Hollow Chess <daily@hollowchess.com>";

  const { data: day } = await db.rpc("hc_daily_no");
  let rows: Row[] = [];
  if (test) {
    const { data } = await db.from("streak_reminders").select("me,uid,endpoint,p256dh,auth,email").eq("me", test).limit(1);
    rows = (data ?? []).map((r) => ({ ...r, streak: 3 })) as Row[];
  } else {
    const { data, error } = await db.rpc("hc_streak_due");
    if (error) return json({ error: error.message }, 500);
    rows = (data ?? []) as Row[];
  }

  // hours left until the daily changes at 00:00 UTC
  const now = new Date();
  const left = Math.max(1, Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 3600000));
  const hours = left === 1 ? "1 hour" : left + " hours";

  const done: string[] = [], gone: string[] = [];
  let pushed = 0, mailed = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (r) => {
      let reached = false;
      const title = "Your " + r.streak + "-day streak ends in " + hours;
      if (r.endpoint && pub && priv) {
        try {
          await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh!, auth: r.auth! } },
            JSON.stringify({ title, body: "Today's puzzle is still unsolved. One mate keeps the streak alive. Tap to open.", url: "/#daily", tag: "streak-" + day }),
            { TTL: left * 3600, urgency: "high" });
          pushed++; reached = true;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(r.me); else failed++;
        }
      }
      if (r.email && r.uid && mailKey) {
        try {
          const { data: u } = await db.auth.admin.getUserById(r.uid);
          const to = u?.user?.email;
          if (to) {
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: "Bearer " + mailKey, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: mailFrom, to: [to], subject: title,
                text: "Today's Hollow Chess daily is still unsolved, and your " + r.streak + "-day streak ends in " + hours + ".\n\n" +
                  "Solve it here: https://hollowchess.com/#daily\n\n" +
                  "You asked for this reminder on hollowchess.com. To stop it, open the daily puzzle and choose \"Turn off reminders\".",
              }),
            });
            if (res.ok) { mailed++; reached = true; } else failed++;
          }
        } catch (_e) { failed++; }
      }
      if (reached) done.push(r.me);
    }));
  }
  if (!test && done.length) await db.from("streak_reminders").update({ sent_day: day }).in("me", done);
  if (gone.length) await db.from("streak_reminders").update({ endpoint: null, p256dh: null, auth: null }).in("me", gone);
  return json({ due: rows.length, pushed, mailed, failed, gone: gone.length, mail_ready: !!mailKey });
});
