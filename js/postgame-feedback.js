// A short, optional survey on the game-over screen. No account or new table.
(function () {
  'use strict';
  function create(root, send) {
    const choices = Array.from(root.querySelectorAll('[data-reaction]'));
    const note = root.querySelector('textarea');
    const submit = root.querySelector('[data-send]');
    const dismiss = root.querySelector('[data-dismiss]');
    const message = root.querySelector('[role="status"]');
    const fields = root.querySelector('[data-fields]');
    let reaction = '', context = null, pending = false, sent = false, generation = 0;
    const labels = { loved: 'Loved it', okay: 'It was okay', frustrating: 'It was frustrating' };
    function select(value) {
      if (pending || sent) return;
      reaction = value;
      choices.forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.reaction === value)); });
      submit.disabled = !reaction;
    }
    choices.forEach(function (button) { button.addEventListener('click', function () { select(button.dataset.reaction); }); });
    dismiss.addEventListener('click', hide);
    submit.addEventListener('click', async function () {
      if (!context || !reaction || pending || sent) return;
      const current = generation;
      const comment = note.value.trim().slice(0, 900);
      const entry = {
        kind: reaction === 'frustrating' ? 'confusing' : 'fun',
        body: 'After my game: ' + labels[reaction] + '.' + (comment ? '\n' + comment : ''),
        context: Object.assign({}, context, { source: 'post_game', reaction: reaction }),
      };
      pending = true;
      submit.disabled = true; submit.textContent = 'Sending…';
      choices.forEach(function (button) { button.disabled = true; });
      note.disabled = true;
      message.textContent = 'Sending your feedback…';
      let result;
      try { result = await send(entry); } catch (_) { result = { ok: false }; }
      // A response for an old game must never change the next game's panel.
      if (current !== generation) return;
      pending = false;
      if (result && result.ok) {
        sent = true; fields.hidden = true;
        message.textContent = 'Thanks! Your feedback helps shape Hollow Chess.';
        dismiss.textContent = 'Close';
      } else {
        message.textContent = 'Could not send. Your note is still here—please try again when you are connected.';
        choices.forEach(function (button) { button.disabled = false; });
        note.disabled = false; submit.disabled = false; submit.textContent = 'Try again';
      }
    });
    function hide() { generation++; context = null; pending = false; root.hidden = true; }
    function show(details) {
      generation++; context = Object.assign({}, details); reaction = ''; pending = false; sent = false;
      note.value = ''; note.disabled = false; fields.hidden = false;
      choices.forEach(function (button) { button.disabled = false; button.setAttribute('aria-pressed', 'false'); });
      submit.disabled = true; submit.textContent = 'Send feedback'; dismiss.textContent = 'Not now';
      message.textContent = 'Sent privately to the developer. No account needed.';
      root.hidden = false;
    }
    return { show: show, hide: hide };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create: create };
  if (typeof window !== 'undefined') {
    const root = document.getElementById('postgameFeedback');
    if (root) window.WCPOSTGAME = create(root, function (entry) { return window.WCCLOUD.sendFeedback(entry); });
  }
})();
