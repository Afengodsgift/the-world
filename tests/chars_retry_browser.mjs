// Character loading survives a flaky connection: the first two requests for several character files are aborted (as a dropped phone connection would),
// and the avatar must still come up with its rig, skin and animations. Before the fix a single failed file rejected loadChar() for the whole session.
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/chars_retry_browser.mjs
import {start,real} from './lib/browser.mjs';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const B=await start();
const fails={},flaky=['char.glb','anim_run.glb','anim_idle.glb','skaterMaleA.png','anims.json'];
const p=await B.open('?perf=1',{pre:async pg=>{
  await pg.route(/\/assets\/(char\.glb|anim_run\.glb|anim_idle\.glb|skaterMaleA\.png|anims\.json)$/,route=>{const f=route.request().url().split('/').pop();fails[f]=(fails[f]||0)+1;if(fails[f]<=2)route.abort('connectionreset');else route.continue()});
}});
const page=p;
await page.setViewportSize({width:320,height:180});await page.waitForTimeout(30000);
const r=await page.evaluate(async()=>{let skinned=0,textured=0;me.traverse(o=>{if(o.isSkinnedMesh){skinned++;if(o.material&&o.material.map)textured++}});
  return {skinned,textured,charP:await Promise.race([charP.then(()=>'resolved',e=>'REJECTED '+e.message),new Promise(r=>setTimeout(()=>r('pending'),4000))]),clips:Object.keys(clips).length,nclips:Object.keys(nclips).length,skins:skinT.length}});
console.log('     requests per flaky file:',JSON.stringify(fails));
ok(Object.values(fails).some(n=>n>=3),'flaky files really were refused twice and retried');
ok(r.charP==='resolved','loadChar() resolves despite the dropped requests ('+r.charP+')');
ok(r.skinned>=1&&r.textured>=1,'the avatar has its skinned rig and skin texture');
ok(r.clips===3&&r.nclips>=10&&r.skins===4,'all animation clips and all four skins loaded');
ok(real(page.errs).length===0,'no page errors');
await B.close();console.log(bad?`\n${bad} FAILED`:'\nall ok');process.exit(bad?1:0);
