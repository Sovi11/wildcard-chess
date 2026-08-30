import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

p = 'shorts/shorts.html'
s = open(p, encoding='utf-8', newline='').read().replace('\r\n', '\n')
n = 0


def rep(old, new, expect=1):
    global s, n
    c = s.count(old)
    assert c == expect, 'count %d for: %s' % (c, old[:70])
    s = s.replace(old, new, 1)
    n += 1


# Reels/Shorts/TikTok all overlay the frame: roughly the top 220px (status bar
# and app chrome) and the bottom 450px (username, caption, audio, buttons) are
# covered, plus a ~180px action rail on the right. Everything that carries
# meaning has to live inside y 250-1450.
rep("""  .cap.top { top: 150px; font-size: 150px; }
  .cap.mid { top: 44%; font-size: 170px; }
  .cap.bottom { bottom: 130px; font-size: 84px; }""",
"""  .cap.top { top: 265px; font-size: 130px; }
  .cap.mid { top: 40%; font-size: 156px; }
  .cap.bottom { bottom: 500px; font-size: 72px; }""")

rep("""  #boardWrap { position:absolute; left:50px; top:560px; width:980px; height:980px; opacity:0; transition:opacity .4s; }""",
"""  #boardWrap { position:absolute; left:130px; top:620px; width:820px; height:820px; opacity:0; transition:opacity .4s; }""")

rep("""  #cam { position:absolute; inset:0; z-index:1; transform-origin:540px 1050px;""",
"""  #cam { position:absolute; inset:0; z-index:1; transform-origin:540px 1030px;""")

rep("""  #cheese { position:absolute; left:0; right:0; top:42%; text-align:center; font-size:460px; z-index:5;""",
"""  #cheese { position:absolute; left:0; right:0; top:38%; text-align:center; font-size:400px; z-index:5;""")

rep("""  #counter { position:absolute; top:330px; left:0; right:0; text-align:center; z-index:6;""",
"""  #counter { position:absolute; top:300px; left:0; right:0; text-align:center; z-index:6;""")

# End card: flex-centred content would sit half inside the bottom UI, so bias it
# upward into the safe band.
rep("""  #endcard { position:absolute; inset:0; z-index:10; background:var(--bg); display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:40px; opacity:0; transition:opacity .35s; }""",
"""  #endcard { position:absolute; inset:0; z-index:10; background:var(--bg); display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:34px; padding-bottom:380px;
    opacity:0; transition:opacity .35s; }""")

rep("""  #endcard .mark { width:380px; height:440px; }""",
"""  #endcard .mark { width:310px; height:360px; }""")
rep("""  #endcard .wm { font-size:150px; font-weight:900; line-height:.85; text-align:center; color:var(--ink); }""",
"""  #endcard .wm { font-size:128px; font-weight:900; line-height:.85; text-align:center; color:var(--ink); }""")
rep("""  #endcard .url { font-size:74px; color:var(--accent); font-weight:900; letter-spacing:.03em; }""",
"""  #endcard .url { font-size:66px; color:var(--accent); font-weight:900; letter-spacing:.03em; }""")

# Optional overlay to eyeball the safe band: ?safe=1
rep("""<div id="stage">""",
"""<div id="stage">
  <!-- ?safe=1 draws the platform-UI danger zones so the layout can be checked -->
  <div id="safeGuide" style="display:none;position:absolute;inset:0;z-index:99;pointer-events:none">
    <div style="position:absolute;left:0;right:0;top:0;height:220px;background:rgba(255,0,0,.28)"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:450px;background:rgba(255,0,0,.28)"></div>
    <div style="position:absolute;right:0;top:220px;bottom:450px;width:180px;background:rgba(255,140,0,.22)"></div>
  </div>""")

rep("""  const scene = new URLSearchParams(location.search).get('scene') || 'rook';""",
"""  if (new URLSearchParams(location.search).get('safe')) {
    document.getElementById('safeGuide').style.display = '';
  }
  const scene = new URLSearchParams(location.search).get('scene') || 'rook';""")

open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('applied', n, 'safe-zone edits')
