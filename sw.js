// The World: offline cache. Models, animation sets, weapons and sounds are downloaded once and then served from this phone, so a weak connection stops breaking fights.
//  - /assets/**           stale-while-revalidate (instant from cache; refreshed quietly in the background; a re-baked file arrives on the next visit)
//  - index.html, /src/**  network first with a 4 s timeout, cache as the fallback (deploys still apply at once on a good connection)
//  - cdn.jsdelivr.net     stale-while-revalidate (three.js, supabase-js)
//  - anything else (Supabase realtime/API, non-GET, Range requests) goes straight to the network, untouched.
// Kill switch: open the game with ?sw=0 (unregisters this worker and clears its caches).
const VER='w1',CACHE='world-'+VER;
const sameOrigin=u=>u.origin===self.location.origin;
const okRes=r=>r&&r.status===200&&(r.type==='basic'||r.type==='cors');
async function put(req,res){try{if(okRes(res)){const c=await caches.open(CACHE);await c.put(req,res.clone())}}catch(e){}return res}
function swr(e,req){return caches.open(CACHE).then(c=>c.match(req).then(hit=>{
  const net=fetch(req).then(r=>put(req,r)).catch(()=>null);
  if(hit){e.waitUntil(net);return hit}
  return net.then(r=>r||Response.error())}))}
function netFirst(e,req,ms){return new Promise(resolve=>{let done=false;
  const fall=()=>caches.open(CACHE).then(c=>c.match(req)).then(h=>{if(h&&!done){done=true;resolve(h)}});
  const t=setTimeout(fall,ms);
  fetch(req).then(r=>{clearTimeout(t);if(done){put(req,r);return}done=true;resolve(put(req,r))}).catch(()=>{clearTimeout(t);caches.open(CACHE).then(c=>c.match(req)).then(h=>{if(!done){done=true;resolve(h||Response.error())}})})})}
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('world-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET'||req.headers.has('range'))return;let u;try{u=new URL(req.url)}catch(x){return}
  if(sameOrigin(u)){
    if(u.pathname.startsWith('/assets/'))return e.respondWith(swr(e,req));
    if(u.pathname==='/'||u.pathname==='/index.html'||u.pathname.startsWith('/src/'))return e.respondWith(netFirst(e,req,4000));
    return}
  if(u.hostname==='cdn.jsdelivr.net')return e.respondWith(swr(e,req))});
