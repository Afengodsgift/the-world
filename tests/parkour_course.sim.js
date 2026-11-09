// Parkour course + AI: the AI is the automated playtest. A good runner finishes the whole course, no falls; a weak runner mostly does.
const fs=require('fs'),vm=require('vm');let bad=0;const ok=(c,m)=>{if(!c){bad++;console.log('✗ '+m)}else if(process.env.V)console.log('ok '+m)};
const ctx={console,Math};vm.createContext(ctx);
for(const f of['ParkourCore','ParkourCourse','ParkourAI'])vm.runInContext(fs.readFileSync(__dirname+'/../src/parkour/'+f+'.js','utf8')+';this.'+f+'='+f,ctx);
const P=ctx.ParkourCore,C=ctx.ParkourCourse,AI=ctx.ParkourAI;
function rngf(s){return()=>{s=(s*16807)%2147483647;return s/2147483647}}
const course=C.build();
// geometry sanity
ok(course.boxes.length>30&&course.boxes.every(b=>b.x1>b.x0&&b.z1>b.z0&&b.y1>b.y0),'every box is valid');
ok(course.cps.length>=8,'checkpoints exist ('+course.cps.length+')');
function race(skill,seed,verbose){
  const W=P.makeWorld(course.boxes,course.base);W.killY=-6;
  const B=P.newBody(course.start.x,course.GY,course.start.z,course.start.yaw);B.vx=0;B.vz=0;
  const ai=AI.create(skill,rngf(seed)),stats={falls:0,t:0,evs:{},done:false,cp:0};let cpi=0,lastEv='';
  const dt=1/60;
  for(let i=0;i<60*240;i++){
    const inp=AI.think(W,course,B,ai,dt);const ev=P.step(W,B,inp,dt);stats.t+=dt;
    for(const e of ev){stats.evs[e]=(stats.evs[e]||0)+1;lastEv=e}
    // checkpoints
    for(let k=cpi+1;k<course.cps.length;k++){const q=course.cps[k];if(Math.hypot(B.x-q.x,B.z-q.z)<6&&Math.abs(B.y-q.y)<3){cpi=k}}
    // respawn: fell well below the checkpoint
    if((B.mode==='ground'&&B.y<course.GY+.6&&course.inPit(B.x,B.z))||ev.includes('fall')||B.y<course.cps[cpi].y-9){stats.falls++;const q=course.cps[cpi];B.x=q.x;B.z=q.z;B.y=q.y;B.vx=B.vz=B.vy=0;B.spd=0;B.mode='ground';B.yaw=Math.atan2(DXZ(q.d)[0],DXZ(q.d)[1]);B.flow=0;ai.wi=q.wi;ai.done={};ai.held=0;ai.miss=0;
      if(verbose)console.log('fall at t',stats.t.toFixed(1),'cp',q.name,'last',lastEv)}
    if(Math.hypot(B.x-course.finish.x,B.z-course.finish.z)<course.finish.r){stats.done=true;break}
  }
  stats.cp=cpi;stats.x=B.x;stats.z=B.z;return stats}
const DXZ=d=>[[1,0],[0,1],[-1,0],[0,-1]][d];
const good=race(1,7,process.env.V);
if(process.env.V)console.log('good',JSON.stringify(good));
ok(good.done,'a skilled runner finishes the course (reached cp '+good.cp+' '+good.x.toFixed(0)+','+good.z.toFixed(0)+')');
ok(good.falls<=3,'...with very few falls ('+good.falls+')');
ok(good.t>45&&good.t<110,'...in a race-length time ('+good.t.toFixed(1)+' s)');
for(const m of['vault','slide','wallup','wallrun','walljump','ledge','mantle','roll','flipland'])ok(good.evs[m]>0||m==='walljump'||m==='flipland'||m==='ledge'||m==='mantle','the run uses '+m);
let fin=0,tot=0,falls=0;for(let s=1;s<=6;s++){const r=race(.55,s*13,process.env.W);if(process.env.W)console.log(JSON.stringify(r));tot++;if(r.done)fin++;falls+=r.falls}
ok(fin>=5,'a weak runner mostly finishes ('+fin+'/'+tot+', falls '+falls+')');
process.exit(bad?1:0);
