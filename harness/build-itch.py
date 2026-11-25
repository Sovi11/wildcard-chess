# Builds dist/hollow-chess-itch.zip: the site as an itch.io "HTML" upload.
#
# itch serves the zip from its own domain inside an iframe, at a path that is
# not the root, so every root-absolute link ("/", "/icons/x", "/#daily") has to
# become relative. js/platform.js notices the frame and points share links at
# hollowchess.com, hides Google sign-in, and skips the service worker.
#
#   python harness/build-itch.py
import io, os, re, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist')
PAGES = ['index.html', 'how-to-play.html', 'strategy.html', 'puzzles.html', 'chess-variants.html',
         'notation.html', 'privacy.html', 'delete-account.html']
FILES = ['styles.css', 'manifest.webmanifest', 'favicon.ico']
DIRS = ['js', 'icons']

def relative(html):
    html = html.replace('href="/favicon.ico"', 'href="favicon.ico"')
    html = re.sub(r'(href|src)="/(icons|js)/', r'\1="\2/', html)
    html = html.replace('href="/daily"', 'href="index.html#daily"')
    html = re.sub(r'href="/#', 'href="index.html#', html)
    html = html.replace('href="/"', 'href="index.html"')
    return html

os.makedirs(OUT, exist_ok=True)
zpath = os.path.join(OUT, 'hollow-chess-itch.zip')
n = 0
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in PAGES:
        html = relative(io.open(os.path.join(ROOT, p), encoding='utf-8').read())
        left = re.findall(r'(?:href|src)="/[^"/][^"]*"', html)
        assert not left, (p, left[:5])
        z.writestr(p, html); n += 1
    for f in FILES:
        z.write(os.path.join(ROOT, f), f); n += 1
    for d in DIRS:
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            for name in names:
                full = os.path.join(base, name)
                z.write(full, os.path.relpath(full, ROOT).replace(os.sep, '/')); n += 1
print(zpath, n, 'files', os.path.getsize(zpath), 'bytes')
