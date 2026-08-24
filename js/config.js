// Wildcard Chess — deployment config.
//
// Paste your Supabase project values here to turn on accounts, cloud ratings,
// a global leaderboard and persistent matchmaking. See SUPABASE_SETUP.md.
//
// Leave them empty and the game runs exactly as it does now: ratings in local
// storage, matchmaking peer-to-peer, no sign-in. Nothing breaks.
//
// The anon / publishable key is SAFE to commit — it is designed for browsers and
// Row Level Security is what actually protects the data. Never put the
// service_role key here; it bypasses every policy.

window.WCCONFIG = {
  supabaseUrl: 'https://ykmenwvniegyhxzxsvod.supabase.co',
  supabaseKey: '',      // <-- still needed: Project Settings > API Keys > anon/publishable
};
