/* Server Kucing Oren POS (online). Tanpa dependensi: cukup Node.js 18+.
   Jalankan:  node server.js     lalu buka http://localhost:3000 */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const Sync=require('./sync-lib.js');
const PORT=+process.env.PORT||3000,HOST=process.env.HOST||'0.0.0.0',DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'state.json'),HTML=path.join(__dirname,'index.html');
const SESS_MS=12*3600*1000,MAX_BODY=40*1024*1024;
let DB={rev:0,state:null,sessions:{}};
const clients=new Set(),fails=new Map(),seen=new Map();
/* ---------- penyimpanan ---------- */
function seed(){let s={};try{const m=fs.readFileSync(HTML,'utf8').match(/<script id="seed" type="application\/json">([\s\S]*?)<\/script>/);if(m)s=JSON.parse(m[1])}catch(e){console.error('Seed gagal dibaca:',e.message)}
 delete s.cart;s.users=[];['shifts','outs','rets','rreq','audit','notes','sales','log','prods'].forEach(k=>s[k]=s[k]||[]);s.set=s.set||{};s.seedV=Math.max(2,s.seedV||0);return s}
function load(){fs.mkdirSync(DIR,{recursive:true});try{DB=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(_){}if(!DB.state){DB={rev:1,state:seed(),sessions:{}};persistNow();console.log('Data awal dibuat dari index.html')}DB.sessions=DB.sessions||{}}
let wt=null;function persist(){clearTimeout(wt);wt=setTimeout(persistNow,300)}
function persistNow(){const t=FILE+'.tmp';try{fs.writeFileSync(t,JSON.stringify(DB));fs.renameSync(t,FILE)}catch(e){console.error('Gagal menyimpan:',e.message)}}
process.on('SIGINT',()=>{persistNow();process.exit(0)});process.on('SIGTERM',()=>{persistNow();process.exit(0)});
/* ---------- util ---------- */
const send=(res,code,obj,h)=>{const b=JSON.stringify(obj);res.writeHead(code,Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},h||{}));res.end(b)};
function body(req){return new Promise((ok,no)=>{let n=0,c=[];req.on('data',d=>{n+=d.length;if(n>MAX_BODY){no(new Error('too big'));req.destroy();return}c.push(d)});req.on('end',()=>{try{ok(c.length?JSON.parse(Buffer.concat(c).toString('utf8')):{})}catch(e){no(e)}});req.on('error',no)})}
const hashPin=(pin,salt)=>crypto.scryptSync(String(pin),salt,32).toString('hex');
const users=()=>DB.state.users||(DB.state.users=[]),pubUser=u=>({id:u.id,name:u.name,role:u.role,len:u.len||4});
const uid=()=>crypto.randomBytes(6).toString('hex');
function sanitized(){const s=JSON.parse(JSON.stringify(DB.state));s.users=users().map(pubUser);return s}
function auth(req,url){const h=req.headers.authorization||'',t=h.startsWith('Bearer ')?h.slice(7):url.searchParams.get('token');const s=t&&DB.sessions[t];if(!s)return null;if(s.exp<Date.now()){delete DB.sessions[t];return null}const u=users().find(x=>x.id==s.uid);if(!u)return null;return{token:t,user:u}}
function newSession(u){const t=crypto.randomBytes(24).toString('hex');DB.sessions[t]={uid:u.id,exp:Date.now()+SESS_MS};Object.keys(DB.sessions).forEach(k=>{if(DB.sessions[k].exp<Date.now())delete DB.sessions[k]});persist();return t}
function broadcast(msg,exceptRes){const d='data: '+JSON.stringify(msg)+'\n\n';clients.forEach(c=>{try{c.res.write(d)}catch(_){}})}
/* ---------- guard peran (kasir tidak boleh memalsukan retur, pengguna, dll) ---------- */
const KASIR_SET=['snd','dark','col','theme','pri','card','hdrImg','bgImg'];
function guard(role,patch){const g={},st=DB.state;let altered=false,reject='';
 const keep=(K,v)=>{g[K]=v};
 Object.keys(patch).forEach(K=>{const p=patch[K];
  if(K=='users'||Sync.LOCAL.includes(K)){altered=true;return}
  if(role=='kasir'){
   if(['rets','groomers'].includes(K)){altered=true;return}
   if(K=='set'){const f={};Object.keys(p.f||{}).forEach(fl=>{if(KASIR_SET.includes(fl))f[fl]=p.f[fl];else altered=true});if(Object.keys(f).length)keep(K,{f});return}
   if(K=='prods'){const up=(p.up||[]).filter(u=>u.ds).map(u=>({k:u.k,f:{},ds:u.ds}));if((p.add||[]).length||(p.del||[]).length||(p.up||[]).some(u=>Object.keys(u.f||{}).length))altered=true;if(up.length)keep(K,{add:[],del:[],up});return}
   if(['cust','pets','jobs'].includes(K)){if((p.del||[]).length)altered=true;keep(K,{add:p.add||[],del:[],up:p.up||[]});return}
   if(['sales','log'].includes(K)){if((p.del||[]).length)altered=true;keep(K,{add:p.add||[],del:[],up:K=='sales'?(p.up||[]):[]});return}
   if(K=='rreq'){const add=(p.add||[]).map(r=>Object.assign({},r,{status:'pending',decBy:undefined,decAt:undefined,decNote:undefined,remote:undefined}));const up=[];(p.up||[]).forEach(u=>{const f=u.f||{};if(f.status=='canceled'){up.push({k:u.k,f:{status:'canceled',decBy:f.decBy,decAt:f.decAt},ds:0})}else altered=true});if((p.del||[]).length)altered=true;keep(K,{add,del:[],up});return}
   keep(K,p);return}
  keep(K,p)});
 /* transisi status retur hanya dari "pending" */
 const rq=g.rreq;if(rq&&rq.up)for(const u of rq.up){if(u.f&&u.f.status){const cur=(st.rreq||[]).find(r=>r.id==u.k);if(!cur||cur.status!='pending'){reject='Pengajuan retur ini sudah diproses atau dibatalkan.';break}if(role!='kasir'&&u.f.status=='approved'){const has=((g.rets&&g.rets.add)||[]).some(r=>r.id==u.k);if(!has){reject='Persetujuan retur tidak lengkap.';break}}}}
 return{patch:g,altered,reject}}
/* ---------- SSE ---------- */
function sse(req,res,a){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store',Connection:'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 2000\n\n');const c={res,uid:a.user.id,token:a.token};clients.add(c);res.write('data: '+JSON.stringify({t:'hello',rev:DB.rev})+'\n\n');
 const hb=setInterval(()=>{try{res.write('data: '+JSON.stringify({t:'hb',rev:DB.rev})+'\n\n')}catch(_){}},15000);req.on('close',()=>{clearInterval(hb);clients.delete(c)})}
/* ---------- router ---------- */
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x'),p=url.pathname;
 try{
  if(req.method=='GET'&&(p=='/'||p=='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(HTML))}
  if(!p.startsWith('/api/')){res.writeHead(404);return res.end('Not found')}
  if(p=='/api/health')return send(res,200,{app:'kucing-oren-pos',online:true,users:users().length});
  if(p=='/api/users'&&req.method=='GET')return send(res,200,{users:users().map(pubUser)});
  if(p=='/api/setup'&&req.method=='POST'){if(users().length)return send(res,403,{error:'Sudah ada pengguna.'});const b=await body(req),n=String(b.name||'').trim().slice(0,30),pin=String(b.pin||'');if(!n||!/^\d{4,6}$/.test(pin))return send(res,400,{error:'Nama wajib dan PIN 4–6 angka.'});const salt=uid(),u={id:uid(),name:n,role:'owner',salt,pin:hashPin(pin,salt),len:pin.length};users().push(u);persist();const t=newSession(u);broadcast({t:'users'});return send(res,200,{token:t,user:pubUser(u)})}
  if(p=='/api/login'&&req.method=='POST'){const b=await body(req),u=users().find(x=>x.id==b.uid),f=fails.get(b.uid)||{n:0,until:0};if(!u)return send(res,404,{error:'Pengguna tidak ditemukan.'});if(Date.now()<f.until)return send(res,429,{error:'Terlalu banyak percobaan. Coba lagi sebentar.'});
   if(hashPin(String(b.pin||''),u.salt)!==u.pin){f.n++;if(f.n>=5){f.until=Date.now()+30000;f.n=0}fails.set(b.uid,f);return send(res,401,{error:'PIN salah.'})}fails.delete(b.uid);return send(res,200,{token:newSession(u),user:pubUser(u)})}
  const a=auth(req,url);if(!a)return send(res,401,{error:'Sesi berakhir. Masuk lagi.'});const role=a.user.role;
  if(p=='/api/me')return send(res,200,{user:pubUser(a.user)});
  if(p=='/api/logout'){delete DB.sessions[a.token];persist();return send(res,200,{ok:1})}
  if(p=='/api/state'&&req.method=='GET')return send(res,200,{rev:DB.rev,state:sanitized()});
  if(p=='/api/events')return sse(req,res,a);
  if(p=='/api/sync'&&req.method=='POST'){const b=await body(req);if(!b.patch||typeof b.patch!='object')return send(res,400,{error:'Patch tidak valid.'});if(b.pid&&seen.has(b.pid))return send(res,200,{rev:seen.get(b.pid),dup:true});const g=guard(role,b.patch);if(g.reject)return send(res,409,{error:g.reject,reject:true,rev:DB.rev});
   if(!Object.keys(g.patch).length)return send(res,200,{rev:DB.rev,altered:g.altered,empty:true});
   Sync.apply(DB.state,g.patch);DB.rev++;persist();if(b.pid){seen.set(b.pid,DB.rev);if(seen.size>3000)seen.delete(seen.keys().next().value)}const msg={t:'patch',rev:DB.rev,cid:b.cid||'',pid:b.pid||'',by:a.user.name,altered:g.altered,patch:g.patch};broadcast(msg);return send(res,200,{rev:DB.rev,altered:g.altered})}
  if(role!='owner')return send(res,403,{error:'Hanya manajer yang boleh melakukan ini.'});
  if(p=='/api/users'&&req.method=='POST'){const b=await body(req),n=String(b.name||'').trim().slice(0,30),pin=String(b.pin||''),r=b.role=='owner'?'owner':'kasir';if(!n||!/^\d{4,6}$/.test(pin))return send(res,400,{error:'Nama wajib dan PIN 4–6 angka.'});if(users().some(x=>x.name.toLowerCase()==n.toLowerCase()))return send(res,400,{error:'Nama sudah dipakai.'});const salt=uid(),u={id:uid(),name:n,role:r,salt,pin:hashPin(pin,salt),len:pin.length};users().push(u);persist();broadcast({t:'users'});return send(res,200,{users:users().map(pubUser)})}
  let m=p.match(/^\/api\/users\/([\w]+)\/pin$/);if(m&&req.method=='POST'){const u=users().find(x=>x.id==m[1]);if(!u)return send(res,404,{error:'Tidak ditemukan.'});const b=await body(req),pin=String(b.pin||'');if(!/^\d{4,6}$/.test(pin))return send(res,400,{error:'PIN 4–6 angka.'});u.salt=uid();u.pin=hashPin(pin,u.salt);u.len=pin.length;Object.keys(DB.sessions).forEach(k=>{if(DB.sessions[k].uid==u.id&&k!=a.token)delete DB.sessions[k]});persist();broadcast({t:'users'});return send(res,200,{ok:1})}
  m=p.match(/^\/api\/users\/([\w]+)$/);if(m&&req.method=='DELETE'){const u=users().find(x=>x.id==m[1]);if(!u)return send(res,404,{error:'Tidak ditemukan.'});if(u.id==a.user.id)return send(res,400,{error:'Tidak bisa menghapus akun yang sedang dipakai.'});if(u.role=='owner'&&users().filter(x=>x.role=='owner').length<2)return send(res,400,{error:'Minimal satu manajer.'});DB.state.users=users().filter(x=>x.id!=u.id);Object.keys(DB.sessions).forEach(k=>{if(DB.sessions[k].uid==u.id)delete DB.sessions[k]});persist();broadcast({t:'users'});return send(res,200,{users:users().map(pubUser)})}
  if(p=='/api/restore'&&req.method=='POST'){const b=await body(req),s=b.state;if(!s||!Array.isArray(s.prods)||!Array.isArray(s.sales))return send(res,400,{error:'File backup tidak valid.'});const us=users();delete s.cart;s.users=us;DB.state=s;DB.rev++;persist();broadcast({t:'reset',rev:DB.rev});return send(res,200,{rev:DB.rev})}
  return send(res,404,{error:'Endpoint tidak ada.'})
 }catch(e){console.error(e.message);try{send(res,500,{error:'Kesalahan server.'})}catch(_){}}
});
load();
server.listen(PORT,HOST,()=>{console.log('\n  Kucing Oren POS (online) berjalan.\n');console.log('  Di komputer ini : http://localhost:'+PORT);Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family=='IPv4'&&!i.internal).forEach(i=>console.log('  Dari HP/komputer lain (Wi-Fi sama): http://'+i.address+':'+PORT));console.log('\n  Data tersimpan di: '+FILE+'\n  Tekan Ctrl+C untuk berhenti.\n')});
