// Original SVG chess sets. Each entry is the inner markup of a 45x45 <symbol>.
// Contract: main shapes fill="currentColor" (side colour comes from CSS), detail
// lines fill="none" (they pick up the piece stroke). Accent shapes may use
// fill="var(--pc-hat, currentColor)" — themes colour these per side (gnome hats,
// mushroom caps, snail shells); without a theme they fall back to the body colour.

// ---- Staunton (the default) -------------------------------------------------
// An original Staunton-pattern set, drawn for this game (no third-party art, so
// it ships to Steam clean). Each piece is a SILHOUETTE plus a few detail lines;
// shaded() turns that into the final symbol: a soft contact shadow, the body in
// the side colour, the same body again under a neutral light-to-shade sheen
// (alpha only, so one gradient lights ivory and ebony alike), then the details.
// Lighting comes from the top-left, everywhere, from this one function.
const BASE = 'M9.6 40.2 h25.8 q1.9 0 1.3 -1.8 l-1 -2.6 H9.3 l-1 2.6 q-.6 1.8 1.3 1.8 z' +
             'M11.4 35.9 h22.2 q.6 -2.3 -1 -2.9 H12.4 q-1.6 .6 -1 2.9 z';
const BASE_LINES = 'M9.3 35.8 h26.4 M12 33 h21';
function shaded(body, lines) {
  return `<ellipse cx="22.5" cy="40.4" rx="14.5" ry="2.1" fill="#000" fill-opacity=".28" stroke="none"/>` +
    `<path fill="currentColor" d="${body}"/>` +
    `<path fill="url(#pcSheen)" stroke="none" d="${body}"/>` +
    (lines ? `<path fill="none" stroke-opacity=".55" d="${lines}"/>` : '');
}
const STAUNTON = {
  pawn: shaded(
    BASE +
    'M14.2 33 C16.8 30 18.6 27.2 18.9 24.4 H26.1 C26.4 27.2 28.2 30 30.8 33 z' +
    'M15.8 24.6 q0 -2.9 6.7 -2.9 q6.7 0 6.7 2.9 z' +
    'M22.5 9.4 a6.2 6.2 0 1 1 0 12.4 a6.2 6.2 0 1 1 0 -12.4 z',
    BASE_LINES + ' M16 24.4 h13'),
  rook: shaded(
    BASE +
    'M13.6 33 l1.7 -15.4 h14.4 l1.7 15.4 z' +
    'M12.4 17.9 v-3.4 h20.2 v3.4 z' +
    'M11.6 14.7 V7.8 h4.6 v2.9 h3.1 V7.8 h6.4 v2.9 h3.1 V7.8 h4.6 v6.9 z',
    BASE_LINES + ' M15.3 17.7 h14.4 M12.4 14.6 h20.2'),
  knight: shaded(
    BASE +
    'M12.6 33 C12.2 28.8 14.9 25.8 19.2 23.2' +
    ' C16.7 23.6 13.6 24.3 11.2 23.9 C9.2 23.6 8.2 22 8.9 20.3' +
    ' L10.3 17.9 C12.2 14.9 14.1 12.8 16.5 11 L18.4 5.8 L21 9.2 L23.4 6 L24.8 9.6' +
    ' C30.7 10.9 34.6 16.4 34.8 23.6 C34.9 27.1 34.3 30.4 33.6 33 z',
    BASE_LINES + ' M25.6 10.6 C30 12.6 32.6 17.4 32.7 24.4 M9.5 21.4 q1.6 .7 3.2 .2' +
    ' M16.4 14.9 q1.2 -.9 2.2 .1'),
  bishop: shaded(
    BASE +
    'M14.6 33 C17.2 30.2 18.8 27.6 19.1 25.4 H25.9 C26.2 27.6 27.8 30.2 30.4 33 z' +
    'M15.6 25.6 q0 -2.6 6.9 -2.6 q6.9 0 6.9 2.6 z' +
    'M22.5 9.9 C27.2 12.5 29.6 17 28.1 21.4 Q27.6 22.9 26.4 23.3 H18.6 Q17.4 22.9 16.9 21.4' +
    ' C15.4 17 17.8 12.5 22.5 9.9 z' +
    'M22.5 5.1 a2.35 2.35 0 1 1 0 4.7 a2.35 2.35 0 1 1 0 -4.7 z',
    BASE_LINES + ' M16 25.4 h13 M21.2 14.6 l3.8 4.6 M18.4 23.1 h8.2'),
  queen: shaded(
    BASE +
    'M13.2 33 C15.6 28.6 17.3 24.4 17.8 19.6 H27.2 C27.7 24.4 29.4 28.6 31.8 33 z' +
    'M15.4 20.1 q0 -2.5 7.1 -2.5 q7.1 0 7.1 2.5 z' +
    // five points fanned out evenly, a ball on each tip, the centre highest
    'M16.6 17.8 L12.4 9.6 L16.6 13.8 L17.2 7.4 L20.4 13.2 L22.5 5.9 L24.6 13.2 L27.8 7.4 L28.4 13.8 L32.6 9.6 L28.4 17.8 z' +
    'M12.4 7.9 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 z' +
    'M17.2 5.7 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 z' +
    'M22.5 3.9 a1.75 1.75 0 1 1 0 3.5 a1.75 1.75 0 1 1 0 -3.5 z' +
    'M27.8 5.7 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 z' +
    'M32.6 7.9 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 z',
    BASE_LINES + ' M15.6 19.9 h13.8 M16.6 17.6 h11.8'),
  king: shaded(
    BASE +
    'M13.6 33 C15.9 28.4 17.5 24.2 17.9 19.8 H27.1 C27.5 24.2 29.1 28.4 31.4 33 z' +
    'M15.3 20.3 q0 -2.6 7.2 -2.6 q7.2 0 7.2 2.6 z' +
    'M16.6 17.8 C15.6 14.6 17.4 12 22.5 11.9 C27.6 12 29.4 14.6 28.4 17.8 z' +
    'M21.3 2.6 h2.4 v2.5 h2.5 v2.4 h-2.5 v4.5 h-2.4 V7.5 h-2.5 V5.1 h2.5 z',
    BASE_LINES + ' M15.5 20.1 h14 M16.6 17.6 h11.8'),
};

const PIECE_SETS = {
  staunton: { name: 'Staunton', shaded: true, pieces: STAUNTON },
  classic: {
    name: 'Flat',
    pieces: {
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
    },
  },

  // ---- Garden gnomes ------------------------------------------------------
  // Silhouette language: every rank reads by its hat and its companion.
  //   pawn   — small gnome, plain pointed cap
  //   rook   — mushroom house (cap = accent, little door and window)
  //   knight — gnome snail: spiral shell (accent) with the head craning left
  //   bishop — lantern-keeper: tall crooked cap, staff with hanging lantern
  //   queen  — flower crown: cap topped with a five-petal bloom (accent)
  //   king   — the tallest cap of all, banded like a crown
  gnome: {
    name: 'Garden gnomes',
    pieces: {
      pawn: `
        <path fill="var(--pc-hat, currentColor)" d="M22.5 6 L30 19 Q22.5 16.5 15 19 Z"/>
        <circle cx="22.5" cy="22" r="4.6" fill="currentColor"/>
        <path fill="currentColor" d="M22.5 23 q6.5 1.5 7.5 8 l-15 0 q1 -6.5 7.5 -8 z"/>
        <path fill="currentColor" d="M14.5 30.5 h16 q2.5 3 2 6 h-20 q-.5 -3 2 -6 z"/>
        <path fill="currentColor" d="M12 36.5 h21 l1.4 3 q.5 1.1 -.8 1.5 H11.4 q-1.3 -.4 -.8 -1.5 z"/>
        <path fill="none" d="M18.6 21.3 q.9 -1 1.9 0 M24 21.3 q.9 -1 1.9 0"/>`,
      rook: `
        <path fill="var(--pc-hat, currentColor)" d="M9.5 21 Q10.5 8.5 22.5 8 Q34.5 8.5 35.5 21 Q22.5 17.5 9.5 21 Z"/>
        <circle cx="15.5" cy="14.5" r="1.5" fill="none"/>
        <circle cx="27.5" cy="12.5" r="1.9" fill="none"/>
        <path fill="currentColor" d="M13.5 21.5 h18 l-1 13.5 h-16 z"/>
        <path fill="none" d="M19.4 35 v-6.6 q0 -3.4 3.1 -3.4 q3.1 0 3.1 3.4 V35"/>
        <circle cx="28" cy="26.5" r="1.5" fill="none"/>
        <path fill="currentColor" d="M12 35 h21 v2.4 H12 z"/>
        <path fill="currentColor" d="M10 37.4 h25 l1.2 2.2 q.5 1 -.7 1.4 H9.5 q-1.2 -.4 -.7 -1.4 z"/>`,
      knight: `
        <circle cx="28" cy="25" r="10" fill="var(--pc-hat, currentColor)"/>
        <circle cx="28" cy="25" r="6" fill="none"/>
        <circle cx="28" cy="25" r="2.4" fill="none"/>
        <path fill="currentColor" d="M7.5 31 Q7 15 12.5 11.5 Q17.5 9 18.5 14 L17 31 Z"/>
        <path fill="none" d="M12 11 L9.5 5.5 M15.5 10.5 L15.5 4.5"/>
        <circle cx="9" cy="5" r="1.3" fill="currentColor"/>
        <circle cx="15.5" cy="4" r="1.3" fill="currentColor"/>
        <circle cx="12.2" cy="15.5" r="1" fill="none"/>
        <path fill="currentColor" d="M6 30 h32 q2 0 2 2.5 l-.8 3.5 H6.5 q-2.5 -2.5 -.5 -6 z"/>
        <path fill="currentColor" d="M7.5 36 h31 l1 2.2 q.4 1 -.7 1.3 H7.6 q-1.1 -.3 -.7 -1.3 z"/>`,
      bishop: `
        <path fill="var(--pc-hat, currentColor)" d="M21 4.5 Q29.5 6 28.5 12 Q27.8 16 26.5 19 L16.5 19 Q15 9 21 4.5 Z"/>
        <circle cx="30.5" cy="6.5" r="2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="21.5" cy="22" r="4.2" fill="currentColor"/>
        <path fill="currentColor" d="M21.5 23.5 q5.5 1.5 6.5 8.5 h-13 q1 -7 6.5 -8.5 z"/>
        <path fill="none" d="M33.5 12 V27"/>
        <path fill="currentColor" d="M31 27 h5 l-.8 5 h-3.4 z"/>
        <path fill="none" d="M31.6 29.5 h3.8"/>
        <path fill="currentColor" d="M13.5 32 h17 q2 2.5 1.6 4.5 h-20 q-.4 -2 1.4 -4.5 z"/>
        <path fill="currentColor" d="M11.5 36.5 h22 l1.2 2.4 q.5 1 -.7 1.4 H11 q-1.2 -.4 -.7 -1.4 z"/>`,
      queen: `
        <circle cx="22.5" cy="6.5" r="2.2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="18.5" cy="9" r="2.2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="26.5" cy="9" r="2.2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="20.4" cy="12.4" r="2.2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="24.6" cy="12.4" r="2.2" fill="var(--pc-hat, currentColor)"/>
        <circle cx="22.5" cy="9.8" r="1.5" fill="none"/>
        <path fill="var(--pc-hat, currentColor)" d="M22.5 13 L29 22 Q22.5 19.8 16 22 Z"/>
        <circle cx="22.5" cy="24.5" r="4.4" fill="currentColor"/>
        <path fill="currentColor" d="M22.5 25.5 q7 1.5 8 8.5 l-16 0 q1 -7 8 -8.5 z"/>
        <path fill="none" d="M17.5 33.5 q5 -2.2 10 0"/>
        <path fill="currentColor" d="M13.5 34 h18 q1.8 1.6 1.5 3 h-21 q-.3 -1.4 1.5 -3 z"/>
        <path fill="currentColor" d="M11.5 37 h22 l1.1 2 q.5 1 -.7 1.3 H11.1 q-1.2 -.3 -.7 -1.3 z"/>`,
      king: `
        <path fill="var(--pc-hat, currentColor)" d="M22.5 3 L30.5 20 Q22.5 17.3 14.5 20 Z"/>
        <path fill="none" d="M17.2 15.2 L19.5 13.2 L21.8 15.2 L24.1 13.2 L26.4 15.2 L28.2 13.6"/>
        <circle cx="22.5" cy="23" r="4.8" fill="currentColor"/>
        <path fill="currentColor" d="M22.5 24 q7.5 1.6 8.6 9 l-17.2 0 q1.1 -7.4 8.6 -9 z"/>
        <path fill="none" d="M20 33 h5"/>
        <circle cx="22.5" cy="33" r="1.1" fill="none"/>
        <path fill="currentColor" d="M12.8 34.5 h19.4 q2 1.7 1.7 3 h-22.8 q-.3 -1.3 1.7 -3 z"/>
        <path fill="currentColor" d="M10.8 37.5 h23.4 l1.1 2 q.5 1 -.7 1.3 H10.4 q-1.2 -.3 -.7 -1.3 z"/>`,
    },
  },
};

// Symbol defs for one set: ids look like pc-classic-pawn, pc-gnome-rook, ...
function pieceDefs(setId) {
  const set = PIECE_SETS[setId] || PIECE_SETS.staunton;
  const key = PIECE_SETS[setId] ? setId : 'staunton';
  // The sheen is alpha-only, so the one gradient lights both sides: it lifts
  // ebony and gives ivory a shaded flank. objectBoundingBox = per-shape.
  let defs = '<defs><linearGradient id="pcSheen" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".46"/>' +
    '<stop offset=".42" stop-color="#fff" stop-opacity=".06"/>' +
    '<stop offset=".58" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>';
  for (const [name, body] of Object.entries(set.pieces)) {
    defs += `<symbol id="pc-${key}-${name}" viewBox="0 0 45 45" overflow="visible">${body}</symbol>`;
  }
  defs += '</defs>';
  return defs;
}

if (typeof module !== 'undefined') module.exports = { PIECE_SETS, pieceDefs };
