// SURF core: board physics, tricks, scoring and race courses. Pure maths (no THREE, no DOM): unit-tested in tests/surf.sim.js, driven by src/surf/Surf.js.
// The board slides on the REAL wave surface (Ocean.height / Ocean.slope): gravity pulls it down the face, so on a travelling wave it is pushed along with the wave,
// fins turn sideways slip into forward speed (a carve), paddling (stick) gets you onto a wave, and a steep crest launches you into the air where tricks live.
// env = { water(x,z) -> absolute surface y, slope(x,z) -> {x,z} (dh/dx, dh/dz), ground(x,z) -> terrain y }.
// inp = { tx,tz (unit world direction the stick points), mag (0..1), ix,iy (raw stick, screen axes: +x right, -y up), jump (edge), trick (edge), held (trick button is down) }.
const SurfCore=(()=>{
  const G=9.8,TAU=Math.PI*2;
  const K={PUSH:3.2,GAIN:1.05,ACC_MAX:15,PADDLE:4.6,PADDLE_MAX:5.2,GRIP:5.2,CARVE:.5,DRAG0:.16,DRAG1:.011,VMAX:30,JUMP:4.6,PUMP:2.6,PUMP_CD:1.1,STUN:1.15,STUN_CHILL:.45,SPIN:.62,FLIP:.78,COMBO_WIN:6};
  const wrap=a=>{a%=TAU;if(a>Math.PI)a-=TAU;if(a<-Math.PI)a+=TAU;return a};
  const turn=(a,t,m)=>{const d=wrap(t-a);return a+Math.max(-m,Math.min(m,d))};
  function create(x,z,hd,y){return{x,z,y:y||0,vx:0,vz:0,vy:0,hd:hd||0,air:false,tAir:0,hMax:0,vs:0,tk:null,tq:null,chain:[],grabT:0,vis:{yaw:0,pitch:0,roll:0},stun:0,pumpCd:0,
    onWave:0,combo:0,comboT:0,score:0,rideT:0,ridePts:0,best:0,speed:0,beach:false,face:0}}
  const done=(B,ev,name,base)=>{B.chain.push({n:name,b:base});ev.push({t:'trick',n:name,base})};
  function pick(inp){
    const iy=inp.iy||0,ix=inp.ix||0;
    if(iy<-.5)return{kind:'front',dir:1,dur:K.FLIP,name:'Frontflip',base:150,t:0,ang:0};
    if(iy>.5)return{kind:'back',dir:-1,dur:K.FLIP,name:'Backflip',base:150,t:0,ang:0};
    if(Math.abs(ix)>.35)return{kind:'spin',dir:ix>0?-1:1,dur:K.SPIN,name:'360',base:100,t:0,ang:0};
    return{kind:'grab',dir:0,dur:0,name:'Grab',base:60,t:0,ang:0}}
  // Trick button: in the air it starts (or queues) a trick; on the water it is a pump (a burst of speed along the board, with a short cooldown)
  function press(B,inp,ev){
    if(B.stun>0)return;
    if(B.air){const k=pick(inp);if(!B.tk)B.tk=k;else if(!B.tq&&k.kind!=='grab'&&B.tk.kind!=='grab')B.tq=k;return}
    if(B.pumpCd<=0){B.pumpCd=K.PUMP_CD;const sp=Math.hypot(B.vx,B.vz),g=Math.max(0,1-sp/18);B.vx+=Math.sin(B.hd)*K.PUMP*(.4+g);B.vz+=Math.cos(B.hd)*K.PUMP*(.4+g);ev.push({t:'pump'})}}
  function trickStep(B,inp,dt,ev){
    const k=B.tk;if(!k)return;k.t+=dt;
    if(k.kind==='grab'){if(inp.held){B.grabT+=dt;return}
      if(B.grabT>.3)done(B,ev,'Grab',60+Math.round(B.grabT*60));B.grabT=0;B.tk=B.tq;B.tq=null;return}
    const r=TAU/k.dur*dt;k.ang+=r;
    if(k.kind==='spin')B.vis.yaw+=k.dir*r;else B.vis.pitch+=k.dir*r;
    if(k.ang>=TAU){if(k.kind==='spin')B.vis.yaw=0;else B.vis.pitch=0;done(B,ev,k.name,k.base);B.tk=B.tq;B.tq=null}}
  function land(B,o,ev,yw){
    B.air=false;B.y=yw;B.vy=0;B.vs=0;
    // an unfinished trick that is nearly round still counts; otherwise it is a bail
    let bail=false;
    if(B.tk&&B.tk.kind!=='grab'){if(B.tk.ang>=TAU*.82)done(B,ev,B.tk.name,B.tk.base);else bail=true}
    if(B.tk&&B.tk.kind==='grab'&&B.grabT>.3)done(B,ev,'Grab',60+Math.round(B.grabT*60));
    const sp=Math.hypot(B.vx,B.vz);if(sp>3&&Math.abs(wrap(B.hd-Math.atan2(B.vx,B.vz)))>1.15)bail=true;
    B.vis.yaw=0;B.vis.pitch=0;B.tk=null;B.tq=null;B.grabT=0;
    if(bail){B.stun=o.chill?K.STUN_CHILL:K.STUN;B.vx*=.3;B.vz*=.3;B.combo=0;B.comboT=0;B.chain=[];ev.push({t:'wipe',air:+B.tAir.toFixed(2)});return}
    const names=B.chain.map(c=>c.n),base=B.chain.reduce((a,c)=>a+c.b,0);
    if(base>0||B.hMax>1.2){
      const variety=new Set(names).size,mult=1+.25*Math.max(0,B.chain.length-1)+.15*Math.max(0,variety-1);
      B.combo=B.comboT>0?B.combo+1:1;B.comboT=K.COMBO_WIN;const cm=Math.min(2.5,1+.2*(B.combo-1));
      const pts=Math.round((base+22*B.hMax+12*B.tAir)*mult*cm);
      B.score+=pts;B.best=Math.max(B.best,pts);ev.push({t:'land',pts,names,combo:B.combo,h:+B.hMax.toFixed(1),air:+B.tAir.toFixed(2)})}
    else ev.push({t:'land',pts:0,names:[],combo:B.combo,h:+B.hMax.toFixed(1),air:+B.tAir.toFixed(2)});
    B.chain=[]}
  function step(B,inp,dt,env,o){const ev=[];o=o||{};dt=Math.min(dt,.05);if(dt<=0)return ev;
    B.pumpCd=Math.max(0,B.pumpCd-dt);if(B.comboT>0){B.comboT-=dt;if(B.comboT<=0)B.combo=0}
    const yw0=env.water(B.x,B.z);
    if(B.stun>0){ // tumbling: no control, the sea carries the board
      B.stun-=dt;const dk=Math.exp(-2.4*dt);B.vx*=dk;B.vz*=dk;B.x+=B.vx*dt;B.z+=B.vz*dt;B.y+=(yw0-B.y)*Math.min(1,dt*8);B.vis.roll=Math.sin(B.stun*14)*.6;B.vis.pitch=0;B.vis.yaw=0;B.air=false;
      if(B.stun<=0){B.vis.roll=0;ev.push({t:'recover'})}B.speed=Math.hypot(B.vx,B.vz);return ev}
    if(inp.trick)press(B,inp,ev);
    const sp0=Math.hypot(B.vx,B.vz),m=inp.mag||0;
    // steering
    if(m>.08){const tgt=Math.atan2(inp.tx,inp.tz),rate=(B.air?3.6:2.3+3.2/(1+sp0*.28));B.hd=turn(B.hd,tgt,rate*dt*Math.min(1,m*1.5+.15))}
    else if(sp0>2&&!B.air)B.hd=turn(B.hd,Math.atan2(B.vx,B.vz),1.3*dt);
    const fx=Math.sin(B.hd),fz=Math.cos(B.hd);
    if(!B.air){
      const sl=env.slope(B.x,B.z);let ax=-G*K.GAIN*sl.x,az=-G*K.GAIN*sl.z;const am=Math.hypot(ax,az);if(am>K.ACC_MAX){ax*=K.ACC_MAX/am;az*=K.ACC_MAX/am}
      if(m>.08){const vf=B.vx*inp.tx+B.vz*inp.tz;if(vf<K.PADDLE_MAX){ax+=K.PADDLE*m*inp.tx;az+=K.PADDLE*m*inp.tz}}
      // the face carries you: on the front of a wave you are pulled up to the wave's own speed (along its travel direction); across the face you are free
      if(env.wave){const wv=env.wave(B.x,B.z);if(wv.w>0){const c=Math.hypot(wv.x,wv.z),ux=wv.x/c,uz=wv.z/c,vd=B.vx*ux+B.vz*uz;if(vd<c){const a=K.PUSH*(c-vd)*wv.w;ax+=a*ux;az+=a*uz}B.onWave=wv.w}else B.onWave=0}
      B.vx+=ax*dt;B.vz+=az*dt;
      const lx=Math.cos(B.hd),lz=-Math.sin(B.hd);let vf=B.vx*fx+B.vz*fz,vl=B.vx*lx+B.vz*lz;
      const lost=vl*(1-Math.exp(-K.GRIP*dt));vl-=lost;vf+=Math.abs(lost)*K.CARVE*Math.sign(vf||1);
      const dr=Math.exp(-(K.DRAG0+K.DRAG1*Math.abs(vf))*dt);vf*=dr;vl*=dr;
      B.vx=fx*vf+lx*vl;B.vz=fz*vf+lz*vl;
      const s2=Math.hypot(B.vx,B.vz);if(s2>K.VMAX){B.vx*=K.VMAX/s2;B.vz*=K.VMAX/s2}
      B.x+=B.vx*dt;B.z+=B.vz*dt;
      const yw=env.water(B.x,B.z),vS=(yw-B.y)/dt;
      // the face drops away under a fast-rising board (the lip): leave the water carrying the upward speed
      if(B.vs>2.4&&vS<B.vs-G*dt*1.2-.7){B.air=true;B.vy=B.vs;B.tAir=0;B.hMax=0;B.chain=[];ev.push({t:'launch',vy:+B.vs.toFixed(1),lip:true})}
      else{B.y=yw;B.vs+=(vS-B.vs)*Math.min(1,dt*14);
        if(inp.jump){B.air=true;B.vy=Math.max(0,B.vs)+K.JUMP+.1*Math.hypot(B.vx,B.vz);B.tAir=0;B.hMax=0;B.chain=[];ev.push({t:'launch',vy:+B.vy.toFixed(1),lip:false})}}
      // how much "wave" is under the board: steepness and speed -> ride points / spray
      const sn=Math.hypot(sl.x,sl.z);B.face=sn;const spd=Math.hypot(B.vx,B.vz);
      if(sn>.1&&spd>6){B.rideT+=dt;B.ridePts+=dt*spd*sn*9}
      B.vis.roll+=(Math.max(-.7,Math.min(.7,wrap(B.hd-Math.atan2(B.vx,B.vz||1e-6))*-.9*Math.min(1,spd/9)))-B.vis.roll)*Math.min(1,dt*7);
    }else{
      B.vy-=G*dt;B.y+=B.vy*dt;const dk=Math.exp(-.05*dt);B.vx*=dk;B.vz*=dk;B.x+=B.vx*dt;B.z+=B.vz*dt;B.tAir+=dt;
      const yw=env.water(B.x,B.z);B.hMax=Math.max(B.hMax,B.y-yw);trickStep(B,inp,dt,ev);
      if(B.y<=yw&&B.vy<=0)land(B,o,ev,yw)}
    // beached: the water is gone under the board
    B.beach=!B.air&&env.ground(B.x,B.z)>env.water(B.x,B.z)-.25;if(B.beach)ev.push({t:'beach'});
    B.speed=Math.hypot(B.vx,B.vz);return ev}
  // ---- race course ("Reef Run"): gates along the diagonal a surfer rides across a peeling wave, from the break's own geometry ----
  function course(sp,n){n=n||6;
    const d={x:sp.dx,z:sp.dz},c=Math.cos(sp.peel),s=Math.sin(sp.peel),dk={x:d.x*c-d.z*s,z:d.x*s+d.z*c};
    let t={x:-dk.z,z:dk.x};if(t.x*d.x+t.z*d.z<0)t={x:-t.x,z:-t.z};          // crest tangent, pointing toward the beach
    const len=sp.Wh*1.45,gates=[];
    for(let i=0;i<n;i++){const q=i/(n-1)-.5;gates.push({x:sp.x+d.x*(-.12*sp.Lh)+t.x*q*len,z:sp.z+d.z*(-.12*sp.Lh)+t.z*q*len,r:9.5})}
    return{gates,t,length:len}}
  function newRun(sp,n){const c=course(sp,n);return{spot:sp.id,gates:c.gates,i:0,t0:0,done:false,time:0}}
  function runStep(R,x,z,tNow){if(R.done)return null;const g=R.gates[R.i];if(!g)return null;
    if(Math.hypot(x-g.x,z-g.z)<g.r){if(R.i===0)R.t0=tNow;R.i++;if(R.i>=R.gates.length){R.done=true;R.time=tNow-R.t0;return{t:'finish',time:R.time}}return{t:'gate',i:R.i}}return null}
  return{K,create,step,press,course,newRun,runStep,wrap,turn}})();
if(typeof module!=='undefined')module.exports=SurfCore;
