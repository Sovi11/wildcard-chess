const fs = require('node:fs');
const path = require('node:path');
const mobile = path.resolve(__dirname, '..');
const root = path.resolve(mobile, '..');
const out = path.join(mobile, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
for (const entry of ['styles.css', 'js', 'icons', 'manifest.webmanifest']) {
  fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true });
}
for (const [source, destination] of [
  ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
  ['peerjs/dist/peerjs.min.js', 'peerjs.min.js'],
]) fs.copyFileSync(path.join(mobile, 'node_modules', source), path.join(out, 'vendor', destination));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js', './vendor/supabase.js')
  .replace('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', './vendor/peerjs.min.js');
// Native assets ship with the binary; leave web service workers to the website.
html = html.replace("if ('serviceWorker' in navigator &&", "if (!window.Capacitor && 'serviceWorker' in navigator &&");
html = html.replace('</head>', '<style>body{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}</style></head>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('Bundled Hollow Chess with local game and SDK assets into mobile/www.');
