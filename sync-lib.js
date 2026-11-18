/* Pustaka sinkronisasi bersama (dipakai server.js dan index.html).
   State dikirim sebagai "patch" kecil, bukan seluruh data, supaya dua kasir/manajer
   bisa bekerja bersamaan tanpa saling menimpa (stok digabung sebagai selisih). */
(function(root){
const KEYS={prods:'id',sales:'rid',log:'id',notes:'id',shifts:'id',outs:'id',rets:'id',rreq:'id',cust:'id',pets:'id',jobs:'id',groomers:'id',audit:null};
const LOCAL=['cart','savedAt','users'];
const J=v=>JSON.stringify(v===undefined?null:v,(k,x)=>typeof x==='string'&&x.length>1500?'\u0001'+x.length+':'+x.slice(0,64)+x.slice(x.length>>1,(x.length>>1)+64)+x.slice(-64):x);
const kf=(K,it)=>KEYS[K]?it[KEYS[K]]:(it.ts+'|'+it.user+'|'+it.act);
const clone=v=>JSON.parse(JSON.stringify(v));
function pick(s){const o={};Object.keys(s).forEach(k=>{if(!LOCAL.includes(k))o[k]=s[k]});return o}
function diff(base,cur){const out={};
 new Set([...Object.keys(base),...Object.keys(cur)]).forEach(K=>{if(LOCAL.includes(K))return;const b=base[K],c=cur[K];
  if(K in KEYS){const ba=Array.isArray(b)?b:[],ca=Array.isArray(c)?c:[],bm=new Map(ba.map(x=>[kf(K,x),x])),cm=new Map(ca.map(x=>[kf(K,x),x])),add=[],del=[],up=[];
   cm.forEach((x,k)=>{const o=bm.get(k);if(!o){add.push(x);return}if(J(o)===J(x))return;const f={};let ds=0;
    new Set([...Object.keys(o),...Object.keys(x)]).forEach(fl=>{if(K=='prods'&&fl=='stock'){ds=(+x.stock||0)-(+o.stock||0);return}if(J(o[fl])!==J(x[fl]))f[fl]=x[fl]===undefined?null:x[fl]});
    if(Object.keys(f).length||ds)up.push({k,f,ds})});
   bm.forEach((x,k)=>{if(!cm.has(k))del.push(k)});
   if(add.length||del.length||up.length)out[K]={add,del,up}}
  else if(K=='set'){const bo=b||{},co=c||{},f={};new Set([...Object.keys(bo),...Object.keys(co)]).forEach(fl=>{if(J(bo[fl])!==J(co[fl]))f[fl]=co[fl]===undefined?null:co[fl]});if(Object.keys(f).length)out[K]={f}}
  else if(J(b)!==J(c))out[K]={v:c===undefined?null:c}});
 return out}
/* apply: menerapkan patch ke state. Jika "base" diberikan (sisi klien), field yang sedang
   diubah lokal (belum terkirim) tidak ditimpa. */
function apply(state,patch,base){
 Object.keys(patch).forEach(K=>{const p=patch[K];
  if(K in KEYS){const arr=state[K]||(state[K]=[]),bm=base&&base[K]?new Map(base[K].map(x=>[kf(K,x),x])):null;let idx=new Map(arr.map(x=>[kf(K,x),x]));
   (p.add||[]).forEach(x=>{if(!idx.has(kf(K,x))){const c=clone(x);arr.push(c);idx.set(kf(K,c),c)}});
   (p.up||[]).forEach(u=>{const it=idx.get(u.k);if(!it)return;const bi=bm&&bm.get(u.k);Object.keys(u.f||{}).forEach(fl=>{if(bi&&J(it[fl])!==J(bi[fl]))return;it[fl]=u.f[fl]});if(u.ds)it.stock=(+it.stock||0)+u.ds});
   if(p.del&&p.del.length){const ds=new Set(p.del);state[K]=state[K].filter(x=>!ds.has(kf(K,x)))}}
  else if(K=='set'){const o=state.set||(state.set={}),bs=base&&base.set;Object.keys(p.f||{}).forEach(fl=>{if(bs&&J(o[fl])!==J(bs[fl]))return;o[fl]=p.f[fl]})}
  else if('v' in p){state[K]=clone(p.v)}});
 return state}
const api={KEYS,LOCAL,pick,diff,apply,clone,kf,J};
root.KOSync=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
