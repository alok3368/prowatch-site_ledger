// Panel: Site Diary attendance with photo, time and location. Read-only. Does not write to the Ledger.
(function () {
  if (window.__daLoaded) return; window.__daLoaded = true;
  var T = {
    hi: { btn: 'डायरी हाज़िरी', title: 'डायरी हाज़िरी (फोटो · समय · लोकेशन)', site: 'साइट', date: 'तारीख़', present: 'आए', half: 'आधा दिन', sup: 'सुपरवाइज़र', loading: 'लोड हो रहा है…', none: 'इस दिन डायरी में कोई हाज़िरी नहीं', close: 'बंद करें',
      noLoc: 'लोकेशन नहीं', weak: 'लोकेशन कमज़ोर', late: 'बाद में सिंक हुआ', map: 'मैप', time: 'समय', ledger: 'Ledger श्रम पेज', ledgerNone: 'Ledger के श्रम पेज में इस दिन हाज़िरी दर्ज नहीं', ledgerLine: 'Ledger श्रम पेज', crewNote: '(सुपरवाइज़र छोड़कर)', diaryLine: 'डायरी (फोटो से पक्की)', failed: 'डायरी से जानकारी नहीं मिली', last7: 'पिछले 7 दिन', readonly: 'सिर्फ़ देखने के लिए - Ledger की मज़दूरी या हाज़िरी में कुछ नहीं बदलता', by: 'लगाई', noSites: 'डायरी में कोई साइट नहीं' },
    en: { btn: 'Diary attendance', title: 'Diary attendance (photo · time · location)', site: 'Site', date: 'Date', present: 'Present', half: 'Half day', sup: 'Supervisor', loading: 'Loading…', none: 'No Diary attendance on this day', close: 'Close',
      noLoc: 'No location', weak: 'Weak location', late: 'Synced later', map: 'Map', time: 'Time', ledger: 'Ledger Labour page', ledgerNone: 'No attendance entered in the Ledger Labour page for this day', ledgerLine: 'Ledger Labour page', crewNote: '(excl. supervisor)', diaryLine: 'Diary (photo-verified)', failed: 'Could not get data from the Diary', last7: 'Last 7 days', readonly: 'View only - nothing here changes Ledger wages or attendance', by: 'Marked by', noSites: 'No sites in the Diary' }
  };
  var ROLE = { supervisor: ['सुपरवाइज़र', 'Supervisor'], labour: ['मज़दूर', 'Labour'], helper: ['हेल्पर', 'Helper'], mason: ['मिस्त्री', 'Mason'], carpenter: ['बढ़ई', 'Carpenter'], painter: ['पेंटर', 'Painter'], other: ['अन्य', 'Other'] };
  var ORDER = ['supervisor', 'labour', 'helper', 'mason', 'carpenter', 'painter', 'other'];
  var S = { date: istToday(), anchor: istToday(), siteId: null, data: null, ledger: null, loading: false, error: false, photo: null };
  function lang() { return localStorage.getItem('siteledger_lang') === 'en' ? 'en' : 'hi'; }
  function t(k) { return T[lang()][k] || T.en[k] || k; }
  function role(r) { var x = ROLE[r] || ROLE.other; return lang() === 'hi' ? x[0] : x[1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function istToday() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function fmtTime(iso) { var d = new Date(new Date(iso).getTime() + 5.5 * 3600e3), h = d.getUTCHours(), m = d.getUTCMinutes(); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function fmtDay(d) { var x = new Date(d + 'T00:00:00Z'); return x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()]; }
  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  var btn = document.createElement('button');
  btn.id = 'da-open'; btn.type = 'button';
  btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9997;background:#1f332f;color:#fff;border:0;border-radius:999px;padding:11px 16px;font:700 14px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer';
  var panel = document.createElement('div');
  panel.id = 'da-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:12px;font:14px system-ui;color:#1d2420';
  function paintBtn() { btn.textContent = '📷 ' + t('btn'); }

  function load() {
    S.loading = true; S.error = false; S.anchor = S.date; render();
    var from = addDays(S.anchor, -6);
    var p1 = fetch('/api/diary-attendance?from=' + from + '&to=' + S.anchor, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : { ok: false }; });
    var p2 = fetch('/api/state', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    Promise.all([p1, p2]).then(function (a) {
      S.loading = false;
      if (!a[0] || !a[0].ok) { S.error = true; S.data = null; } else { S.data = a[0]; }
      S.ledger = a[1];
      if (S.data && (!S.siteId || !S.data.sites.some(function (s) { return s.id === S.siteId; }))) {
        var withData = S.data.days.filter(function (d) { return d.date === S.date; })[0];
        S.siteId = withData ? withData.siteId : (S.data.sites[0] && S.data.sites[0].id) || null;
      }
      render();
    }).catch(function () { S.loading = false; S.error = true; render(); });
  }
  function ledgerFor(site) {
    var st = S.ledger; if (!st || !site) return null;
    var projs = st.projects || [];
    var proj = projs.filter(function (p) { return site.ledgerProjectId && p.id === site.ledgerProjectId; })[0];
    if (!proj) { var m = projs.filter(function (p) { return norm(p.name) === norm(site.name); }); if (m.length === 1) proj = m[0]; }
    if (!proj) return null;
    var present = 0, half = 0, any = false;
    (st.attendance || []).forEach(function (a) { if (a.project === proj.id && a.date === S.date) { any = true; if (a.status === 'उपस्थित') present++; else if (a.status === 'आधा दिन') half++; } });
    return { name: proj.name, any: any, present: present, half: half };
  }
  function dayOf(siteId, date) { return ((S.data && S.data.days) || []).filter(function (d) { return d.siteId === siteId && d.date === date; })[0]; }
  function flagsOf(m) {
    var f = [];
    if (m.geoStatus === 'weak') f.push('⚠ ' + t('weak'));
    else if (m.geoStatus !== 'ok') f.push('⚠ ' + t('noLoc'));
    if (m.createdAt && m.markedAt && (new Date(m.createdAt) - new Date(m.markedAt)) > 15 * 60e3) f.push('⏳ ' + t('late'));
    return f;
  }
  function render() {
    paintBtn();
    var h = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;padding:16px;margin:auto 0">';
    h += '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px;flex:1">📷 ' + esc(t('title')) + '</b><button data-da="close" style="border:0;background:#eee;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">' + esc(t('close')) + '</button></div>';
    h += '<div style="font-size:12px;color:#6b6350;margin:4px 0 10px">' + esc(t('readonly')) + '</div>';
    if (S.loading && !S.data) { h += '<div style="padding:30px;text-align:center">' + esc(t('loading')) + '</div></div>'; panel.innerHTML = h; return; }
    if (S.error || !S.data) { h += '<div style="padding:20px;color:#a05a00">⚠ ' + esc(t('failed')) + '</div></div>'; panel.innerHTML = h; return; }
    var sites = S.data.sites;
    if (!sites.length) { h += '<div style="padding:20px">' + esc(t('noSites')) + '</div></div>'; panel.innerHTML = h; return; }
    var site = sites.filter(function (s) { return s.id === S.siteId; })[0] || sites[0];
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"><label>' + esc(t('site')) + '<br><select data-da="site" style="padding:8px;border-radius:8px;border:1px solid #cfc6b0;min-width:200px">' +
      sites.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === site.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + esc(t('date')) + '<br><input data-da="date" type="date" value="' + esc(S.date) + '" max="' + istToday() + '" style="padding:7px;border-radius:8px;border:1px solid #cfc6b0"></label></div>';
    // last 7 days strip
    h += '<div style="font-size:12px;color:#6b6350;margin-bottom:4px">' + esc(t('last7')) + '</div><div style="display:flex;gap:6px;overflow:auto;margin-bottom:12px">';
    for (var i = 6; i >= 0; i--) {
      var d = addDays(S.anchor, -i), dd = dayOf(site.id, d), n = dd ? dd.summary.present + dd.summary.half : 0, on = d === S.date;
      h += '<button data-da="day" data-d="' + d + '" style="flex:none;border:1.5px solid ' + (on ? '#1f332f' : '#cfc6b0') + ';background:' + (on ? '#1f332f' : '#fff') + ';color:' + (on ? '#fff' : '#1d2420') + ';border-radius:10px;padding:6px 10px;cursor:pointer;min-width:62px"><div style="font-size:11px">' + fmtDay(d) + '</div><div style="font:800 17px system-ui">' + n + '</div></button>';
    }
    h += '</div>';
    var day = dayOf(site.id, S.date);
    var lg = ledgerFor(site);
    if (!day) {
      h += '<div style="padding:18px;background:#f6f1e3;border-radius:10px">' + esc(t('none')) + '</div>';
    } else {
      var sum = day.summary, by = sum.byRole || {};
      h += '<div style="background:#1f332f;color:#fff;border-radius:12px;padding:12px 14px"><span style="font:800 30px system-ui">' + (sum.present + sum.half) + '</span> <span style="opacity:.85">' + esc(t('present')) + (sum.half ? ' · ' + sum.half + ' ' + esc(t('half')) : '') + '</span><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
        ORDER.filter(function (r) { return by[r]; }).map(function (r) { return '<span style="background:rgba(255,255,255,.15);border-radius:999px;padding:3px 10px;font-weight:700;font-size:13px">' + esc(role(r)) + ' ' + (by[r].present + by[r].half) + '</span>'; }).join('') + '</div></div>';
      if (lg) {
        var supN = by.supervisor ? by.supervisor.present + by.supervisor.half : 0, diffN = (sum.present + sum.half) - supN, ln = lg.present + lg.half;
        h += '<div style="margin-top:8px;padding:9px 12px;border-radius:10px;background:' + (lg.any && ln === diffN ? '#e8f4ea' : '#fff4d6') + ';font-size:13px"><b>' + esc(t('diaryLine')) + ':</b> ' + diffN + ' ' + esc(t('crewNote')) + ' &nbsp;·&nbsp; <b>' + esc(t('ledgerLine')) + ':</b> ' + (lg.any ? (lg.present + ' ' + esc(t('present')) + (lg.half ? ' + ' + lg.half + ' ' + esc(t('half')) : '')) : esc(t('ledgerNone'))) + '</div>';
      }
      var people = day.people.slice().sort(function (a, b) { return ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || String(a.markedAt).localeCompare(String(b.markedAt)); });
      h += '<div style="margin-top:10px">' + people.map(function (m) {
        var fl = flagsOf(m), pu = m.photoUrl ? m.photoUrl.replace('/api/internal/attendance-photo/', '/api/diary-attendance/photo/') : '';
        return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #eee">' +
          (pu ? '<img data-da="photo" data-src="' + esc(pu) + '" src="' + esc(pu) + '" alt="" loading="lazy" style="width:60px;height:60px;border-radius:10px;object-fit:cover;cursor:pointer;flex:none;background:#ddd">' : '<div style="width:60px;height:60px;border-radius:10px;background:#ddd;flex:none"></div>') +
          '<div style="flex:1;min-width:0"><div style="font-weight:800">' + esc(m.name) + ' <span style="font-weight:600;color:#6b6350;font-size:12.5px">' + esc(role(m.role)) + (m.status === 'half' ? ' · ' + esc(t('half')) : '') + '</span></div>' +
          '<div style="font-size:12.5px;color:#6b6350">' + esc(t('time')) + ': ' + esc(fmtTime(m.markedAt)) + (m.markedByName && m.kind === 'worker' ? ' · ' + esc(t('by')) + ' ' + esc(m.markedByName) : '') + '</div>' +
          (fl.length ? '<div style="font-size:12px;color:#a05a00">' + fl.map(esc).join(' · ') + '</div>' : '') + '</div>' +
          (m.lat != null ? '<a href="https://maps.google.com/?q=' + esc(m.lat) + ',' + esc(m.lng) + '" target="_blank" rel="noopener" style="flex:none;font-weight:700;color:#1f5f8a">📍 ' + esc(t('map')) + '</a>' : '') + '</div>';
      }).join('') + '</div>';
    }
    h += '</div>';
    if (S.photo) h += '<div data-da="photoclose" style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px"><img src="' + esc(S.photo) + '" style="max-width:100%;max-height:100%;border-radius:10px"></div>';
    panel.innerHTML = h;
  }
  panel.addEventListener('click', function (e) {
    var el = e.target.closest('[data-da]'); if (!el) { if (e.target === panel) { panel.style.display = 'none'; } return; }
    var a = el.getAttribute('data-da');
    if (a === 'close') panel.style.display = 'none';
    else if (a === 'day') { S.date = el.getAttribute('data-d'); render(); }
    else if (a === 'photo') { S.photo = el.getAttribute('data-src'); render(); }
    else if (a === 'photoclose') { S.photo = null; render(); }
  });
  panel.addEventListener('change', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-da');
    if (a === 'site') { S.siteId = e.target.value; render(); }
    else if (a === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { S.date = e.target.value; load(); }
  });
  btn.addEventListener('click', function () { panel.style.display = 'flex'; S.date = istToday(); S.photo = null; load(); });
  function mount() { paintBtn(); document.body.appendChild(btn); document.body.appendChild(panel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
