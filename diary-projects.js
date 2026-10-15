// Pending Diary sites are kept outside the books until a Diary manager approves.
const crypto = require('crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateSite(s) {
  if (!s || !UUID.test(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 240) throw Object.assign(new Error('invalid_site'), { status: 400 });
  return { id:s.id, name:s.name.trim(), location:String(s.location || '').slice(0,500), ledgerProjectId:s.ledgerProjectId || null };
}
function authorizeKey(got) {
  const want=process.env.INTERNAL_KEY || '';
  return want.length>=16 && crypto.timingSafeEqual(crypto.createHash('sha256').update(want).digest(),crypto.createHash('sha256').update(String(got || '')).digest());
}
async function init(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS diary_project_requests (
    site_id UUID PRIMARY KEY, site_name TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved')),
    project_id TEXT UNIQUE, approved_by TEXT, approved_at TIMESTAMPTZ,
    diary_ack BOOLEAN NOT NULL DEFAULT false, last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}
async function propose(pool, raw) {
  const s=validateSite(raw);
  // Existing explicit links are imported only after confirming the target project exists.
  const {rows}=await pool.query(`INSERT INTO diary_project_requests(site_id,site_name,location)
    VALUES($1,$2,$3) ON CONFLICT(site_id) DO UPDATE SET site_name=EXCLUDED.site_name,
    location=EXCLUDED.location,updated_at=now() RETURNING *`,[s.id,s.name,s.location]);
  return rows[0];
}
function mount(app,pool,requireAuth) {
  const upstream=async(route, options={})=>{
    if(!process.env.INTERNAL_KEY)throw new Error('Diary connection is not configured');
    const r=await fetch((process.env.DIARY_URL || 'https://prowatch-site-diary.onrender.com').replace(/\/$/,'')+route,{
      ...options, headers:{'x-internal-key':process.env.INTERNAL_KEY,'content-type':'application/json',...(options.headers || {})},signal:AbortSignal.timeout(45000)});
    if(!r.ok)throw new Error('Diary request failed: '+r.status);
    return r.json();
  };
  const fail=(res,e)=>res.status(e.status || 503).json({ok:false,error:e.message});
  const sameOrigin=(req,res,next)=>{
    const origin=req.get('origin');
    if((origin && origin!==`${req.protocol}://${req.get('host')}`)||!req.is('application/json'))return res.status(403).json({error:'same_origin_json_required'});
    next();
  };
  const manager=async(req,res,next)=>{
    try{
      const access=await upstream('/api/internal/ledger-manager?email='+encodeURIComponent(req.user.email));
      if(!access.manager)return res.status(403).json({error:'manager_required'});
      next();
    }catch(e){fail(res,e);}
  };
  async function acknowledge(row) {
    try {
      await upstream('/api/internal/sites/'+row.site_id+'/ledger-link',{method:'POST',body:JSON.stringify({projectId:row.project_id})});
      await pool.query('UPDATE diary_project_requests SET diary_ack=true,last_error=NULL WHERE site_id=$1 AND project_id=$2',[row.site_id,row.project_id]);
      return true;
    } catch(e) {
      await pool.query('UPDATE diary_project_requests SET diary_ack=false,last_error=$2 WHERE site_id=$1',[row.site_id,e.message]);
      return false;
    }
  }
  app.post('/api/internal/diary-projects',async(req,res)=>{
    if(!authorizeKey(req.get('x-internal-key')))return res.status(401).json({error:'unauthorized'});
    try{res.json({ok:true,request:await propose(pool,req.body)});}catch(e){fail(res,e);}
  });
  // All authenticated ledger readers can see project links; approval is manager-only.
  app.get('/api/diary-projects',requireAuth,async(req,res)=>{
    let syncError=null;
    try{
      const d=await upstream('/api/internal/diary?from=2999-01-01&to=2999-01-01');
      for(const s of d.sites || []) {
        const row=await propose(pool,s);
        if(row.status==='approved' && !row.diary_ack)await acknowledge(row);
        // Existing sites enter the queue; even a legacy link needs explicit review here.
      }
      if(Array.isArray(d.sites))await pool.query("DELETE FROM diary_project_requests WHERE status='pending' AND NOT(site_id=ANY($1::uuid[]))",[d.sites.map(s=>s.id)]);
    }catch(e){syncError=e.message;}
    try{
      const {rows}=await pool.query('SELECT * FROM diary_project_requests ORDER BY created_at');
      res.set('Cache-Control','no-store').json({ok:true,requests:rows,syncError});
    }catch(e){fail(res,e);}
  });
  app.post('/api/diary-projects/:siteId/approve',requireAuth,sameOrigin,manager,async(req,res)=>{
    let client;let committed=false;
    try{
      if(!UUID.test(req.params.siteId))throw Object.assign(new Error('invalid_site'),{status:400});
      const {mode,projectId,project,baseRevision}=req.body || {};
      if(!['new','existing'].includes(mode)||!Number.isInteger(baseRevision))throw Object.assign(new Error('invalid_approval'),{status:400});
      const source=await upstream('/api/internal/diary?from=2999-01-01&to=2999-01-01');
      const sourceSite=(source.sites || []).find(s=>s.id===req.params.siteId);
      if(!sourceSite)throw Object.assign(new Error('site_no_longer_exists: refresh the queue'),{status:409});
      client=await pool.connect();await client.query('BEGIN');
      const q=await client.query('SELECT * FROM diary_project_requests WHERE site_id=$1 FOR UPDATE',[req.params.siteId]);
      if(!q.rows[0])throw Object.assign(new Error('site_not_found'),{status:404});
      let row=q.rows[0];
      if(row.status!=='approved') {
if(sourceSite.ledgerProjectId && (mode!=='existing'||projectId!==sourceSite.ledgerProjectId))throw Object.assign(new Error('site_already_linked: choose its existing project'),{status:409});

        const l=await client.query('SELECT data,revision FROM ledger_state WHERE id=1 FOR UPDATE');
        if(!l.rows[0]||l.rows[0].revision!==baseRevision)throw Object.assign(new Error('revision-conflict: reload the Ledger before approving'),{status:409});
        const state=l.rows[0].data;let target;
        if(mode==='existing')target=state.projects.find(p=>p.id===projectId);
        else {
          if(!project || !Number.isFinite(Date.parse(project.startDate+'T00:00:00Z')) || new Date(project.startDate+'T00:00:00Z').toISOString().slice(0,10)!==project.startDate || typeof project.name!=='string'||!project.name.trim()||project.name.length>240||typeof project.client!=='string'||!project.client.trim()||!Number.isFinite(project.contractValue)||project.contractValue<0||!/^\d{4}-\d{2}-\d{2}$/.test(project.startDate || ''))throw Object.assign(new Error('complete_project_details'),{status:400});
          if(state.projects.some(p=>p.name.trim().toLowerCase()===project.name.trim().toLowerCase()))throw Object.assign(new Error('project_name_exists: choose Link existing'),{status:409});
          target={id:'p_'+crypto.randomUUID(),name:project.name.trim(),client:project.client.trim(),location:row.location,contractValue:project.contractValue,startDate:project.startDate,status:'active'};
          state.projects.push(target);
        }
        if(!target)throw Object.assign(new Error('project_not_found'),{status:400});
        const assigned=await client.query('SELECT site_id FROM diary_project_requests WHERE project_id=$1',[target.id]);
        if(assigned.rows.length)throw Object.assign(new Error('project_already_linked'),{status:409});
        await client.query(`UPDATE ledger_state SET data=$1,revision=revision+1,last_edited_by=$2,last_edited_by_name=$3,last_edited_at=now() WHERE id=1`,[state,req.user.email,req.user.name || req.user.email]);
        const r=await client.query(`UPDATE diary_project_requests SET status='approved',project_id=$2,approved_by=$3,approved_at=now(),diary_ack=false WHERE site_id=$1 RETURNING *`,[row.site_id,target.id,req.user.email]);
        row=r.rows[0];
      }
      await client.query('COMMIT');committed=true;client.release();client=null;
      const diaryLinked=await acknowledge(row);
      res.json({ok:true,projectId:row.project_id,diaryLinked,message:diaryLinked?'Project linked. Attendance is available under this project.':'Project approved. Diary link is still syncing; do not approve again.'});
    }catch(e){if(client){if(!committed)await client.query('ROLLBACK');client.release();}fail(res,e);}
  });
  app.get('/api/projects/:projectId/diary-attendance',requireAuth,async(req,res)=>{
    try{
      const q=await pool.query("SELECT site_id FROM diary_project_requests WHERE project_id=$1 AND status='approved'",[req.params.projectId]);
      if(!q.rows[0])return res.status(404).json({error:'project_not_linked'});
      const params=new URLSearchParams();for(const k of ['from','to'])if(/^\d{4}-\d{2}-\d{2}$/.test(req.query[k]||''))params.set(k,req.query[k]);
      const j=await upstream('/api/internal/attendance?'+params);
      res.set('Cache-Control','no-store').json({ok:true,site:(j.sites || []).find(s=>s.id===q.rows[0].site_id),days:(j.days || []).filter(d=>d.siteId===q.rows[0].site_id)});
    }catch(e){fail(res,e);}
  });
  app.get('/diary-projects.js',(req,res)=>res.type('js').set('Cache-Control','no-cache').sendFile(require('path').join(__dirname,'public','diary-projects.js')));
}
module.exports={init,mount,propose,validateSite,authorizeKey};
