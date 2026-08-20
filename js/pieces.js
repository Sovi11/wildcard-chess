// Original flat SVG chess set. Each entry is the inner markup of a 45x45 <symbol>.
// Shapes use fill="currentColor" and inherit stroke/stroke-width/color from the <use>,
// so a single set themes to white/black via CSS. Detail lines use fill="none".

const PIECE_PATHS = {
  pawn: `
    <circle cx="22.5" cy="13" r="5.7" fill="currentColor"/>
    <path fill="currentColor" d="M17 18.5 q-2.5 2.6 0 5.2 q-3.4 2.2 -4.4 8.3 h19.8 q-1 -6.1 -4.4 -8.3 q2.5 -2.6 0 -5.2 z"/>
    <path fill="currentColor" d="M13.2 31.5 h18.6 l2.2 4 q.7 1.3 -.9 1.8 H11.9 q-1.6 -.5 -.9 -1.8 z"/>`,

  rook: `
    <path fill="currentColor" d="M12 18 v-6 h3.6 v2.7 h3.3 v-2.7 h7.2 v2.7 h3.3 v-2.7 H36 v6 z"/>
    <path fill="currentColor" d="M14.4 18 h16.2 l-1.4 14 H15.8 z"/>
    <path fill="currentColor" d="M12.4 31.5 h20.2 v3 H12.4 z"/>
    <path fill="currentColor" d="M10 34 h25 l2.1 4.4 q.7 1.4 -.9 2 H8.8 q-1.6 -.6 -.9 -2 z"/>`,

  knight: `
    <path fill="currentColor" d="M14 38
      c0 -7 3 -10.5 8.4 -13.7
      c-4 1 -7.6 .2 -9 -3.4
      c-.6 -1.6 -.3 -3.2 .8 -4.4
      l-2.6 2.9 l-2 -2.4
      c1 -5.4 5.6 -9.4 11.4 -10.2
      c.4 -1.9 2.2 -3 4 -2.2
      c2.2 .9 1.9 3.1 1.1 3.9
      c4.7 1.2 8.2 5.4 9 11
      c.6 4.2 .9 8.7 1 13 .04 1.8 .1 3.5 .1 5.5 z"/>
    <circle cx="16.6" cy="15.2" r="1.15" fill="none"/>`,

  bishop: `
    <circle cx="22.5" cy="8.2" r="2.5" fill="currentColor"/>
    <path fill="currentColor" d="M22.5 10.5 c5.8 3.3 8 11.4 4.2 18.2 h-8.4 c-3.8 -6.8 -1.6 -14.9 4.2 -18.2 z"/>
    <path fill="none" d="M22.5 15 q2.2 4 0 8.5"/>
    <path fill="currentColor" d="M15.5 28.7 h14 l1.6 3.3 H13.9 z"/>
    <path fill="currentColor" d="M11 33.5 h23 l2 4.3 q.7 1.4 -.9 2 H9.9 q-1.6 -.6 -.9 -2 z"/>`,

  queen: `
    <circle cx="8.5" cy="12.5" r="2.3" fill="currentColor"/>
    <circle cx="17" cy="9.5" r="2.3" fill="currentColor"/>
    <circle cx="22.5" cy="8.3" r="2.5" fill="currentColor"/>
    <circle cx="28" cy="9.5" r="2.3" fill="currentColor"/>
    <circle cx="36.5" cy="12.5" r="2.3" fill="currentColor"/>
    <path fill="currentColor" d="M8.8 13.2 l3.2 19.3 h21 l3.2 -19.3 l-6.4 7.6 l-2.8 -11.1 l-3.7 11.8 l-3.7 -11.8 l-2.8 11.1 z"/>
    <path fill="currentColor" d="M11.5 31.8 h22 v3 h-22 z"/>
    <path fill="currentColor" d="M9.8 34.2 h25.4 l2 4.3 q.7 1.4 -.9 2 H8.7 q-1.6 -.6 -.9 -2 z"/>`,

  king: `
    <path fill="currentColor" d="M21 6 h3 v3 h3 v3 h-3 v3.2 h-3 v-3.2 h-3 v-3 h3 z"/>
    <path fill="currentColor" d="M11.8 32.5 C10.4 24.8 14.6 21.2 18.7 23.8 C15.9 19.4 18.2 14.4 22.5 16.4 C26.8 14.4 29.1 19.4 26.3 23.8 C30.4 21.2 34.6 24.8 33.2 32.5 Z"/>
    <path fill="currentColor" d="M12.4 31.5 h20.2 v3 H12.4 z"/>
    <path fill="currentColor" d="M10 34 h25 l2.1 4.4 q.7 1.4 -.9 2 H8.8 q-1.6 -.6 -.9 -2 z"/>`,
};

function pieceDefs() {
  let defs = '<defs>';
  for (const [name, body] of Object.entries(PIECE_PATHS)) {
    defs += `<symbol id="pc-${name}" viewBox="0 0 45 45" overflow="visible">${body}</symbol>`;
  }
  defs += '</defs>';
  return defs;
}

if (typeof module !== 'undefined') module.exports = { PIECE_PATHS, pieceDefs };
