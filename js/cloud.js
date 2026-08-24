// Wildcard Chess — Supabase back end (optional).
//
// Turns on: Google sign-in, ratings that follow you between devices, a global
// leaderboard, and a matchmaking queue that persists. The queue only carries a
// PeerJS id — once two players are introduced the game still runs directly
// between the browsers over WebRTC, so no moves ever touch the server.
//
// If js/config.js has no keys, every function here reports "off" and the game
// falls back to local ratings and peer-to-peer matchmaking.
//
// Exposed as window.WCCLOUD.

(function () {
  'use strict';

  const cfg = window.WCCONFIG || {};
  const QUEUE_TTL_MS = 120000;        // ignore queue rows older than two minutes

  let client = null;
  let user = null;
  let ready = false;
  let providers = [];             // which sign-in methods the project actually has
  const listeners = [];

  const configured = () => !!(cfg.supabaseUrl && cfg.supabaseKey);
  const enabled = () => !!client;
  const currentUser = () => user;
  const onChange = (fn) => { listeners.push(fn); };
  const fire = () => listeners.forEach((fn) => { try { fn(user); } catch (e) {} });

  async function init() {
    if (ready) return enabled();
    ready = true;
    if (!configured()) return false;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('[cloud] Supabase library did not load; staying local.');
      return false;
    }
    try {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      // Ask the project which providers are switched on, so the UI can offer
      // Google when it exists and fall back to an email link when it does not.
      try {
        const r = await fetch(cfg.supabaseUrl + '/auth/v1/settings', { headers: { apikey: cfg.supabaseKey } });
        const j = await r.json();
        providers = (j && j.external) ? Object.keys(j.external).filter(k => j.external[k]) : [];
      } catch (e) { providers = []; }
      const { data } = await client.auth.getSession();
      user = (data && data.session && data.session.user) || null;
      client.auth.onAuthStateChange(function (_event, session) {
        user = (session && session.user) || null;
        fire();
      });
      fire();
      return true;
    } catch (e) {
      console.warn('[cloud] init failed:', e && e.message);
      client = null;
      return false;
    }
  }

  const hasGoogle = () => providers.indexOf('google') >= 0;
  const providerList = () => providers.slice();

  // Passwordless email link. Works with no provider setup at all, so accounts
  // are usable before Google OAuth has been wired up.
  async function signInWithEmail(email) {
    if (!client) return { ok: false, error: 'cloud off' };
    const redirectTo = location.origin + location.pathname;
    const { error } = await client.auth.signInWithOtp({
      email: String(email || '').trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function signIn() {
    if (!client) return false;
    // Land back on this exact page; Supabase recovers the session from the URL.
    const redirectTo = location.origin + location.pathname;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo },
    });
    if (error) { console.warn('[cloud] sign-in failed:', error.message); return false; }
    return true;
  }

  async function signOut() {
    if (!client) return;
    try { await client.auth.signOut(); } catch (e) {}
    user = null;
    fire();
  }

  // ---- profile -------------------------------------------------------------

  // Read this account's stored profile, or null if they have none yet.
  async function loadProfile() {
    if (!client || !user) return null;
    const { data, error } = await client
      .from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.warn('[cloud] loadProfile:', error.message); return null; }
    return data || null;
  }

  async function saveProfile(p) {
    if (!client || !user) return false;
    const row = {
      id: user.id,
      name: String(p.name || 'Anonymous').slice(0, 16),
      elo: Math.round(p.elo) || 500,
      wins: p.wins | 0, losses: p.losses | 0, draws: p.draws | 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('profiles').upsert(row);
    if (error) { console.warn('[cloud] saveProfile:', error.message); return false; }
    return true;
  }

  async function leaderboard(limit) {
    if (!client) return null;
    const { data, error } = await client
      .from('profiles').select('name, elo, wins, losses, draws')
      .order('elo', { ascending: false }).limit(limit || 25);
    if (error) { console.warn('[cloud] leaderboard:', error.message); return null; }
    return data || [];
  }

  // ---- matchmaking queue ---------------------------------------------------
  // We publish only a PeerJS id. Whoever picks it up connects directly.

  async function joinQueue(elo, peerId) {
    if (!client || !user) return false;
    const { error } = await client.from('queue').upsert({
      id: user.id, elo: Math.round(elo), peer_id: String(peerId),
      created_at: new Date().toISOString(),
    });
    if (error) { console.warn('[cloud] joinQueue:', error.message); return false; }
    return true;
  }

  async function leaveQueue() {
    if (!client || !user) return;
    try { await client.from('queue').delete().eq('id', user.id); } catch (e) {}
  }

  // Find someone else waiting, nearest rating first. Returns { peer_id, elo } or null.
  async function findWaiting(elo, band) {
    if (!client || !user) return null;
    const since = new Date(Date.now() - QUEUE_TTL_MS).toISOString();
    const { data, error } = await client
      .from('queue').select('id, elo, peer_id')
      .neq('id', user.id)
      .gte('created_at', since)
      .gte('elo', Math.round(elo - (band || 200)))
      .lte('elo', Math.round(elo + (band || 200)))
      .limit(20);
    if (error) { console.warn('[cloud] findWaiting:', error.message); return null; }
    if (!data || !data.length) return null;
    data.sort((a, b) => Math.abs(a.elo - elo) - Math.abs(b.elo - elo));
    return data[0];
  }

  window.WCCLOUD = {
    configured, enabled, init, signIn, signInWithEmail, hasGoogle, providerList,
    signOut, currentUser, onChange,
    loadProfile, saveProfile, leaderboard,
    joinQueue, leaveQueue, findWaiting,
  };
})();
