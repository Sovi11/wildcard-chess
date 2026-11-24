// Writes puzzles.html: a static, crawlable page about the puzzles with three
// example positions drawn as inline SVG. Re-run after changing the examples.
//
//   node harness/build-puzzles-page.js
'use strict';
const fs = require('fs');
const path = require('path');
const { svg } = require('./puzzle-svg.js');
const data = require('../js/puzzle-data.json');

// the same filter js/puzzles.js applies: full-size boards, no pawn on a back rank
const skip = (p) => {
  const cs = p.cells.map((k) => +k.split(',')[0]), rs = p.cells.map((k) => +k.split(',')[1]);
  const lo = Math.min(...rs), hi = Math.max(...rs);
  const odd = Object.keys(p.pieces).some((k) => p.pieces[k][0] === 'pawn' && (+k.split(',')[1] === lo || +k.split(',')[1] === hi));
  return odd || Math.max(...cs) - Math.min(...cs) < 7 || hi - lo < 7;
};
const shown = data.puzzles.filter((p) => !skip(p));
const total = shown.length;
const m1 = shown.filter((p) => p.mateIn === 1).length;
const m2 = shown.filter((p) => p.mateIn === 2).length;
const island = shown.filter((p) => p.tags.indexOf('island-king') >= 0 || p.tags.indexOf('peninsula-king') >= 0).length;

// id, heading, what to look for (never the solution). All three have already
// run as the daily puzzle, so showing them gives nothing away.
const EXAMPLES = [
  ['hc-176', 'The king on an island', 'The white king is cut off from the rest of the board by missing squares. No rook or bishop could ever reach it, but a knight does not care about water. Black has a king, a knight and two moves.'],
  ['hc-019', 'Mate in one, with the board', 'Black to play and mate in one, and no piece move does it. It is a board turn, so Black may lift an empty square instead of moving a piece. One square on this board is the whole puzzle.'],
  ['hc-061', 'Two moves, the first one a square', 'Black to play and mate in two. The first move is a board move: think about which square the white king needs, or which line a black piece is missing.'],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const blocks = EXAMPLES.map(([id, title, text]) => {
  const { svg: s, p } = svg(id);
  return '<h3>' + title + '</h3>\n<figure>' + s + '<figcaption>' + cap(p.turn) + ' to move, mate in ' + p.mateIn +
    '. ' + (64 - p.cells.length) + ' squares are missing.</figcaption></figure>\n<p>' + text +
    ' <a href="/#puzzle=' + id + '">Solve this puzzle</a></p>';
}).join('\n\n');

const TITLE = 'Hollow Chess puzzles: mate in 1 and 2 on a board that moves';
const DESC = total + ' free chess puzzles where the board itself can move. Mates in one and two with kings on islands, knights jumping holes, and key moves that are a square, not a piece. One new daily puzzle.';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${TITLE}</title>
<meta name="description" content="${DESC}" />
<link rel="canonical" href="https://hollowchess.com/puzzles.html" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Hollow Chess" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESC}" />
<meta property="og:url" content="https://hollowchess.com/puzzles.html" />
<meta property="og:image" content="https://hollowchess.com/icons/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.ico" sizes="48x48" /><link rel="icon" type="image/png" sizes="96x96" href="/icons/favicon-96.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=swap" />
<style>
  :root { color-scheme: dark; --paper:#0b0c0e; --card:#131417; --ink:#f2f1ed; --muted:#8b9097; --rule:#23262b; --peacock:#f2f1ed; --sunset:#c8f03c; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:"Geist",system-ui,sans-serif; font-size:17px; line-height:1.6; }
  .wrap { max-width:760px; margin:0 auto; padding:28px 20px 70px; }
  nav { display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:26px; font-size:15px; }
  nav a { color:var(--ink); text-decoration:none; font-weight:600; } nav a:hover { text-decoration:underline; }
  nav .brand { font-family:"Geist",system-ui,sans-serif; font-size:20px; font-weight:650; letter-spacing:-.03em; margin-right:auto; }
  h1 { font-family:"Geist",system-ui,sans-serif; font-weight:650; letter-spacing:-.035em; font-size:40px; line-height:1.1; margin:0 0 10px; }
  h2 { font-family:"Geist",system-ui,sans-serif; font-weight:650; letter-spacing:-.035em; font-size:27px; margin:34px 0 8px; }
  h3 { font-size:18px; margin:26px 0 8px; }
  p { margin:0 0 14px; } .lede { font-size:19px; color:var(--muted); }
  a { color:var(--sunset); }
  .cta { display:inline-block; margin:8px 0 6px; padding:13px 26px; border-radius:10px; background:var(--peacock); color:#0b0c0e; font-weight:600; text-decoration:none; }
  figure { margin:0 0 12px; padding:16px; background:var(--card); border:1px solid var(--rule); border-radius:12px; }
  figure svg.pz { display:block; width:100%; max-width:352px; height:auto; margin:0 auto; }
  figcaption { margin-top:10px; text-align:center; font-size:15px; color:var(--muted); }
  footer { margin-top:44px; padding-top:16px; border-top:1px solid var(--rule); font-size:14.5px; color:var(--muted); }
  @media (max-width:520px) { h1 { font-size:32px; } h2 { font-size:23px; } }
</style>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Article', headline: TITLE, description: DESC, url: 'https://hollowchess.com/puzzles.html',
      datePublished: '2026-11-24', dateModified: '2026-11-24', image: 'https://hollowchess.com/icons/og-card.png',
      author: { '@type': 'Organization', name: 'Hollow Chess', url: 'https://hollowchess.com/' },
      publisher: { '@type': 'Organization', name: 'Hollow Chess', url: 'https://hollowchess.com/' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Hollow Chess', item: 'https://hollowchess.com/' },
      { '@type': 'ListItem', position: 2, name: 'Puzzles', item: 'https://hollowchess.com/puzzles.html' }] },
  ],
})}</script>
</head>
<body>
<div class="wrap">
<nav><a class="brand" href="/">Hollow Chess</a><a href="how-to-play.html">How to play</a><a href="strategy.html">Strategy</a><a href="puzzles.html">Puzzles</a><a href="/">Play</a></nav>
<h1>Hollow Chess puzzles</h1>
<p class="lede">${total} chess puzzles on boards with squares missing. In most of them the winning move is not a piece move at all: you lift a square.</p>
<a class="cta" href="/#daily">Solve today&rsquo;s puzzle</a>

<h2>What makes them different</h2>
<p>In Hollow Chess every third turn is a board turn, on which you may pick up an empty square and put it down anywhere that touches the rest of the board along an edge. The place it came from becomes a hole. Rooks, bishops and queens cannot cross a hole, kings cannot step into one, and knights jump over. The <a href="how-to-play.html">full rules</a> take a minute to read.</p>
<p>That gives a puzzle two more questions than a normal chess problem. Which square does the king need, and can I take it away? Which line is closed, and can I open it?</p>

<h2>Three to try</h2>
${blocks}

<h2>What is in the set</h2>
<ul>
<li><strong>${m1} mates in one</strong> and <strong>${m2} mates in two</strong>, each checked by a solver so there is exactly one way to start.</li>
<li><strong>${island} island and peninsula puzzles</strong>, where the king is cut off from the board and something has to get across.</li>
<li><strong>A rating for every puzzle</strong> and one for you. Solve one cleanly and yours goes up, the way a rated game works.</li>
<li><strong>A daily puzzle</strong>, the same for everyone, with a clock, a streak and a result you can share without spoiling it.</li>
</ul>

<h2>The daily puzzle</h2>
<p>One puzzle is chosen each day and changes at midnight UTC. Everyone gets the same position, so you can compare times with a friend. Solve it on consecutive days to build a streak; there are badges at 3, 7, 10, 30, 50 and 100 days.</p>
<p><a class="cta" href="/#daily">Open today&rsquo;s puzzle</a></p>

<h2>Getting better at them</h2>
<p>Most of the mates come from a handful of patterns: taking away the king&rsquo;s last escape square, filling a hole so a rook or queen suddenly gives check, and using a knight where sliding pieces cannot reach. The <a href="strategy.html">strategy guide</a> covers each of them.</p>
<footer>Hollow Chess is a free chess variant that runs in your browser. <a href="/">Play it now</a> · <a href="how-to-play.html">How to play</a> · <a href="strategy.html">Strategy</a> · <a href="puzzles.html">Puzzles</a> · <a href="chess-variants.html">Chess variants compared</a> · <a href="notation.html">Notation</a> · <a href="privacy.html">Privacy</a></footer>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '..', 'puzzles.html'), html);
console.log('puzzles.html', html.length, 'bytes;', total, 'puzzles');
