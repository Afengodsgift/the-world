// Offline cache wiring: sw.js parses, only ever caches GET/200, leaves Range + other origins alone; index.html registers it (with the ?sw=0 kill switch); vercel.json never caches sw.js.
const fs=require('fs');let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const sw=fs.readFileSync('sw.js','utf8'),ix=fs.readFileSync('index.html','utf8'),vj=JSON.parse(fs.readFileSync('vercel.json','utf8'));
try{new Function(sw);ok(true,'sw.js parses')}catch(e){ok(false,'sw.js parses: '+e.message)}
ok(/req\.method!=='GET'/.test(sw)&&/headers\.has\('range'\)/.test(sw),'non-GET and Range requests are not intercepted');
ok(/r\.status===200/.test(sw),'only 200 responses are cached');
ok(!/supabase\.co/.test(sw)&&/cdn\.jsdelivr\.net/.test(sw),'Supabase traffic is never touched; the CDN scripts are cached');
ok(/startsWith\('\/assets\/'\)/.test(sw)&&/startsWith\('\/src\/'\)/.test(sw),'assets and src are both handled');
ok(/serviceWorker\.register\('\/sw\.js'\)/.test(ix)&&/sw=0/.test(ix),'index.html registers the worker and has the ?sw=0 kill switch');
ok(vj.headers.some(h=>h.source==='/sw.js'&&h.headers.some(x=>/no-cache/.test(x.value))),'vercel.json: sw.js is never cached');
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0);
