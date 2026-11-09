// PARKOUR CORE: pure movement engine for the Parkour Isle race (no THREE, no DOM). The player and every AI runner step the SAME body with the SAME rules.
// World = axis-aligned boxes (top surface is walkable, sides are walls) + a base ground function. A body is {x,y,z,vx,vz,vy,...}; step(W,B,inp,dt) returns the events that happened.
//   inp = {mx,mz: desired world direction (|v|<=1), jump: pressed edge, jumpHeld, slide: pressed edge, trick: pressed edge, walk}
// Moves: run (momentum, wide turns at speed), jump + long jump, vault (low/high), slide (under low ceilings), wall-run, wall-jump, wall-kick (up a tall wall and off), wall-up (run up a wall onto a platform),
//   ledge grab + mantle, roll (hard landing), flips (clean landing = speed), FLOW (a 0..1 chain meter that raises top speed).
// Events: jump bhop vault slide wallrun walljump wallkick wallup ledge mantle roll hardland flip flipland stumble fall
const ParkourCore=(()=>{
  const G=28,JUMP=9.4,TERM=-32,R=.35,HT=1.8,SLH=.85,STEP=.5,CELL=6;
  const RUN0=15,RUNX=7,WALK=7,ACC=55,DEC=60,COY=.12,BUF=.16,WR_MAX=1.6;
  const cl=(v,a,b)=>v<a?a:v>b?b:v;
  // ---------- world ----------
  function makeWorld(boxes,base){
    const W={boxes:[],grid:new Map(),base:base||(()=>0)};
    for(const o of boxes)addBox(W,o);return W}
  const key=(i,j)=>i*73856093^j*19349663;
  function addBox(W,o){
    const b={x0:Math.min(o.x0,o.x1),x1:Math.max(o.x0,o.x1),z0:Math.min(o.z0,o.z1),z1:Math.max(o.z0,o.z1),y0:o.y0,y1:o.y1,k:o.k||'solid'};
    W.boxes.push(b);for(let i=Math.floor(b.x0/CELL);i<=Math.floor(b.x1/CELL);i++)for(let j=Math.floor(b.z0/CELL);j<=Math.floor(b.z1/CELL);j++){const k=key(i,j);let a=W.grid.get(k);if(!a){a=[];W.grid.set(k,a)}a.push(b)}return b}
  function near(W,x,z,r){const out=[],i0=Math.floor((x-r)/CELL),i1=Math.floor((x+r)/CELL),j0=Math.floor((z-r)/CELL),j1=Math.floor((z+r)/CELL);
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const a=W.grid.get(key(i,j));if(a)for(const b of a)if(out.indexOf(b)<0)out.push(b)}return out}
  // highest surface a body with feet at y can stand on at (x,z): base ground or a box top at most STEP above the feet
  function floorAt(W,x,z,y,step){
    let f=W.base(x,z);const s=step===undefined?STEP:step;
    for(const b of near(W,x,z,.5))if(x>=b.x0-.12&&x<=b.x1+.12&&z>=b.z0-.12&&z<=b.z1+.12&&b.y1<=y+s&&b.y1>f)f=b.y1;
    return f}
  // lowest ceiling above the feet at (x,z) (Infinity if none): a box whose underside is above the feet
  function ceilAt(W,x,z,y){let c=Infinity;for(const b of near(W,x,z,.5))if(x>=b.x0-R&&x<=b.x1+R&&z>=b.z0-R&&z<=b.z1+R&&b.y0>=y+.3&&b.y0<c)c=b.y0;return c}
  // ray (2D) against a box that spans height y: nearest hit {b,t,nx,nz,top} within maxT (t measured from the ray origin to the face)
  function ray(W,ox,oz,dx,dz,maxT,y){
    let best=null;
    for(const b of near(W,ox+dx*maxT/2,oz+dz*maxT/2,maxT/2+1)){
      if(y<b.y0||y>b.y1)continue;
      let t0=0,t1=maxT,nx=0,nz=0,ok=true;
      for(let a=0;a<2;a++){const o=a?oz:ox,d=a?dz:dx,lo=a?b.z0:b.x0,hi=a?b.z1:b.x1;
        if(Math.abs(d)<1e-9){if(o<lo||o>hi){ok=false;break}continue}
        let ta=(lo-o)/d,tb=(hi-o)/d;if(ta>tb){const q=ta;ta=tb;tb=q}
        if(ta>t0){t0=ta;if(a){nz=d>0?-1:1;nx=0}else{nx=d>0?-1:1;nz=0}}
        if(tb<t1)t1=tb;if(t0>t1){ok=false;break}}
      if(ok&&t0>=0&&t0<=maxT&&(!best||t0<best.t))best={b,t:t0,nx,nz,top:b.y1}}
    return best}
  // ---------- body ----------
  function newBody(x,y,z,yaw){return{x,y,z,vx:0,vz:0,vy:0,spd:0,yaw:yaw||0,mode:'ground',grounded:true,flow:0,fT:0,coy:0,buf:0,airT:0,t:0,mt:0,jumped:false,cut:false,
    flip:false,flipT:0,flipK:'',wrCd:0,ledgeCd:0,stumble:0,wn:null,wbox:null,ln:null,ltop:0,lbox:null,vbox:null,anim:'idle',ts:1,ev:[],dist:0,air:0}}
  const maxRun=B=>RUN0+RUNX*B.flow;
  const gain=(B,v)=>{B.flow=Math.min(1,B.flow+v);B.fT=1.6};
  const heading=B=>Math.atan2(B.vx,B.vz);
  const setV=(B,h,s)=>{B.spd=s;B.vx=Math.sin(h)*s;B.vz=Math.cos(h)*s;B.yaw=h};
  // a wall takes the velocity component that points into it (running into a wall stops you; running along it keeps your speed)
  const bounce=(B,h)=>{if(!h)return;const vn=B.vx*h.nx+B.vz*h.nz;if(vn<0){const sp=Math.hypot(B.vx,B.vz)||1;B.vx-=vn*h.nx;B.vz-=vn*h.nz;
    // a real hit (not a graze) also kills the sideways drift: running into a wall at an angle used to carry you along it
    const k=vn<-2.2?cl(1+(vn/sp)*2.2,0,1):1;B.vx*=k;B.vz*=k;B.spd=Math.hypot(B.vx,B.vz)}};
  // push the body out of every box it overlaps (horizontal). head = standing / sliding height.
  function collide(W,B){
    const head=B.y+(B.mode==='slide'||B.mode==='roll'?SLH:HT);let hit=null;
    for(let it=0;it<2;it++){let moved=false;
      for(const b of near(W,B.x,B.z,R+1)){
        if(B.mode==='vault'&&b===B.vbox)continue;
        if(b.y1<=B.y+STEP||b.y0>=head)continue;
        const nx=cl(B.x,b.x0,b.x1),nz=cl(B.z,b.z0,b.z1),dx=B.x-nx,dz=B.z-nz,d=Math.hypot(dx,dz);
        if(d>1e-6){if(d<R){B.x=nx+dx/d*R;B.z=nz+dz/d*R;moved=true;hit={b,nx:dx/d,nz:dz/d}}}
        else{const l=B.x-b.x0,r=b.x1-B.x,f=B.z-b.z0,a=b.z1-B.z,m=Math.min(l,r,f,a);
          if(m===l){B.x=b.x0-R;hit={b,nx:-1,nz:0}}else if(m===r){B.x=b.x1+R;hit={b,nx:1,nz:0}}else if(m===f){B.z=b.z0-R;hit={b,nx:0,nz:-1}}else{B.z=b.z1+R;hit={b,nx:0,nz:1}}moved=true}}
      if(!moved)break}
    return hit}
  const tall=b=>b.y1-b.y0>=2.6;
  // ---------- step ----------
  function step(W,B,inp,dt){
    const ev=B.ev=[];B.t+=dt;B.mt+=dt;
    B.coy=Math.max(0,B.coy-dt);B.buf=Math.max(0,B.buf-dt);B.wrCd=Math.max(0,B.wrCd-dt);B.ledgeCd=Math.max(0,B.ledgeCd-dt);B.stumble=Math.max(0,B.stumble-dt);
    if(B.fT>0)B.fT-=dt;else B.flow=Math.max(0,B.flow-.22*dt);
    if(inp.jump)B.buf=BUF;
    const m=Math.min(1,Math.hypot(inp.mx||0,inp.mz||0)),dx=m>.01?inp.mx/m:Math.sin(B.yaw),dz=m>.01?inp.mz/m:Math.cos(B.yaw);
    const M=B.mode;
    if(M==='ground')ground(W,B,inp,dt,m,dx,dz,ev);
    else if(M==='air')air(W,B,inp,dt,m,dx,dz,ev);
    else if(M==='slide')slide(W,B,inp,dt,m,dx,dz,ev);
    else if(M==='vault')vault(W,B,dt,ev);
    else if(M==='wallrun')wallrun(W,B,inp,dt,ev);
    else if(M==='wallup')wallup(W,B,dt,ev);
    else if(M==='ledge')ledge(W,B,inp,dt,m,ev);
    else if(M==='mantle')mantle(W,B,dt,ev);
    else if(M==='roll')roll(W,B,dt,ev);
    B.dist+=B.spd*dt;
    return ev}
  // steer the velocity heading toward the desired direction: fast turning when slow, wide arcs at speed (momentum)
  function steer(B,dx,dz,m,dt,top,air){
    let s=B.spd;const tgt=m>.1?top*Math.min(1,m):0;
    s=tgt>s?Math.min(tgt,s+(air?9:ACC)*dt):Math.max(tgt,s-(air?.6:DEC)*dt);
    if(m>.1){const h=s>.4?heading(B):Math.atan2(dx,dz),want=Math.atan2(dx,dz);let d=Math.atan2(Math.sin(want-h),Math.cos(want-h));
      const rate=(air?3.2:(15-9*cl(s/22,0,1)))*dt;d=cl(d,-rate,rate);setV(B,h+d,s)}else setV(B,s>.4?heading(B):B.yaw,s);}
  function ground(W,B,inp,dt,m,dx,dz,ev){
    const top=B.stumble>0?4:(inp.walk?WALK:maxRun(B));
    steer(B,dx,dz,m,dt,top,false);
    B.x+=B.vx*dt;B.z+=B.vz*dt;
    let hit=collide(W,B);
    // vault / wall-up: running straight into an obstacle
    if(B.spd>4.5&&B.stumble<=0){const h=heading(B),fx=Math.sin(h),fz=Math.cos(h),r=ray(W,B.x,B.z,fx,fz,R+.75+B.spd*.26,B.y+.6);
      if(r&&r.b!==B.vbox){const hgt=r.top-B.y;
        if(hgt>.55&&hgt<=1.62&&r.t<=R+.75+(B.buf>0?B.spd*.26:0)&&Math.abs(r.nx*fx+r.nz*fz)>.5){const depth=Math.abs(fx)*(r.b.x1-r.b.x0)+Math.abs(fz)*(r.b.z1-r.b.z0);
          if(depth<=3.2&&ceilAt(W,r.b.x0+(r.b.x1-r.b.x0)/2,r.b.z0+(r.b.z1-r.b.z0)/2,r.top)>r.top+1.8){startVault(B,r.b,h,depth,hgt,ev);return}}
        else if(hgt>1.62&&hgt<=3.7&&Math.abs(r.nx*fx+r.nz*fz)>.6&&r.b.x1-r.b.x0>.8&&r.b.z1-r.b.z0>.8){B.buf=0;startWallUp(B,r,h,ev);return}}}
    bounce(B,hit);
    const f=floorAt(W,B.x,B.z,B.y);
    if(B.y>f+.06||f===-Infinity){B.mode='air';B.coy=COY;B.grounded=false;B.jumped=false;B.cut=false;B.airT=0;B.air=B.y;return}
    B.y=f;B.vy=0;B.grounded=true;
    if(inp.slide&&B.spd>6&&B.stumble<=0){B.mode='slide';B.mt=0;setV(B,heading(B),Math.min(maxRun(B)+1,B.spd*1.08));ev.push('slide');gain(B,.04);return}
    if(B.buf>0&&B.stumble<=.2){B.buf=0;doJump(B,ev,false)}}
  function doJump(B,ev,fromSlide){
    B.vy=JUMP;B.mode='air';B.grounded=false;B.jumped=true;B.cut=false;B.airT=0;B.air=B.y;B.coy=0;
    if(B.spd>8)B.spd=Math.min(maxRun(B)+1.2,B.spd+1.0+(fromSlide?.8:0));setV(B,B.spd>.4?heading(B):B.yaw,B.spd);ev.push('jump')}
  function startVault(B,b,h,depth,hgt,ev){
    B.mode='vault';B.mt=0;B.vbox=b;B.vh=b.y1;B.vy0=B.y;B.vsp=Math.max(B.spd,6.5);B.vdur=cl((depth+1.2)/B.vsp,.42,.72);B.vhgt=hgt;setV(B,h,B.vsp);B.vk=hgt<1.1?'low':'high';
    ev.push('vault');gain(B,.12)}
  function vault(W,B,dt,ev){
    const u=Math.min(1,B.mt/B.vdur);B.x+=B.vx*dt;B.z+=B.vz*dt;
    const arc=Math.sin(Math.min(1,u*1.35)*Math.PI*.5);B.y=B.vy0+(B.vh+.12-B.vy0)*arc*(u<.7?1:1-(u-.7)/.3*.9)-0;if(u>.7)B.y=Math.max(B.y,B.vh+.12-(B.vh+.12-B.vy0)*0);
    collide(W,B);
    if(u>=1){B.mode='air';B.vy=0;B.grounded=false;B.airT=.1;B.air=B.y;B.coy=0;B.jumped=false;B.vbox=null;B.cut=true}}
  function startWallUp(B,r,h,ev){B.dashed=false;
    B.mode='wallup';B.mt=0;B.wbox=r.b;B.wtop=r.top;B.vy0=B.y;B.wdur=.95;B.wn={x:r.nx,z:r.nz};B.wx0=B.x;B.wz0=B.z;B.wh=h;B.wa=Math.max(0,r.t-R-.02);B.spd=Math.max(B.spd,6);
    ev.push('wallup');gain(B,.2)}
  function wallup(W,B,dt,ev){
    const u=Math.min(1,B.mt/B.wdur),e=u*u*(3-2*u),b=B.wbox;
    // glide to the wall face, climb, then step onto the top edge
    const fx=-B.wn.x,fz=-B.wn.z;B.y=B.vy0+(B.wtop-B.vy0)*e;
    const into=Math.min(1,u/.4),over=Math.max(0,(u-.55)/.45);
    const ap=Math.min(1,u/.3);B.x=B.wx0+fx*(B.wa*ap+.3*into+.9*over);B.z=B.wz0+fz*(B.wa*ap+.3*into+.9*over);B.vx=B.vz=0;
    if(u>=1){B.y=B.wtop;B.mode='ground';B.grounded=true;B.vy=0;setV(B,B.wh,Math.max(9,B.spd*.95));B.wbox=null}}
  function air(W,B,inp,dt,m,dx,dz,ev){
    if(B.buf>0&&B.coy>0&&!B.jumped&&B.airT<.2&&B.vy<=0){B.buf=0;doJump(B,ev,false);return}
    B.airT+=dt;B.vy=Math.max(TERM,B.vy-G*dt);
    if(B.jumped&&!B.cut&&!inp.jumpHeld&&B.vy>3.2){B.vy*=.55;B.cut=true}
    steer(B,dx,dz,m,dt,Math.max(B.spd,m>.1?maxRun(B)*.85:0),true);
    if(B.flip)B.flipT+=dt;
    B.x+=B.vx*dt;B.z+=B.vz*dt;B.y+=B.vy*dt;
    const hit=collide(W,B);bounce(B,hit);
    // flip trick
    if(inp.trick&&!B.flip&&B.airT>.14&&B.vy>-10){B.flip=true;B.flipT=0;B.flipK=B.spd>4?'front':'back';ev.push('flip')}
    // wall-run / wall-kick / ledge need a wall near
    const sp=B.spd,h=sp>.5?heading(B):B.yaw,fx=Math.sin(h),fz=Math.cos(h);
    if(B.wrCd<=0&&sp>=5.2&&B.vy>-9){
      for(const sd of[-1,1]){const px=fz*sd,pz=-fx*sd,r=ray(W,B.x,B.z,px,pz,R+.3,B.y+1.0);
        if(r&&tall(r.b)&&r.top>B.y+2.2&&Math.abs(r.nx*fx+r.nz*fz)<.55){B.mode='wallrun';B.mt=0;B.wn={x:r.nx,z:r.nz};B.wbox=r.b;B.wside=sd;B.vy=Math.max(B.vy,1.2);B.jumped=false;B.flip=false;
          const tx=-r.nz*(r.nx*fx+r.nz*fz>=0?0:0)+(fx*r.nz*0),tdir=(-r.nz)*fx+(r.nx)*fz>=0?1:-1;B.wt={x:-r.nz*tdir,z:r.nx*tdir};setV(B,Math.atan2(B.wt.x,B.wt.z),Math.max(sp,6.5));ev.push('wallrun');gain(B,.1);return}}}
    if(B.wrCd<=0&&B.ledgeCd<=0&&sp>3){const r=ray(W,B.x,B.z,fx,fz,R+.6,B.y+1.0);
      if(r&&tall(r.b)&&r.nx*fx+r.nz*fz<-.6&&r.b.x1-r.b.x0>.8&&r.b.z1-r.b.z0>.8){const rel=r.top-B.y;if(rel>2.3&&rel<=3.5&&B.vy<=5){B.mode='air';startWallUp(B,r,h,ev);B.dashed=false;return}}}
    if(B.buf>0&&B.wrCd<=0){const r=ray(W,B.x,B.z,fx,fz,R+.55,B.y+1.0);
      if(r&&tall(r.b)&&r.nx*fx+r.nz*fz<-.6){B.buf=0;B.vy=JUMP*.98;const n=r;setV(B,Math.atan2(n.nx,n.nz),Math.max(6.5,sp*.8));B.wrCd=.4;B.jumped=true;B.cut=false;B.flip=false;ev.push('wallkick');gain(B,.15);return}}
    if(B.ledgeCd<=0&&B.vy<=2.8&&sp>-1){const r=ray(W,B.x,B.z,fx,fz,R+.6,B.y+1.0),r2=r&&ray(W,B.x,B.z,fx,fz,R+.6,B.y+1.75);
      if(r&&Math.abs(r.nx*fx+r.nz*fz)>.5){const rel=r.top-B.y;
        if(rel>=1.35&&rel<=2.3&&!r2||(r&&rel>=1.35&&rel<=2.05&&r2&&r2.b===r.b&&false)){B.mode='ledge';B.mt=0;B.ln={x:r.nx,z:r.nz};B.lbox=r.b;B.ltop=r.top;B.vx=B.vz=B.vy=0;B.spd=0;B.x=B.x+fx*(r.t-R+.02);B.z=B.z+fz*(r.t-R+.02);B.y=r.top-2.05;B.flip=false;B.yaw=Math.atan2(-r.nx,-r.nz);ev.push('ledge');gain(B,.06);return}}}
    // air skills: JUMP again = air-dash (once per flight, boosts + flows); SLIDE = dive (fast drop, rolls out on landing)
    {const f0=floorAt(W,B.x,B.z,B.y-STEP*.3);
    if(B.buf>0&&!B.dashed&&B.airT>.18&&B.y-f0>1.3&&B.stumble<=0){B.buf=0;B.dashed=true;B.spinT=.45;B.vy=Math.max(B.vy,6.2);setV(B,B.spd>.4?heading(B):B.yaw,Math.min(maxRun(B)+4,Math.max(B.spd,8)+4.5));ev.push('airdash');gain(B,.14)}
    else if(inp.slide&&!B.diving&&B.airT>.1&&B.y-f0>2.2&&B.vy>-14){B.diving=true;B.vy=-17;ev.push('dive');gain(B,.06)}}
    if(B.spinT>0)B.spinT-=dt;
    // landing
    const f=floorAt(W,B.x,B.z,B.y-STEP*.3);
    if(B.vy<=0&&B.y<=f){const impact=-B.vy;B.y=f;B.vy=0;B.grounded=true;B.mode='ground';B.mt=0;
      const clean=B.flip&&B.flipT>=.52;B.dashed=false;B.spinT=0;const dove=B.diving;B.diving=false;if(dove){gain(B,.12);ev.push('diveroll')}
      if(B.flip&&!clean){B.stumble=.45;B.flow=Math.max(0,B.flow-.2);ev.push('stumble');B.spd*=.5;setV(B,heading(B),B.spd)}
      else if(clean){gain(B,.3);setV(B,heading(B),Math.min(maxRun(B)+1.5,B.spd+1.4));ev.push('flipland')}
      else if(dove||impact>11.5&&B.spd>3.2||B.buf>0&&impact>11.5){B.mode='roll';B.mt=0;setV(B,heading(B),Math.max(B.spd*.92,4));ev.push('roll');gain(B,.1)}
      else if(impact>19){B.stumble=.5;B.flow=Math.max(0,B.flow-.25);B.spd*=.35;setV(B,heading(B),B.spd);ev.push('hardland')}
      else if(B.buf>0&&m>.1){B.buf=0;ev.push('bhop');gain(B,.04);doJump(B,ev,false);return}
      B.flip=false;if(B.mode==='ground'&&!ev.includes('flipland'))B.spd*=.97;return}
    if(f===-Infinity&&B.y<(W.killY!==undefined?W.killY:-6))ev.push('fall')}
  function slide(W,B,inp,dt,m,dx,dz,ev){
    // a slide keeps its heading (a little steering), loses speed slowly and ducks under low ceilings
    let s=B.spd-(B.mt<.15?3:7)*dt;const h=heading(B),want=m>.1?Math.atan2(dx,dz):h,d=Math.atan2(Math.sin(want-h),Math.cos(want-h));
    const low=ceilAt(W,B.x+Math.sin(h)*.6,B.z+Math.cos(h)*.6,B.y)<B.y+HT+.05||ceilAt(W,B.x,B.z,B.y)<B.y+HT+.05;
    if(low)s=Math.max(s,4.6);setV(B,h+cl(d,-1.4*dt,1.4*dt),s);
    B.x+=B.vx*dt;B.z+=B.vz*dt;bounce(B,collide(W,B));
    const f=floorAt(W,B.x,B.z,B.y);
    if(B.y>f+.08){B.mode='air';B.grounded=false;B.coy=COY;B.jumped=false;B.airT=0;B.air=B.y;return}B.y=f;
    if(B.buf>0&&!low){B.buf=0;doJump(B,ev,true);return}
    if(!low&&(B.mt>.85||s<4.2)){B.mode='ground'}}
  function wallrun(W,B,inp,dt,ev){B.dashed=false;
    const sp=Math.min(maxRun(B)+1,B.spd+3*dt);setV(B,Math.atan2(B.wt.x,B.wt.z),sp);
    B.vy=B.vy*(1-2.2*dt)-G*.13*dt;B.x+=B.vx*dt;B.z+=B.vz*dt;B.y+=B.vy*dt;
    // stay glued to the wall; leaving its end ends the run
    const r=ray(W,B.x,B.z,-B.wn.x,-B.wn.z,R+.5,B.y+1.0);
    if(!r||r.b!==B.wbox||r.top<B.y+1.8){B.mode='air';B.wrCd=.3;B.jumped=false;B.airT=.12;B.cut=true;B.wbox=null;B.vy=Math.max(B.vy,1.5);ev.push('wallend');return}
    const keep=R+.04;B.x+=(-B.wn.x)*(r.t-keep+0)*1;B.z+=(-B.wn.z)*(r.t-keep+0)*1;
    collide(W,B);
    if(B.buf>0){B.buf=0;const wj=B.spd;B.vy=JUMP;B.vx=B.wt.x*wj*.9+B.wn.x*6.2;B.vz=B.wt.z*wj*.9+B.wn.z*6.2;B.spd=Math.hypot(B.vx,B.vz);B.yaw=Math.atan2(B.vx,B.vz);B.mode='air';B.wrCd=.4;B.jumped=true;B.cut=false;B.airT=0;ev.push('walljump');gain(B,.18);return}
    if(inp.slide||B.mt>WR_MAX){B.mode='air';B.wrCd=.45;B.airT=.1;B.jumped=false;B.cut=true;ev.push('wallend');return}
    const f=floorAt(W,B.x,B.z,B.y);if(B.y<=f){B.y=f;B.mode='ground';B.grounded=true;B.vy=0}}
  function ledge(W,B,inp,dt,m,ev){
    B.vx=B.vz=B.vy=0;B.spd=0;
    if(inp.slide){B.mode='air';B.ledgeCd=.5;B.airT=.2;B.jumped=false;B.cut=true;B.lbox=null;ev.push('drop');return}
    if(B.mt>=.18&&(B.buf>0||m>.25)){B.buf=0;B.mode='mantle';B.mt=0;B.vy0=B.y;B.mx0=B.x;B.mz0=B.z;ev.push('mantle');gain(B,.08);return}
    if(B.mt>3){B.mode='air';B.ledgeCd=.6;B.lbox=null}}
  function mantle(W,B,dt,ev){
    const u=Math.min(1,B.mt/.62),e=u*u*(3-2*u),tx=B.ln.x,tz=B.ln.z;
    B.y=B.vy0+(B.ltop-B.vy0)*Math.min(1,e*1.15);const sl=Math.max(0,(u-.45)/.55);B.x=B.mx0-tx*.75*sl;B.z=B.mz0-tz*.75*sl;B.vx=B.vz=0;
    if(u>=1){B.y=B.ltop;B.mode='ground';B.grounded=true;B.vy=0;B.lbox=null;setV(B,Math.atan2(-tx,-tz),3.2)}}
  function roll(W,B,dt,ev){
    const s=Math.max(3.5,B.spd-4*dt);setV(B,heading(B),s);B.x+=B.vx*dt;B.z+=B.vz*dt;bounce(B,collide(W,B));
    const f=floorAt(W,B.x,B.z,B.y);if(B.y>f+.1){B.mode='air';B.grounded=false;B.airT=0;B.jumped=false;B.cut=true;return}B.y=f;
    if(B.mt>.52){B.mode='ground';setV(B,heading(B),Math.max(B.spd,6))}}
  // ---------- animation / HUD mapping ----------
  // name of the clip family that should play for this body + a time scale
  function animOf(B){
    const M=B.mode;let a='idle',ts=1;
    if(M==='ground'){const s=B.spd;if(B.stumble>0)a='stumble';else if(s<.6)a='idle';else if(s<4.2){a='jog';ts=cl(s/3.4,.7,1.5)}else if(s<8.2){a='run';ts=cl(s/6.5,.8,1.5)}else{a='sprint';ts=cl(s/10.5,.8,1.7)}}
    else if(M==='air'){a=B.flip||B.spinT>0?(B.flip&&B.flipK==='back'?'flipB':'flipF'):B.diving?'fall':B.vy>1?'jump':'fall'}
    else if(M==='slide')a='slide';else if(M==='vault')a=B.vk==='low'?'vaultL':'vaultH';
    else if(M==='wallrun')a='wallrun';else if(M==='wallup')a='wallup';else if(M==='ledge')a='hang';else if(M==='mantle')a='mantle';else if(M==='roll')a='roll';
    B.anim=a;B.ts=ts;return a}
  return{G,JUMP,R,HT,RUN0,RUNX,makeWorld,addBox,near,floorAt,ceilAt,ray,newBody,step,animOf,maxRun,collide,CFG:{G,JUMP,STEP,WR_MAX}}})();
