// Hollow Chess — the bits that only exist inside the phone app.
// On the website this file does nothing. In the app (Capacitor) it adds what a
// web page cannot: vibration on moves, the Android back button, the native
// share sheet for invites, and a status bar that matches the cream page.
// Plugins are reached through Capacitor.registerPlugin, so no bundler needed.
(function () {
  'use strict';
  if (!(window.HC && HC.native)) return;
  const cap = window.Capacitor;
  const plug = (name) => {
    try {
      if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
      return (cap.Plugins && cap.Plugins[name]) || null;
    } catch (e) { return null; }
  };
  const Haptics = plug('Haptics');
  const App = plug('App');
  const Share = plug('Share');
  const StatusBar = plug('StatusBar');
  const SplashScreen = plug('SplashScreen');
  const SystemBars = plug('SystemBars');   // Capacitor 8: edge-to-edge bars

  // ---- touch feedback -------------------------------------------------------
  // Hooked onto the sound cues, so every move, capture and board turn already
  // has a buzz — and it still buzzes with the sound muted.
  const BUZZ = {
    move: ['impact', 'LIGHT'], castle: ['impact', 'LIGHT'], lift: ['impact', 'LIGHT'],
    capture: ['impact', 'MEDIUM'], terrain: ['impact', 'HEAVY'],
    check: ['notification', 'WARNING'], wrong: ['notification', 'ERROR'],
    win: ['notification', 'SUCCESS'], draw: ['notification', 'SUCCESS'],
    wildready: ['impact', 'MEDIUM'], notify: ['impact', 'LIGHT'],
  };
  function buzz(name) {
    const b = BUZZ[name];
    if (!b || !Haptics) return;
    try {
      if (b[0] === 'impact') Haptics.impact({ style: b[1] });
      else Haptics.notification({ type: b[1] });
    } catch (e) {}
  }
  if (window.WCSOUND && typeof WCSOUND.play === 'function') {
    const play = WCSOUND.play;
    WCSOUND.play = function (name) { buzz(name); return play.apply(this, arguments); };
  }

  // ---- Android back button --------------------------------------------------
  // Back closes whatever is open (promotion picker, panels), the way Esc does
  // on a laptop. With nothing open it backgrounds the app rather than quitting,
  // so a game in progress is never thrown away by one stray press.
  if (App) {
    App.addListener('backButton', function () {
      const open = document.querySelector('#promoPick.show, #authModal.show, #feedback.show, #profile.show, #lobby.show');
      if (open) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      try { App.minimizeApp(); } catch (e) {}
    });
  }

  // ---- invites go through the share sheet ------------------------------------
  // "Copy" is a desktop habit; on a phone the link should go straight into
  // WhatsApp or Messages. Capture-phase listeners run before the copy handlers.
  function shareFirst(btnId, inputId, text) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input || !Share) return;
    btn.textContent = 'Share';
    btn.addEventListener('click', function (e) {
      if (!input.value) return;
      e.stopImmediatePropagation(); e.preventDefault();
      Share.share({ title: 'Hollow Chess', text: text, url: input.value, dialogTitle: 'Send the link' })
        .catch(function () {});
    }, true);
  }
  shareFirst('copyRoom', 'roomLink', 'Play me at Hollow Chess, the chess game where you can move the board:');
  shareFirst('copyLink', 'shareLink', 'Your move in our Hollow Chess game:');

  // ---- chrome -------------------------------------------------------------
  function paintStatusBar() {
    const light = document.body.classList.contains('light');
    // LIGHT = dark clock/battery icons, for our light cream page; DARK = light icons.
    const style = light ? 'LIGHT' : 'DARK';
    try { if (SystemBars) SystemBars.setStyle({ style: style }).catch(function () {}); } catch (e) {}
    try {
      if (StatusBar) {
        StatusBar.setStyle({ style: style }).catch(function () {});
        StatusBar.setBackgroundColor({ color: light ? '#f6efe2' : '#0f1d1c' }).catch(function () {});
      }
    } catch (e) {}
  }
  paintStatusBar();
  new MutationObserver(paintStatusBar).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // The page is ready: drop the splash.
  if (SplashScreen) { try { SplashScreen.hide(); } catch (e) {} }
})();
