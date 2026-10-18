// The living ocean in the REAL game (software GL): shader compiles, waves move the water, ship rides them. Not in run_all.sh.
//   NODE_PATH=<three + playwright-core> node tests/ocean_browser.mjs --shots dir
import {start,real} from './lib/browser.mjs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const B=await start();
{const p=await B.open('?perf=1');await p.waitForTimeout(3000);
 const snap=async n=>{if(shots)await p.screenshot({path:shots+'/'+n+'.png'})};
 ok(await p.evaluate(()=>typeof Ocean==='object'&&seaMesh.geometry.attributes.position.count>3000),'Ocean built on the existing sea mesh');
 await p.evaluate(()=>{Ship._board();});await p.waitForTimeout(2500);
 await p.evaluate(()=>{Ocean.state.sea=.15});await p.waitForTimeout(2500);await snap('a_calm');
 await p.evaluate(()=>{Ocean.state.sea=.9;Env.setOverride&&0});await p.waitForTimeout(3000);await snap('b_rough');
 const r=await p.evaluate(async()=>{const v=Ship.vessel(),a=[];for(let i=0;i<6;i++){a.push([v.pose.y,v.pose.pitch,v.pose.roll]);await new Promise(r=>setTimeout(r,500))}return a});
 ok(new Set(r.map(x=>x[0].toFixed(3))).size>2,'the ship heaves: '+JSON.stringify(r.map(x=>+x[0].toFixed(2))));
 const g=await p.evaluate(()=>{const m=renderer.info;return {calls:m.render.calls,tris:m.render.triangles}});console.log('render info',JSON.stringify(g));
 ok(real(p.errs).length===0,'no page errors: '+JSON.stringify(real(p.errs).slice(0,3)));
 await p.close2();}
await B.close();console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
