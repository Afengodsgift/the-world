// Static guard for the minimal Outlaw Isle HUD: the CSS only references elements that exist, the second fire button is wired everywhere it must be,
// and layout stays in index.html (like every other control). Behaviour is covered by tools/outlaw_hud_firetest.js (needs a browser).
const fs=require('fs'),path=require('path');const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const css=R('src/ui/outlaw-hud.css'),html=R('index.html'),ow=R('src/games/Outlaw.js'),theme=R('src/ui/theme.css');
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
ok(/href="src\/ui\/outlaw-hud\.css"/.test(html),'index.html links outlaw-hud.css');
// every #id / .dk-* selector used by the CSS exists somewhere in the code
const ids=[...new Set([...css.matchAll(/#([a-zA-Z][\w-]*)/g)].map(m=>m[1]))];
const all=html+ow+R('src/ui/Theme.js')+R('src/ui/Journal.js')+R('src/ui/WorldMap.js')+R('src/world/Environment.js')+R('src/interaction/Link.js');
for(const id of ids)ok(new RegExp("id=\"?'?"+id+"|\\.id=['\"]"+id+"|\\$\\(['\"]"+id+"['\"]\\)|getElementById\\(['\"]"+id+"|'"+id+"'").test(all)||new RegExp('#'+id+'\\b').test(html),'#'+id+' (used in outlaw-hud.css) exists in the code');
for(const c of ['dk-wx','dk-jrn','dk-map','dk-owm'])ok(all.includes(c),'.'+c+' exists in the code');
// second fire button
ok(/fireBtn2\.id='owfire2'/.test(ow)&&/bindFire\(fireBtn2\)/.test(ow),'Outlaw.js creates #owfire2 and binds the same hold-to-fire handler');
ok(/nF\+\+/.test(ow)&&/nF=Math\.max\(0,nF-1\)/.test(ow)&&/if\(nF===0\)firing=false/.test(ow),'firing stops only when ALL fire buttons are released');
ok(/fireBtn2\.style\.display=wi>=0/.test(ow),'left fire button visibility follows the weapon being equipped');
ok(/body #owfire2\{left:var\(--L0\)/.test(html),'landscape layout for #owfire2 lives in index.html');
ok(/body #owscope\{right:var\(--R0\)/.test(html),'#owscope has a landscape position (it used to sit on the journal button)');
ok(theme.includes('html #owfire2'),'theme.css skins #owfire2 like the right fire button');
// mode switches
ok(!/setAttribute/.test(ow.slice(ow.indexOf('dk-owm')-80,ow.indexOf('dk-owm')+200)),'menu button uses no DOM APIs missing from the headless sims');
ok(/b\.toggle\('ow-isle',on\)/.test(ow)&&/b\.toggle\('ow-scope',sc\)/.test(ow),'Outlaw.js switches body.ow-isle / body.ow-scope');
ok(/hudMode\(\);clock\+=dt\*1000/.test(ow),'hudMode runs every frame from the Outlaw tick');
// the CSS must not position or size touch controls (that is index.html's job)
const layoutOnControls=css.split('}').filter(r=>/#(owfire2?|owrl|owgun|owview|owshop|jump|stick)\b/.test(r)&&/(^|[;{\s])(left|right|top|bottom|width|height)\s*:/.test(r.split('{')[1]||'')&&!/display:none/.test(r));
ok(layoutOnControls.length===0,'outlaw-hud.css contains no layout properties for touch controls');
// minimal HUD hides the social stuff, scoped hides the rest, and neither hides the combat essentials
const hidden=[...css.matchAll(/body\.ow-(?:isle|scope)[^{]*\{display:none!important\}/g)].map(m=>m[0]).join(' ');
for(const e of ['#info','#share','#emobtn','#panbtn','.dk-wx','.dk-jrn','.dk-map'])ok(hidden.includes(e),e+' is hidden on Outlaw Isle');
for(const e of ['#jump','#owgun','#owview','#owshop'])ok(hidden.includes(e),e+' is hidden while scoped');
for(const e of ['#owfire','#owfire2','#owrl','#owscope','#stick','#owhud'])ok(!/display:none!important/.test((css.split('}').find(r=>new RegExp(e+'\\b').test(r.split('{')[0])&&/ow-(isle|scope)/.test(r.split('{')[0])&&!/:not\(\.ow-isle\)/.test(r.split('{')[0]))||'')),e+' is never hidden by the minimal HUD (combat essential)');
console.log(bad?bad+' FAIL':'outlaw hud checks passed');process.exit(bad?1:0);
