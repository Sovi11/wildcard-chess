// Draws a puzzle from js/puzzle-data.json as a standalone inline SVG, for the
// static pages (puzzles.html). No script needed on the page, so a crawler and a
// reader with JavaScript off both see the position.
//
//   node harness/puzzle-svg.js hc-176 hc-010      prints one <svg> per id
//
// r = 0 is White's home rank, so rows are drawn with r growing upward.
'use strict';
const data = require('../js/puzzle-data.json');

const GLYPH = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
const NAME = { king: 'king', queen: 'queen', rook: 'rook', bishop: 'bishop', knight: 'knight', pawn: 'pawn' };

function svg(id, size) {
  const p = data.puzzles.find((x) => x.id === id);
  if (!p) throw new Error('no puzzle ' + id);
  const cells = p.cells.map((k) => k.split(',').map(Number));
  const cs = cells.map((c) => c[0]), rs = cells.map((c) => c[1]);
  const c0 = Math.min(...cs), c1 = Math.max(...cs), r0 = Math.min(...rs), r1 = Math.max(...rs);
  const S = size || 44, W = (c1 - c0 + 1) * S, H = (r1 - r0 + 1) * S;
  const X = (c) => (c - c0) * S, Y = (r) => (r1 - r) * S;
  const sq = (c, r) => String.fromCharCode(97 + c) + (r + 1);
  const out = [];
  const what = Object.keys(p.pieces).map((k) => {
    const [c, r] = k.split(',').map(Number); const [t, col] = p.pieces[k];
    return col + ' ' + NAME[t] + ' ' + sq(c, r);
  }).join(', ');
  out.push('<svg class="pz" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Hollow Chess puzzle ' + id +
    ': ' + p.turn + ' to move, mate in ' + p.mateIn + '. Pieces: ' + what + '. ' + (64 - p.cells.length > 0 ? (64 - p.cells.length) + ' squares of the board are missing.' : '') + '">');
  for (const [c, r] of cells) {
    out.push('<rect x="' + X(c) + '" y="' + Y(r) + '" width="' + S + '" height="' + S + '" fill="' + ((c + r) % 2 ? '#d9d6cb' : '#6f7a86') + '"/>');
  }
  for (const k of Object.keys(p.pieces)) {
    const [c, r] = k.split(',').map(Number); const [t, col] = p.pieces[k];
    out.push('<text x="' + (X(c) + S / 2) + '" y="' + (Y(r) + S * 0.79) + '" font-size="' + Math.round(S * 0.8) + '" text-anchor="middle" ' +
      (col === 'white' ? 'fill="#ffffff" stroke="#0b0c0e"' : 'fill="#0b0c0e" stroke="#f2f1ed"') + ' stroke-width="1.1" paint-order="stroke">' + GLYPH[t] + '</text>');
  }
  out.push('</svg>');
  return { svg: out.join(''), p };
}

module.exports = { svg };
if (require.main === module) {
  for (const id of process.argv.slice(2)) console.log(svg(id).svg + '\n');
}
