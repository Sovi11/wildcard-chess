// Original SVG chess sets. Each entry is the inner markup of a 45x45 <symbol>.
// Contract: main shapes fill="currentColor" (side colour comes from CSS), detail
// lines fill="none" (they pick up the piece stroke). Accent shapes may use
// fill="var(--pc-hat, currentColor)" — themes colour these per side (gnome hats,
// mushroom caps, snail shells); without a theme they fall back to the body colour.

// ---- Staunton ------------------------------------------------------------------
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

// ---- Cburnett (the default) -------------------------------------------------
// The standard pieces of Wikipedia and Lichess, by Colin M.L. Burnett, used under
// the BSD licence (see js/CBURNETT-LICENSE.txt). The art is unmodified. Each side
// has its own drawing with its own colours, so a symbol carries both and the
// piece class shows one: .pc.w sets --cb-w, .pc.b sets --cb-b (styles.css).
const CBURNETT = {
  pawn: '<g style="visibility:var(--cb-w,hidden)">' +
    '<path d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z" style="opacity:1; fill:#ffffff; fill-opacity:1; fill-rule:nonzero; stroke:#000000; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:miter; stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;"/>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<path d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z" style="opacity:1; fill:#000000; fill-opacity:1; fill-rule:nonzero; stroke:#000000; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:miter; stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;"/>' +
    '</g>',
  knight: '<g style="visibility:var(--cb-w,hidden)">' +
    '<g style="opacity:1; fill:none; fill-opacity:1; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.3)"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#ffffff; stroke:#000000;" /><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#ffffff; stroke:#000000;" /><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#000000; stroke:#000000;" /><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#000000; stroke:#000000;" /></g>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<g style="opacity:1; fill:none; fill-opacity:1; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.3)"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#000000; stroke:#000000;" /><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#000000; stroke:#000000;" /><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#ffffff; stroke:#ffffff;" /><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#ffffff; stroke:#ffffff;" /><path d="M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z " style="fill:#ffffff; stroke:none;" /></g>' +
    '</g>',
  bishop: '<g style="visibility:var(--cb-w,hidden)">' +
    '<g style="opacity:1; fill:none; fill-rule:evenodd; fill-opacity:1; stroke:#000000; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.6)"><g style="fill:#ffffff; stroke:#000000; stroke-linecap:butt;"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z"/><path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"/><path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z"/></g><path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" style="fill:none; stroke:#000000; stroke-linejoin:miter;"/></g>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<g style="opacity:1; fill:none; fill-rule:evenodd; fill-opacity:1; stroke:#000000; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.6)"><g style="fill:#000000; stroke:#000000; stroke-linecap:butt;"><path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z"/><path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"/><path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z"/></g><path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" style="fill:none; stroke:#ffffff; stroke-linejoin:miter;"/></g>' +
    '</g>',
  rook: '<g style="visibility:var(--cb-w,hidden)">' +
    '<g style="opacity:1; fill:#ffffff; fill-opacity:1; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.3)"><path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z " style="stroke-linecap:butt;" /><path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z " style="stroke-linecap:butt;" /><path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" style="stroke-linecap:butt;" /><path d="M 34,14 L 31,17 L 14,17 L 11,14" /><path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17" style="stroke-linecap:butt; stroke-linejoin:miter;" /><path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5" /><path d="M 11,14 L 34,14" style="fill:none; stroke:#000000; stroke-linejoin:miter;" /></g>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<g style="opacity:1; fill:#000000; fill-opacity:1; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;" transform="translate(0,0.3)"><path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z " style="stroke-linecap:butt;" /><path d="M 12.5,32 L 14,29.5 L 31,29.5 L 32.5,32 L 12.5,32 z " style="stroke-linecap:butt;" /><path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z " style="stroke-linecap:butt;" /><path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z " style="stroke-linecap:butt;stroke-linejoin:miter;" /><path d="M 14,16.5 L 11,14 L 34,14 L 31,16.5 L 14,16.5 z " style="stroke-linecap:butt;" /><path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 11,14 z " style="stroke-linecap:butt;" /><path d="M 12,35.5 L 33,35.5 L 33,35.5" style="fill:none; stroke:#ffffff; stroke-width:1; stroke-linejoin:miter;" /><path d="M 13,31.5 L 32,31.5" style="fill:none; stroke:#ffffff; stroke-width:1; stroke-linejoin:miter;" /><path d="M 14,29.5 L 31,29.5" style="fill:none; stroke:#ffffff; stroke-width:1; stroke-linejoin:miter;" /><path d="M 14,16.5 L 31,16.5" style="fill:none; stroke:#ffffff; stroke-width:1; stroke-linejoin:miter;" /><path d="M 11,14 L 34,14" style="fill:none; stroke:#ffffff; stroke-width:1; stroke-linejoin:miter;" /></g>' +
    '</g>',
  queen: '<g style="visibility:var(--cb-w,hidden)">' +
    '<g style="fill:#ffffff;stroke:#000000;stroke-width:1.5;stroke-linejoin:round"><path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"/><path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z"/><path d="M 11.5,30 C 15,29 30,29 33.5,30" style="fill:none"/><path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" style="fill:none"/><circle cx="6" cy="12" r="2" /><circle cx="14" cy="9" r="2" /><circle cx="22.5" cy="8" r="2" /><circle cx="31" cy="9" r="2" /><circle cx="39" cy="12" r="2" /></g>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<g style="fill:#000000;stroke:#000000;stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round"><path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z" style="stroke-linecap:butt;fill:#000000" /><path d="m 9,26 c 0,2 1.5,2 2.5,4 1,1.5 1,1 0.5,3.5 -1.5,1 -1,2.5 -1,2.5 -1.5,1.5 0,2.5 0,2.5 6.5,1 16.5,1 23,0 0,0 1.5,-1 0,-2.5 0,0 0.5,-1.5 -1,-2.5 -0.5,-2.5 -0.5,-2 0.5,-3.5 1,-2 2.5,-2 2.5,-4 -8.5,-1.5 -18.5,-1.5 -27,0 z" /><path d="M 11.5,30 C 15,29 30,29 33.5,30" /><path d="m 12,33.5 c 6,-1 15,-1 21,0" /><circle cx="6" cy="12" r="2" /><circle cx="14" cy="9" r="2" /><circle cx="22.5" cy="8" r="2" /><circle cx="31" cy="9" r="2" /><circle cx="39" cy="12" r="2" /><path d="M 11,38.5 A 35,35 1 0 0 34,38.5" style="fill:none; stroke:#000000;stroke-linecap:butt;" /><g style="fill:none; stroke:#ffffff;"><path d="M 11,29 A 35,35 1 0 1 34,29" /><path d="M 12.5,31.5 L 32.5,31.5" /><path d="M 11.5,34.5 A 35,35 1 0 0 33.5,34.5" /><path d="M 10.5,37.5 A 35,35 1 0 0 34.5,37.5" /></g></g>' +
    '</g>',
  king: '<g style="visibility:var(--cb-w,hidden)">' +
    '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#fff" d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g>' +
    '</g><g style="visibility:var(--cb-b,hidden)">' +
    '<g style="fill:none; fill-opacity:1; fill-rule:evenodd; stroke:#000000; stroke-width:1.5; stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4; stroke-dasharray:none; stroke-opacity:1;"><path d="M 22.5,11.63 L 22.5,6" style="fill:none; stroke:#000000; stroke-linejoin:miter;" id="path6570"/><path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" style="fill:#000000;fill-opacity:1; stroke-linecap:butt; stroke-linejoin:miter;"/><path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37" style="fill:#000000; stroke:#000000;"/><path d="M 20,8 L 25,8" style="fill:none; stroke:#000000; stroke-linejoin:miter;"/><path d="M 32,29.5 C 32,29.5 40.5,25.5 38.03,19.85 C 34.15,14 25,18 22.5,24.5 L 22.5,26.6 L 22.5,24.5 C 20,18 10.85,14 6.97,19.85 C 4.5,25.5 13,29.5 13,29.5" style="fill:none; stroke:#ffffff;"/><path d="M 12.5,30 C 18,27 27,27 32.5,30 M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5 M 12.5,37 C 18,34 27,34 32.5,37" style="fill:none; stroke:#ffffff;"/></g>' +
    '</g>',
};
const PIECE_SETS = {
  cburnett: { name: 'Standard', raw: true, pieces: CBURNETT },
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
    name: 'Gnomes',
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
  const set = PIECE_SETS[setId] || PIECE_SETS.cburnett;
  const key = PIECE_SETS[setId] ? setId : 'cburnett';
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
