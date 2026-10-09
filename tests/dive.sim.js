// Regression test for the dive physics (src/input/Dive.js): sink on hold, float back up on release, no diving in shallows, seabed floor, jump kick,
// shore exit, frame-rate independence. Run: node tests/dive.sim.js (part of tests/run_all.sh)
const fs=require('fs'),path=require('path');
(0,eval)(fs.readFileSync(path.join(__dirname,'..','src/input/Dive.js'),'utf8').replace('const Dive=','globalThis.Dive='));
let bad=0;const ok=(c,m)=>{console.log((c?'ok ':'FAIL ')+m);if(!c)bad++};
const mk=()=>({y:-1,vy:0,grounded:true,flying:false,dv:false});
const run=(S,secs,hz,o)=>{const n=Math.round(secs*hz);for(let i=0;i<n;i++)Dive.step(S,1/hz,typeof o==='function'?o(i/hz):o);return S};
{const S=run(mk(),1,60,{wat:true,seabed:-14,down:true});ok(S.dv&&S.y<-2.5&&S.y>-6,'holding dive: sinks (depth after 1 s = '+(-1-S.y).toFixed(2)+' m)');
 const T=run(S,2,60,{wat:true,seabed:-14,down:true});ok(T.y<-6&&T.y>-14,'keeps sinking while held ('+T.y.toFixed(1)+')');
 let t=0;while(T.dv&&t<20){Dive.step(T,1/60,{wat:true,seabed:-14,down:false});t+=1/60}
 ok(!T.dv&&T.y===-1&&T.vy===0,'release: floats back to the surface by itself ('+t.toFixed(1)+' s) and snaps cleanly to y=-1');}
{const S=run(mk(),2,60,{wat:true,seabed:-1.6,down:true});ok(!S.dv&&S.y===-1,'shallow water (seabed -1.6): does not dive');}
{const S=run(mk(),20,60,{wat:true,seabed:-6,down:true});ok(Math.abs(S.y-(-6+.45))<.01&&isFinite(S.y),'seabed floor: rests just above the bottom ('+S.y.toFixed(2)+')');}
{const S=run(mk(),6,60,{wat:true,seabed:-30,down:true});ok(S.y>=Dive.MAXD-.01&&S.y<-5,'depth is limited to '+Dive.MAXD+' m ('+S.y.toFixed(1)+')');}
{const S=run(mk(),12,60,{wat:true,seabed:-40,down:true});ok(S.y>=Dive.MAXD-.01,'deep sea: stays at the depth limit ('+S.y.toFixed(1)+')');}
{const S=run(mk(),3,60,{wat:true,seabed:-14,down:true});Dive.step(S,1/60,{wat:true,seabed:-14,down:false,kick:true});ok(S.vy>=5.2,'jump kick launches upward (vy '+S.vy.toFixed(1)+')');}
{const S=mk();S.flying=true;run(S,1,60,{wat:true,seabed:-14,down:true});ok(!S.dv,'cannot start a dive while flying');}
{const S=mk();S.grounded=false;run(S,1,60,{wat:true,seabed:-14,down:true});ok(!S.dv,'cannot start a dive while airborne');}
{const S=mk();run(S,1,60,{wat:false,seabed:3,down:true});ok(!S.dv,'cannot dive on land');}
{const S=run(mk(),1.5,60,{wat:true,seabed:-14,down:true});run(S,.2,60,{wat:true,seabed:-1.1,down:true});ok(!S.dv&&S.y===-1,'swimming into the shallows while submerged: stands up at the surface level');}
{const S=run(mk(),1.5,60,{wat:true,seabed:-14,down:true});run(S,.1,60,{wat:false,seabed:2,down:true});ok(!S.dv,'leaving the sea ends the dive');}
{const a=run(mk(),1.5,60,{wat:true,seabed:-30,down:true}),b=run(mk(),1.5,20,{wat:true,seabed:-30,down:true});ok(Math.abs(a.y-b.y)/Math.abs(a.y)<.06,'frame-rate independent: depth at 60 Hz '+a.y.toFixed(2)+' vs 20 Hz '+b.y.toFixed(2));}
console.log(bad?bad+' FAIL':'all dive checks passed');process.exit(bad?1:0);
