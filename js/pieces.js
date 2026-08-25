// Original SVG chess sets. Each entry is the inner markup of a 45x45 <symbol>.
// Contract: main shapes fill="currentColor" (side colour comes from CSS), detail
// lines fill="none" (they pick up the piece stroke). Accent shapes may use
// fill="var(--pc-hat, currentColor)" — themes colour these per side (gnome hats,
// mushroom caps, snail shells); without a theme they fall back to the body colour.

const PIECE_SETS = {
  classic: {
    name: 'Classic',
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
  const set = PIECE_SETS[setId] || PIECE_SETS.classic;
  const key = PIECE_SETS[setId] ? setId : 'classic';
  let defs = '<defs>';
  for (const [name, body] of Object.entries(set.pieces)) {
    defs += `<symbol id="pc-${key}-${name}" viewBox="0 0 45 45" overflow="visible">${body}</symbol>`;
  }
  defs += '</defs>';
  return defs;
}

if (typeof module !== 'undefined') module.exports = { PIECE_SETS, pieceDefs };
