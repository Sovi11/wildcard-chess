// Hollow Chess — where am I running?
// The same files ship as the website and inside the Android/iOS app. In the
// app the page lives at https://localhost, so anything that builds a link for
// someone ELSE (room invites, game links, email confirmations) must use the
// public site instead of location.origin. Loaded first; exposed as window.HC.
(function () {
  'use strict';
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  // Framed inside another site (the itch.io build runs in an iframe on itch's
  // domain). Links for other people must still point at the public site, and
  // Google sign-in cannot run inside a frame.
  let embedded = false;
  try { embedded = !native && window.self !== window.top; } catch (e) { embedded = !native; }
  window.HC = {
    native: native,
    embedded: embedded,
    platform: native && cap.getPlatform ? cap.getPlatform() : (embedded ? 'embed' : 'web'),
    // where links shared with other people should point
    publicBase: (native || embedded) ? 'https://hollowchess.com/' : location.origin + location.pathname,
  };
  if (native) document.documentElement.classList.add('native', 'native-' + window.HC.platform);
})();
