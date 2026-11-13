// Copies the website into www/ for the app. Same files as hollowchess.com,
// with the two CDN libraries swapped for local copies so the app starts
// offline and never depends on a third-party CDN being up.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');
const www = join(here, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'vendor'), { recursive: true });
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) cpSync(join(site, f), join(www, f));
cpSync(join(site, 'js'), join(www, 'js'), { recursive: true });
cpSync(join(site, 'icons'), join(www, 'icons'), { recursive: true });
cpSync(join(here, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), join(www, 'vendor/supabase.js'));
cpSync(join(here, 'node_modules/peerjs/dist/peerjs.min.js'), join(www, 'vendor/peerjs.min.js'));
// Capacitor's own JS runtime: the native bridge alone has no registerPlugin,
// so without this every plugin (splash, haptics, back button, share) is dead.
cpSync(join(here, 'node_modules/@capacitor/core/dist/capacitor.js'), join(www, 'vendor/capacitor.js'));

let html = readFileSync(join(www, 'index.html'), 'utf8');
const swap = (re, to) => { if (!re.test(html)) throw new Error('index.html changed: ' + re); html = html.replace(re, to); };
swap(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/, 'vendor/supabase.js');
swap(/https:\/\/unpkg\.com\/peerjs@[^"]+/, 'vendor/peerjs.min.js');
swap(/<script defer src="js\/platform\.js/, '<script src="vendor/capacitor.js"></script>\n  <script defer src="js/platform.js');
writeFileSync(join(www, 'index.html'), html);
console.log('www/ built from the website');
