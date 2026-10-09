// Shows Diary <-> Ledger cross-check flags as a banner (bottom of the screen) for signed-in users.
(function () {
  if (window.__dcLoaded) return; window.__dcLoaded = true;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function run() {
    fetch('/api/diary-check', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.flags || !j.flags.length) return;
      var warns = j.flags.filter(function (f) { return f.level === 'warn'; });
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9998;max-width:360px;background:#fff8e6;color:#3b2f10;border:1px solid #e0b84c;border-radius:10px;padding:10px 12px;font:13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      var head = '<b>Diary check: ' + (warns.length ? warns.length + ' to review' : 'notes') + '</b> <a href="#" id="dc-t" style="float:right;color:#8a6d1a">hide</a>';
      var body = '<div id="dc-b" style="max-height:40vh;overflow:auto;margin-top:6px">' + j.flags.map(function (f) { return '<div style="padding:3px 0;border-top:1px solid #f0dfa8">' + (f.level === 'warn' ? '&#9888; ' : '&#8505; ') + esc(f.text) + '</div>'; }).join('') + '</div>';
      box.innerHTML = head + body; document.body.appendChild(box);
      document.getElementById('dc-t').onclick = function (e) { e.preventDefault(); var b = document.getElementById('dc-b'); var h = b.style.display === 'none'; b.style.display = h ? 'block' : 'none'; this.textContent = h ? 'hide' : 'show'; };
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
