// Ledger data-safety: fail closed on load error, loud save errors, revision conflict protection.
// Loaded after the main script; its function declarations replace loadState/saveState.
(function(){
Object.assign(T.hi,{
    saveFailedBanner:'⚠️ आपका आख़िरी बदलाव सेव नहीं हुआ। इंटरनेट जांचें और दोबारा कोशिश करें।', retrySave:'दोबारा सेव करें',
    saveConflictBanner:'⚠️ किसी और ने इस बीच लेजर बदल दिया है। आपका आख़िरी बदलाव सेव नहीं हुआ। ताज़ा डेटा लोड करें (आपका बिना-सेव बदलाव हट जाएगा), फिर दोबारा करें।', reloadLatest:'ताज़ा डेटा लोड करें',
    loadFailedTitle:'लेजर लोड नहीं हो पाया', loadFailedBody:'सर्वर से आपका डेटा नहीं आ पाया। आपका असली डेटा सुरक्षित है, कुछ भी बदला नहीं गया है। दोबारा कोशिश करें।', retryLoad:'दोबारा कोशिश करें'
});
Object.assign(T.en,{
    saveFailedBanner:'⚠️ Your last change was NOT saved. Check your internet and try again.', retrySave:'Retry save',
    saveConflictBanner:'⚠️ Someone else changed the ledger in the meantime. Your last change was NOT saved. Load the latest data (your unsaved change will be discarded), then redo it.', reloadLatest:'Load latest data',
    loadFailedTitle:'Could not load the ledger', loadFailedBody:'Your data could not be fetched from the server. Your real data is safe and nothing was changed. Please try again.', retryLoad:'Try again'
});
})();
let stateRevision = 0;   // server revision our in-memory state was loaded from / last saved as
let saveBlocked = false; // true after a revision conflict: no further saves until the latest data is loaded
function showLoadError(){
  document.getElementById('app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;">
      <div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:32px 36px;text-align:center;max-width:380px;">
        <div style="font-weight:700;font-size:18px;margin-bottom:10px;">${tr('loadFailedTitle')}</div>
        <div style="color:var(--ink-soft);font-size:13.5px;margin-bottom:20px;">${tr('loadFailedBody')}</div>
        <button class="btn amber" id="retry-load">${tr('retryLoad')}</button>
      </div>
    </div>`;
  document.getElementById('retry-load').addEventListener('click', async ()=>{ if(await loadState()) render(); else showLoadError(); });
}
function setSaveBanner(kind){
  let el = document.getElementById('save-banner');
  if(!kind){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('div'); el.id='save-banner'; document.body.appendChild(el); }
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#B33A2B;color:#fff;padding:10px 14px;font-size:14px;font-weight:600;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  const conflict = kind==='conflict';
  el.innerHTML = `${conflict?tr('saveConflictBanner'):tr('saveFailedBanner')} <button id="save-banner-btn" style="margin-left:10px;padding:5px 12px;border-radius:6px;border:0;font-weight:700;cursor:pointer;">${conflict?tr('reloadLatest'):tr('retrySave')}</button>`;
  document.getElementById('save-banner-btn').onclick = async ()=>{
    if(conflict){ location.reload(); return; }
    if(await saveState()) render();
  };
}
async function loadState(){
  try{
    const res = await fetch('/api/state', {credentials:'include'});
    if(res.status===204){
      // the server confirms there is no ledger yet -> seed it once (only succeeds if still empty)
      state = seedData();
      stateRevision = 0;
      await saveState();
      return true;
    }
    if(!res.ok) throw new Error('load failed: '+res.status);
    const loaded = await res.json();
    if(!loaded || !Array.isArray(loaded.transactions) || !Array.isArray(loaded.projects) || !Array.isArray(loaded.parties)) throw new Error('load failed: unexpected data');
    state = loaded;
    stateRevision = (loaded._meta && Number.isInteger(loaded._meta.revision)) ? loaded._meta.revision : 0;
    saveBlocked = false;
  }catch(e){
    // fail closed: never replace the real books with sample data
    console.error('loadState failed', e);
    state = null;
    return false;
  }
  // migration: older saved data may not have custom categories yet
  let changed = false;
  if(!state.categories){ state.categories = {income:[...DEFAULT_CATS_INCOME], expense:[...DEFAULT_CATS_EXPENSE]}; changed = true; }
  if(!state.categories.income) { state.categories.income = [...DEFAULT_CATS_INCOME]; changed = true; }
  if(!state.categories.expense) { state.categories.expense = [...DEFAULT_CATS_EXPENSE]; changed = true; }
  // make sure any category already used in existing transactions is present in the list
  state.transactions.forEach(t=>{
    const key = t.type==='Income'?'income':'expense';
    if(t.category && !state.categories[key].includes(t.category)){ state.categories[key].push(t.category); changed = true; }
  });
  // migration: quotations & invoicing feature
  if(!state.quotations){ state.quotations = []; changed = true; }
  if(!state.invoices){ state.invoices = []; changed = true; }
  if(!state.counters){ state.counters = {quote:1, invoice:1, po:1}; changed = true; }
  if(state.counters && state.counters.po===undefined){ state.counters.po = 1; changed = true; }
  if(!state.purchaseOrders){ state.purchaseOrders = []; changed = true; }
  if(!state.raBills){ state.raBills = []; changed = true; }
  if(!state.retentions){ state.retentions = []; changed = true; }
  if(!state.labourers){ state.labourers = []; changed = true; }
  if(!state.attendance){ state.attendance = []; changed = true; }
  if(!state.materials){ state.materials = []; changed = true; }
  if(!state.stockEntries){ state.stockEntries = []; changed = true; }
  state.parties.forEach(p=>{ if(p.phone===undefined){ p.phone = p.contact || ''; changed = true; } });
  if(state.counters && state.counters.ra===undefined){ state.counters.ra = 1; changed = true; }
  state.projects.forEach(p=>{ if(!p.boq){ p.boq = []; changed = true; } });
  if(!state.businessProfile){ state.businessProfile = {name:'', address:'', gstin:'', phone:'', email:''}; changed = true; }
  if(changed) await saveState();
}
async function saveState(){
  if(saveBlocked){ setSaveBanner('conflict'); return false; }
  try{
    const res = await fetch('/api/state', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(Object.assign({}, state, {baseRevision: stateRevision})),
    });
    if(res.status===409){ saveBlocked = true; setSaveBanner('conflict'); return false; }
    if(!res.ok) throw new Error('save failed: '+res.status);
    const data = await res.json();
    if(data.meta){ state._meta = data.meta; if(Number.isInteger(data.meta.revision)) stateRevision = data.meta.revision; }
    setSaveBanner(null);
    return true;
  }catch(e){ console.error('save failed', e); setSaveBanner('failed'); return false; }
}


// with no loaded ledger, any render shows the retry screen instead of crashing
(function(){ const r = window.render; window.render = function(){ if(!state){ showLoadError(); return; } return r.apply(this, arguments); }; })();
