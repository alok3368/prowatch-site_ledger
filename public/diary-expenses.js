// Panel: supervisor money entries from the Site Diary. Pending entries are added to the Ledger only when someone here approves them.
(function () {
  if (window.__deLoaded) return; window.__deLoaded = true;
  var T = {
    hi: { btn: 'डायरी खर्च', title: 'डायरी खर्च (सुपरवाइज़र की एंट्री)', pending: 'मंज़ूरी बाकी', all: 'सभी (45 दिन)', loading: 'लोड हो रहा है…', none: 'कोई खर्च मंज़ूरी के लिए बाकी नहीं', noneAll: 'कोई खर्च नहीं', close: 'बंद करें', failed: 'डायरी से जानकारी नहीं मिली',
      approve: 'Ledger में जोड़ें', reject: 'वापस भेजें', project: 'प्रोजेक्ट', pickProject: '- प्रोजेक्ट चुनें -', needProject: 'पहले प्रोजेक्ट चुनें', noRcpt: 'रसीद नहीं', noLoc: 'लोकेशन नहीं', weak: 'लोकेशन कमज़ोर', map: 'मैप', by: 'लिखा', synced: 'बाद में सिंक हुआ',
      st_pending: 'मंज़ूरी बाकी', st_approved: 'Ledger में जुड़ा', st_rejected: 'वापस', st_cancelled: 'रद्द', c_wages: 'मज़दूरी', c_material: 'सामान', c_petrol: 'पेट्रोल', c_misc: 'अन्य', rejectWhy: 'वापस भेजने का कारण (सुपरवाइज़र को दिखेगा, खाली छोड़ सकते हैं):', working: 'हो रहा है…',
      done: 'Ledger में जुड़ गया', partial: 'Ledger में जुड़ गया, पर डायरी में स्थिति अपडेट नहीं हुई - दोबारा "Ledger में जोड़ें" दबाएं (दोबारा नहीं जुड़ेगा)', saveFail: 'Ledger में सेव नहीं हुआ - कुछ नहीं जुड़ा', notReady: 'Ledger अभी लोड हो रहा है - थोड़ी देर बाद कोशिश करें',
      wageNote: 'मज़दूरी यहाँ सिर्फ़ एक खर्च की तरह जुड़ेगी। अगर यही मज़दूरी श्रम पेज से भी चुकाते हैं तो दो बार गिनी जाएगी।', rule: 'मंज़ूर करने पर ही खर्च Ledger में जुड़ता है (नकद, चुकाया हुआ)।', ref: 'डायरी' },
    en: { btn: 'Diary expenses', title: 'Diary expenses (supervisor entries)', pending: 'Pending', all: 'All (45 days)', loading: 'Loading…', none: 'Nothing waiting for approval', noneAll: 'No expenses', close: 'Close', failed: 'Could not get data from the Diary',
      approve: 'Add to Ledger', reject: 'Send back', project: 'Project', pickProject: '- choose project -', needProject: 'Choose a project first', noRcpt: 'No receipt', noLoc: 'No location', weak: 'Weak location', map: 'Map', by: 'By', synced: 'Synced later',
      st_pending: 'Pending', st_approved: 'In Ledger', st_rejected: 'Sent back', st_cancelled: 'Cancelled', c_wages: 'Wages', c_material: 'Material', c_petrol: 'Petrol', c_misc: 'Misc', rejectWhy: 'Reason for sending back (the supervisor sees it; may be left empty):', working: 'Working…',
      done: 'Added to the Ledger', partial: 'Added to the Ledger, but the Diary status was not updated - press "Add to Ledger" again (it will not be added twice)', saveFail: 'Not saved to the Ledger - nothing was added', notReady: 'The Ledger is still loading - try again in a moment',
      wageNote: 'Wages are added here as a plain expense. If you also settle the same wages on the Labour page, they will count twice.', rule: 'An expense is added to the Ledger only when you approve it (cash, paid).', ref: 'Diary' }
  };
  var LCAT = { wages: 'मजदूरी', material: 'मटेरियल', petrol: 'ट्रांसपोर्ट/ईंधन', misc: 'अन्य खर्च' };
  var ICON = { wages: '👷', material: '🧱', petrol: '⛽', misc: '📦' };
  var S = { tab: 'pending', data: null, loading: false, error: false, msg: null, busy: null, photo: null, proj: {} };
  function lang() { return localStorage.getItem('siteledger_lang') === 'en' ? 'en' : 'hi'; }
  function t(k) { return T[lang()][k] || T.en[k] || k; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtTime(iso) { var d = new Date(new Date(iso).getTime() + 5.5 * 3600e3), h = d.getUTCHours(), m = d.getUTCMinutes(); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ', ' + (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function ledgerReady() { try { return typeof state !== 'undefined' && state && Array.isArray(state.transactions) && Array.isArray(state.projects) && typeof saveState === 'function'; } catch (e) { return false; } }
  function siteOf(id) { return ((S.data && S.data.sites) || []).filter(function (s) { return s.id === id; })[0]; }
  function projectFor(it) {
    if (S.proj[it.id] !== undefined) return S.proj[it.id];
    if (!ledgerReady()) return '';
    var site = siteOf(it.siteId); if (!site) return '';
    var projs = state.projects || [];
    var p = projs.filter(function (x) { return site.ledgerProjectId && x.id === site.ledgerProjectId; })[0];
    if (!p) { var m = projs.filter(function (x) { return norm(x.name) === norm(site.name); }); if (m.length === 1) p = m[0]; }
    return p ? p.id : '';
  }

  var btn = document.createElement('button');
  btn.id = 'de-open'; btn.type = 'button';
  btn.style.cssText = 'position:fixed;right:12px;bottom:62px;z-index:9997;background:#8a5a00;color:#fff;border:0;border-radius:999px;padding:11px 16px;font:700 14px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer';
  var panel = document.createElement('div');
  panel.id = 'de-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:12px;font:14px system-ui;color:#1d2420';
  function pendingCount() { return S.data ? S.data.items.filter(function (i) { return i.status === 'pending'; }).length : null; }
  function paintBtn() { var n = pendingCount(); btn.textContent = '💰 ' + t('btn') + (n ? ' (' + n + ')' : ''); }

  function load(quiet) {
    if (!quiet) { S.loading = true; S.error = false; render(); }
    return fetch('/api/diary-expenses?status=' + (S.tab === 'all' ? 'all' : 'pending'), { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { ok: false }; }).then(function (j) {
      S.loading = false;
      if (!j || !j.ok) { if (!quiet) { S.error = true; S.data = null; } } else { S.error = false; if (S.tab === 'pending' || !S.data) S.data = j; else S.data = j; }
      render();
    }).catch(function () { S.loading = false; if (!quiet) S.error = true; render(); });
  }
  function chip(st) {
    var c = { pending: '#fff1c9;color:#7a5800', approved: '#dcefe0;color:#1d4a2b', rejected: '#f6d9d4;color:#8a2a22', cancelled: '#e6e2d6;color:#666' }[st] || '#eee;color:#333';
    return '<span style="background:' + c + ';border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700">' + esc(t('st_' + st)) + '</span>';
  }
  function card(it) {
    var site = siteOf(it.siteId), pu = it.photoUrl ? it.photoUrl.replace('/api/internal/txn-photo/', '/api/diary-expenses/photo/') : '';
    var fl = [];
    if (!pu) fl.push('⚠ ' + t('noRcpt'));
    if (it.geoStatus === 'weak') fl.push('⚠ ' + t('weak')); else if (it.geoStatus !== 'ok') fl.push('⚠ ' + t('noLoc'));
    if (it.createdAt && it.txnAt && (new Date(it.createdAt) - new Date(it.txnAt)) > 15 * 60e3) fl.push('⏳ ' + t('synced'));
    var h = '<div style="display:flex;gap:10px;padding:12px 0;border-top:1px solid #eee">' +
      (pu ? '<img data-de="photo" data-src="' + esc(pu) + '" src="' + esc(pu) + '" alt="" loading="lazy" style="width:72px;height:72px;border-radius:10px;object-fit:cover;cursor:pointer;flex:none;background:#ddd">' : '<div style="width:72px;height:72px;border-radius:10px;background:#f1ecdc;display:flex;align-items:center;justify-content:center;font-size:26px;flex:none">' + ICON[it.category] + '</div>') +
      '<div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:19px">' + esc(money(it.amount)) + '</b><span style="font-weight:700">' + ICON[it.category] + ' ' + esc(t('c_' + it.category)) + '</span>' + chip(it.status) + '</div>' +
      (it.note ? '<div style="margin-top:2px">' + esc(it.note) + '</div>' : '') +
      '<div style="font-size:12.5px;color:#6b6350;margin-top:2px">' + esc(site ? site.name : '') + ' · ' + esc(fmtTime(it.txnAt)) + (it.markedByName ? ' · ' + esc(t('by')) + ' ' + esc(it.markedByName) : '') + '</div>' +
      (fl.length ? '<div style="font-size:12px;color:#a05a00;margin-top:2px">' + fl.map(esc).join(' · ') + '</div>' : '') +
      (it.lat != null ? '<a href="https://maps.google.com/?q=' + esc(it.lat) + ',' + esc(it.lng) + '" target="_blank" rel="noopener" style="font-weight:700;color:#1f5f8a;font-size:13px">📍 ' + esc(t('map')) + '</a>' : '');
    if (it.status === 'rejected' && it.decisionNote) h += '<div style="font-size:12.5px;color:#8a2a22;margin-top:2px">↩ ' + esc(it.decisionNote) + '</div>';
    if (it.status === 'pending') {
      var pid = projectFor(it), projs = ledgerReady() ? state.projects : [];
      h += '<div style="margin-top:8px"><label style="font-size:12.5px;color:#6b6350">' + esc(t('project')) + '<br><select data-de="proj" data-id="' + esc(it.id) + '" style="padding:8px;border-radius:8px;border:1.5px solid ' + (pid ? '#cfc6b0' : '#c9a227') + ';min-width:200px;max-width:100%"><option value="">' + esc(t('pickProject')) + '</option>' +
        projs.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label></div>';
      if (it.category === 'wages') h += '<div style="font-size:12px;color:#8a5a00;margin-top:6px;background:#fff4d6;border-radius:8px;padding:6px 8px">' + esc(t('wageNote')) + '</div>';
      h += '<div style="display:flex;gap:8px;margin-top:10px"><button data-de="approve" data-id="' + esc(it.id) + '" style="flex:1;border:0;background:#1f6b3a;color:#fff;border-radius:10px;padding:11px;font:700 14px system-ui;cursor:pointer"' + (S.busy ? ' disabled' : '') + '>✔ ' + esc(S.busy === it.id ? t('working') : t('approve')) + '</button>' +
        '<button data-de="reject" data-id="' + esc(it.id) + '" style="border:1.5px solid #a03030;background:#fff;color:#a03030;border-radius:10px;padding:11px 14px;font:700 14px system-ui;cursor:pointer"' + (S.busy ? ' disabled' : '') + '>↩ ' + esc(t('reject')) + '</button></div>';
    }
    return h + '</div></div>';
  }
  function render() {
    paintBtn();
    var h = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;padding:16px;margin:auto 0">';
    h += '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px;flex:1">💰 ' + esc(t('title')) + '</b><button data-de="close" style="border:0;background:#eee;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">' + esc(t('close')) + '</button></div>';
    h += '<div style="font-size:12px;color:#6b6350;margin:4px 0 10px">' + esc(t('rule')) + '</div>';
    h += '<div style="display:flex;gap:6px;margin-bottom:8px">' + ['pending', 'all'].map(function (k) { var on = S.tab === k; return '<button data-de="tab" data-tab="' + k + '" style="border:1.5px solid #1f332f;background:' + (on ? '#1f332f' : '#fff') + ';color:' + (on ? '#fff' : '#1f332f') + ';border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer">' + esc(t(k)) + '</button>'; }).join('') + '</div>';
    if (S.msg) h += '<div style="padding:10px 12px;border-radius:10px;margin-bottom:8px;background:' + (S.msg.ok ? '#e8f4ea' : '#fff4d6') + '">' + esc(S.msg.text) + '</div>';
    if (S.loading && !S.data) h += '<div style="padding:30px;text-align:center">' + esc(t('loading')) + '</div>';
    else if (S.error || !S.data) h += '<div style="padding:20px;color:#a05a00">⚠ ' + esc(t('failed')) + '</div>';
    else {
      var items = S.tab === 'pending' ? S.data.items.filter(function (i) { return i.status === 'pending'; }) : S.data.items;
      h += items.length ? items.map(card).join('') : '<div style="padding:18px;background:#f6f1e3;border-radius:10px">' + esc(t(S.tab === 'pending' ? 'none' : 'noneAll')) + '</div>';
    }
    h += '</div>';
    if (S.photo) h += '<div data-de="photoclose" style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px"><img src="' + esc(S.photo) + '" style="max-width:100%;max-height:100%;border-radius:8px"></div>';
    panel.innerHTML = h;
  }
  function decide(id, body) {
    return fetch('/api/diary-expenses/' + encodeURIComponent(id) + '/decision', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).catch(function (e) { return { ok: false, error: e.message }; });
  }
  async function approve(id) {
    var it = S.data.items.filter(function (i) { return i.id === id; })[0]; if (!it || S.busy) return;
    if (!ledgerReady()) { S.msg = { ok: false, text: t('notReady') }; render(); return; }
    var pid = projectFor(it);
    if (!pid) { S.msg = { ok: false, text: t('needProject') }; render(); return; }
    S.busy = id; S.msg = null; render();
    var existing = state.transactions.filter(function (x) { return x.diaryTxnId === id; })[0];
    var tx = existing;
    if (!existing) {
      var cat = LCAT[it.category] || LCAT.misc;
      if (state.categories && Array.isArray(state.categories.expense) && state.categories.expense.indexOf(cat) < 0) state.categories.expense.push(cat);
      var site = siteOf(it.siteId);
      tx = {
        id: uid('t'), date: it.date, project: pid, type: 'Expense', category: cat, party: null,
        desc: T[lang()].ref + ' - ' + (it.note || T[lang()]['c_' + it.category]) + (it.markedByName ? ' (' + it.markedByName + ')' : ''),
        amount: it.amount, gst: 0, mode: PAY_MODES[0], status: 'भुगतान हो गया', ref: 'D-' + id.slice(0, 8),
        createdBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : null, diaryTxnId: id, diarySite: site ? site.name : null
      };
      state.transactions.push(tx);
      var saved = false;
      try { saved = await saveState(); } catch (e) { saved = false; }
      if (!saved) { state.transactions = state.transactions.filter(function (x) { return x !== tx; }); S.busy = null; S.msg = { ok: false, text: t('saveFail') }; render(); return; }
    }
    var d = await decide(id, { status: 'approved', ledgerTxId: tx.id });
    S.busy = null;
    if (d && d.ok) { S.msg = { ok: true, text: '✔ ' + money(it.amount) + ' - ' + t('done') }; } else { S.msg = { ok: false, text: t('partial') + (d && d.error ? ' (' + d.error + ')' : '') }; }
    await load(true);
  }
  async function reject(id) {
    if (S.busy) return;
    var why = window.prompt(t('rejectWhy'), ''); if (why === null) return;
    S.busy = id; S.msg = null; render();
    var d = await decide(id, { status: 'rejected', note: String(why).trim().slice(0, 200) });
    S.busy = null;
    S.msg = d && d.ok ? { ok: true, text: '↩ ' + t('st_rejected') } : { ok: false, text: t('failed') + (d && d.error ? ' (' + d.error + ')' : '') };
    await load(true);
  }
  panel.addEventListener('click', function (e) {
    var el = e.target.closest('[data-de]'); if (!el) { if (e.target === panel) panel.style.display = 'none'; return; }
    var a = el.getAttribute('data-de');
    if (a === 'close') { panel.style.display = 'none'; if (typeof window.render === 'function') { try { window.render(); } catch (x) { } } }
    else if (a === 'tab') { S.tab = el.getAttribute('data-tab'); S.msg = null; load(); }
    else if (a === 'photo') { S.photo = el.getAttribute('data-src'); render(); }
    else if (a === 'photoclose') { S.photo = null; render(); }
    else if (a === 'approve') approve(el.getAttribute('data-id'));
    else if (a === 'reject') reject(el.getAttribute('data-id'));
  });
  panel.addEventListener('change', function (e) {
    if (e.target.getAttribute && e.target.getAttribute('data-de') === 'proj') { S.proj[e.target.getAttribute('data-id')] = e.target.value; render(); }
  });
  btn.addEventListener('click', function () { panel.style.display = 'flex'; S.photo = null; S.msg = null; load(); });
  function mount() { paintBtn(); document.body.appendChild(btn); document.body.appendChild(panel); setTimeout(function () { S.tab = 'pending'; load(true); }, 2500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
