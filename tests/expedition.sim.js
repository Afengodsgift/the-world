// Expedition mode: activity-scoped suspension. Only audited systems are skipped, only while a hold exists, and resuming happens exactly once with no catch-up.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const mk=loc=>{const c={console,location:{search:loc||''}};vm.createContext(c);vm.runInContext(fs.readFileSync(R+'src/core/Expedition.js','utf8')+';this.X=Expedition',c);return c.X};
{const X=mk();ok(!X.skip('sea'),'nothing is skipped before any hold');X.update(false,0);ok(!X.on()&&!X.skip('sea'),'idle frames skip nothing');
 X.update(true,10);ok(X.on()&&X.skip('sea')&&X.skip('outlaw'),'inside a fight: sea + outlaw ticks are skipped');
 ok(!X.skip('weather')&&!X.skip('net')&&!X.skip('ambience')&&!X.skip('warden')&&!X.skip(undefined),'everything not on the audited list keeps running (weather, ambience, networking, Warden)');
 ok(X.SUSP.length===2,'the suspend list is exactly the two audited systems ('+X.SUSP+')');
 let n=0;X.onResume(()=>n++);X.update(true,20);X.update(true,30);ok(n===0,'no resume while still inside');
 X.update(false,40);ok(n===1&&!X.on()&&X.stats().resumes===1,'leaving resumes exactly once');X.update(false,50);X.update(false,60);ok(n===1,'further idle frames do not resume again (no double timers)');
 ok(!X.skip('sea'),'after resume nothing is skipped');
 X.update(true,70);X.update(false,80);ok(n===2,'a second visit resumes again once');
 const s=X.stats();ok(s.skipped.sea>=1&&s.onFrames>=3,'skips are counted for measurement ('+JSON.stringify(s.skipped)+')')}
{const X=mk();X.hold('dungeon');X.update(false,0);ok(X.on()&&X.skip('sea'),'a hold from another scope (future dungeon) also scopes it');X.release('dungeon');X.update(false,1);ok(!X.on(),'released');}
{const X=mk('?expedition=0');X.update(true,0);ok(!X.on()&&!X.skip('sea')&&!X.stats().enabled,'?expedition=0 disables it (the A/B switch)')}
{const s=fs.readFileSync(R+'index.html','utf8');ok(/if\(!Expedition\.skip\('sea'\)\)seaTick/.test(s)&&/Outlaw\.idle\(\)&&Expedition\.skip\('outlaw'\)/.test(s),'index.html guards exactly those two ticks, and Outlaw only when idle');
 ok(/Expedition\.update\(typeof PlayerCombat!=='undefined'&&PlayerCombat\.on\(\)/.test(s),'scope = the player is inside a Warden fight');
 ok(/idle:\(\)=>!active&&!huntOn/.test(fs.readFileSync(R+'src/games/Outlaw.js','utf8')),'Outlaw only reports idle with no active match')}
process.exit(bad?1:0);
