// delete-account — a signed-in player permanently deletes their own account.
// Required by Google Play and the App Store for any app with sign-up. The
// caller is identified from their own session token, never from the request
// body, so nobody can delete anyone else. Profiles, games, puzzle attempts and
// queue rows all reference auth.users ON DELETE CASCADE, so deleting the auth
// user removes everything tied to it.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Who is asking? Resolved from their own JWT.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !user) return json(401, { error: 'not signed in' });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json(500, { error: error.message });
  return json(200, { deleted: true });
});
