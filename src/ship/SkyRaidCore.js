// SKY RAID core: PURE rules and simulation (no THREE, no DOM, no network). One co-op airship raids a chain of floating fortresses above the sky island:
// destroy a fortress's shield generators, then its core; four fortresses, the last one a boss with phases. The HOST runs step(); guests mirror it
// from snapshot()/apply(). Rendering, input, HUD and net live in SkyRaid.js. Run under node for tests/skyraid.sim.js.
//
// Units: metres, seconds. Heading h: forward = (sin h, cos h). Stick x>0 turns right (h decreases, as in the rally). Pitch>0 nose up.
const SkyCore=(()=>{
  const SHIP={vmin:16,cruise:32,vmax:44,boostMul:1.55,boostT:2.0,boostCool:7,turn:1.0,turnLerp:2.6,pitchMax:.62,pitchLerp:2.4,hull:380,r:9,hitInv:.35,leash:1050,floor:-130,ceil:230,rollT:.6,rollCd:4};
  const MSL={speed:118,turn:3.4,dmg:55,life:3.6,cd:11,n:3,cone:.86,range:430};
  const SAM={speed:50,turn:1.15,dmg:28,life:7,max:2};
  const COMBO={t:4};
  const GUN={dmg:15,rate:.2,range:340,cone:.9962,heat:.13,cool:.4,lock:1.6,autoDmg:12,autoRate:.45,autoAcc:.6,autoRange:300};
  const TURRET={hp:46,r:4.2,range:290,minCd:1.7,maxCd:3.0,speed:92,dmg:10,life:4.2,err:.045};
  const DRONE={hp:24,r:3.6,speed:40,orbit:75,range:210,cd:2.1,burst:3,speed2:84,dmg:6,max:5,wave:26,life:3};
  const FORTS=[
    {id:'outpost',  n:'Outpost',  turrets:5, gens:2, core:240, plat:50, drones:2, dy:-10, spin:.00},
    {id:'bastion',  n:'Bastion',  turrets:7, gens:2, core:340, plat:54, drones:3, dy:30,  spin:.00},
    {id:'citadel',  n:'Citadel',  turrets:9, gens:3, core:460, plat:60, drones:4, dy:70,  spin:.06},
    {id:'dread',    n:'Dreadnought', turrets:10,gens:4, core:750, plat:70, drones:4, dy:20, spin:.10, boss:1}];
  const PAY={stage:[60,90,140,0],boss:420,hull:120,time:90,par:[150,170,210,300]};
  const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
  const dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

  // where the fortresses float: a ring around the sky island, each further out and at a different height
  function sites(o){
    const a0=(o.a0!=null?o.a0:.7),out=[];
    for(let k=0;k<FORTS.length;k++){const a=a0+k*1.35,d=520+70*k;out.push({x:o.cx+Math.sin(a)*d,z:o.cz+Math.cos(a)*d,y:o.base+FORTS[k].dy})}
    return out;
  }
  function newRun(o){
    o=o||{};const r=rng(o.seed||1),S=sites(o),a0=o.a0!=null?o.a0:.7,sx=o.cx-Math.sin(a0)*270,sz=o.cz-Math.cos(a0)*270;
    const run={o,t:0,rnd:r,sites:S,stage:-1,state:'ready',hasGunner:!!o.hasGunner,
      ship:{x:sx,y:o.base+85,z:sz,h:a0,p:0,roll:0,v:SHIP.cruise,hull:Math.round(SHIP.hull*(o.hasGunner?1:1.35)),hullMax:Math.round(SHIP.hull*(o.hasGunner?1:1.35)),inv:0,boost:0,boostCd:0,hitT:0,turnR:0,rollT:0,rollCd:0,rollDir:1},
      fort:null,drones:[],shots:[],msl:[],sams:[],mCd:0,combo:{n:0,t:0},droneT:0,heat:0,lock:0,gunCd:0,autoCd:0,autoAim:null,score:{kills:0,turrets:0,drones:0,hits:0,taken:0,shots:0,bonus:0,best:0,sams:0},tDone:0,ev:[]};
    return run;
  }
  function buildFort(run,k){
    const F=FORTS[k],S=run.sites[k],r=rng((run.o.seed||1)*131+k*7919),turrets=[],gens=[];
    for(let i=0;i<F.turrets;i++){const a=i/F.turrets*Math.PI*2+r()*.3,rr=F.plat*.62+r()*8;turrets.push({id:'t'+i,x:S.x+Math.sin(a)*rr,z:S.z+Math.cos(a)*rr,y:S.y+7+(i%2)*9,hp:TURRET.hp*(F.boss?1.1:1),max:TURRET.hp*(F.boss?1.1:1),cd:1+r()*TURRET.maxCd,a,alive:1})}
    for(let i=0;i<F.gens;i++){const a=i/F.gens*Math.PI*2+.6,rr=F.plat*.3;gens.push({id:'g'+i,x:S.x+Math.sin(a)*rr,z:S.z+Math.cos(a)*rr,y:S.y+10,hp:90,max:90,alive:1})}
    return {k,F,site:S,turrets,gens,core:{id:'core',x:S.x,y:S.y+20,z:S.z,hp:F.core,max:F.core,alive:1},ph:0,regen:0,spin:0,done:0};
  }
  const live=a=>a.filter(x=>x.alive);
  function shield(f){return f.gens.some(g=>g.alive)}

  function startStage(run,k){
    run.stage=k;run.fort=buildFort(run,k);run.shots.length=0;run.msl.length=0;run.sams.length=0;run.drones.length=0;run.droneT=6;run.state='raid';
    run.ev.push({k:'stage',stage:k,name:FORTS[k].n,boss:!!FORTS[k].boss});
    for(let i=0;i<FORTS[k].drones;i++)spawnDrone(run);
  }
  function spawnDrone(run){
    if(run.drones.length>=DRONE.max)return;const a=run.rnd()*Math.PI*2,s=run.ship;
    run.drones.push({id:'d'+(run.nid=(run.nid||0)+1),x:s.x+Math.sin(a)*230,y:s.y+(run.rnd()-.5)*60,z:s.z+Math.cos(a)*230,vx:0,vy:0,vz:0,hp:DRONE.hp,max:DRONE.hp,cd:1.5+run.rnd()*DRONE.cd,ph:run.rnd()*6.28,alive:1,burst:0});
  }

  // ---- the airship ----
  function shipStep(run,inp,dt){
    const s=run.ship;if(s.hull<=0)return;
    inp=inp||{};const ix=clamp(inp.ix||0,-1,1),iy=clamp(inp.iy||0,-1,1);
    s.boostCd=Math.max(0,s.boostCd-dt);s.inv=Math.max(0,s.inv-dt);s.hitT=Math.max(0,s.hitT-dt);s.rollCd=Math.max(0,s.rollCd-dt);s.rollT=Math.max(0,s.rollT-dt);
    if(inp.roll&&s.rollT<=0&&s.rollCd<=0){s.rollT=SHIP.rollT;s.rollCd=SHIP.rollCd;s.rollDir=ix<-.2?-1:1;s.inv=Math.max(s.inv,SHIP.rollT);run.ev.push({k:'roll'})}
    if(inp.boost&&s.boost<=0&&s.boostCd<=0){s.boost=SHIP.boostT;s.boostCd=SHIP.boostCool+SHIP.boostT;run.ev.push({k:'boost'})}
    if(s.boost>0)s.boost=Math.max(0,s.boost-dt);
    const tgtV=(s.boost>0?SHIP.vmax*SHIP.boostMul:SHIP.cruise+(iy<-.2?(-iy-.2)*8:0)-(iy>.2?(iy-.2)*10:0)),tv=clamp(tgtV,SHIP.vmin,SHIP.vmax*SHIP.boostMul);
    s.v+=(tv-s.v)*(1-Math.exp(-dt*1.4));
    const turn=-ix*SHIP.turn;s.turnR+=(turn-s.turnR)*(1-Math.exp(-dt*SHIP.turnLerp));s.h=wrap(s.h+s.turnR*dt);
    const tp=-iy*SHIP.pitchMax;s.p+=(tp-s.p)*(1-Math.exp(-dt*SHIP.pitchLerp));
    s.roll+=((-s.turnR*.55)-s.roll)*(1-Math.exp(-dt*3));
    const c=Math.cos(s.p);s.x+=Math.sin(s.h)*c*s.v*dt;s.z+=Math.cos(s.h)*c*s.v*dt;s.y+=Math.sin(s.p)*s.v*dt;
    const base=run.o.base;if(s.y<base+SHIP.floor){s.y=base+SHIP.floor;if(s.p<0)s.p*=.5}if(s.y>base+SHIP.ceil){s.y=base+SHIP.ceil;if(s.p>0)s.p*=.5}
    // leash: past the edge of the raid area the ship is steered back toward the island (a soft wall, never a death)
    const dx=run.o.cx-s.x,dz=run.o.cz-s.z,dd=Math.hypot(dx,dz);run.leash=dd>SHIP.leash-120;
    if(dd>SHIP.leash-120){const want=Math.atan2(dx,dz),k=clamp((dd-(SHIP.leash-120))/120,0,1);s.h=wrap(s.h+wrap(want-s.h)*k*dt*1.6)}
    // fortress rock and tower: solid. A scrape hurts a little and shoves you clear.
    const f=run.fort;if(f&&!f.done){
      const S=f.site,rr=Math.hypot(s.x-S.x,s.z-S.z),R=f.F.plat+SHIP.r*.6;
      if(rr<R&&s.y<S.y+5&&s.y>S.y-34){const nx=(s.x-S.x)/(rr||1),nz=(s.z-S.z)/(rr||1);s.x=S.x+nx*R;s.z=S.z+nz*R;s.v*=.7;hurt(run,9,'rock')}
      else if(rr<14&&s.y>S.y+5&&s.y<S.y+34){const nx=(s.x-S.x)/(rr||1),nz=(s.z-S.z)/(rr||1);s.x=S.x+nx*14;s.z=S.z+nz*14;s.v*=.7;hurt(run,9,'tower')}
    }
  }
  function hurt(run,n,src){
    const s=run.ship;if(s.hull<=0||s.inv>0&&src!=='rock'&&src!=='tower')return;if(s.inv>0)return;
    run.combo.n=0;s.hull=Math.max(0,s.hull-n);s.inv=SHIP.hitInv;s.hitT=.5;run.score.taken+=n;run.ev.push({k:'hurt',n,src,x:s.x,y:s.y,z:s.z});
    if(s.hull<=0){run.state='fail';run.ev.push({k:'fail'})}
  }

  // ---- shooting ----
  const rayT=(o,d,c,r,range)=>{ // distance along the unit ray to a sphere, or -1
    const ox=c.x-o.x,oy=c.y-o.y,oz=c.z-o.z,t=ox*d.x+oy*d.y+oz*d.z;if(t<0||t>range)return -1;
    const px=ox-d.x*t,py=oy-d.y*t,pz=oz-d.z*t;return px*px+py*py+pz*pz<=r*r?t:-1};
  function targets(run){
    const L=[],f=run.fort;if(f&&!f.done){
      for(const t of f.turrets)if(t.alive)L.push({o:t,r:TURRET.r,kind:'turret'});
      for(const g of f.gens)if(g.alive)L.push({o:g,r:5.5,kind:'gen'});
      if(f.core.alive)L.push({o:f.core,r:shield(f)?13:9,kind:shield(f)?'shield':'core'})}
    for(const d of run.drones)if(d.alive)L.push({o:d,r:DRONE.r+.6,kind:'drone'});
    for(const m of run.sams)if(m.alive)L.push({o:m,r:3.8,kind:'sam'});
    return L;
  }
  // a unit direction -> what it hits (with a small aim assist: the nearest target inside a ~5 degree cone is where the shot goes)
  function shoot(run,from,dir,dmg,assist){
    const L=targets(run);let best=null,bt=1e9;
    for(const q of L){const t=rayT(from,dir,q.o,q.r,GUN.range);if(t>=0&&t<bt){bt=t;best=q}}
    if(!best&&assist!==false){
      let bc=GUN.cone;for(const q of L){if(q.kind==='shield')continue;const v={x:q.o.x-from.x,y:q.o.y-from.y,z:q.o.z-from.z},l=Math.hypot(v.x,v.y,v.z);if(l>GUN.range||l<8)continue;const c=(v.x*dir.x+v.y*dir.y+v.z*dir.z)/l;if(c>bc){bc=c;best=q;bt=l}}
    }
    const end=best?{x:from.x+dir.x*bt,y:from.y+dir.y*bt,z:from.z+dir.z*bt}:{x:from.x+dir.x*GUN.range,y:from.y+dir.y*GUN.range,z:from.z+dir.z*GUN.range};
    if(best){const t=best.o;end.x=t.x;end.y=t.y;end.z=t.z}
    run.score.shots++;run.ev.push({k:'tracer',x:from.x,y:from.y,z:from.z,tx:end.x,ty:end.y,tz:end.z,hit:best?best.kind:null});
    if(best)damage(run,best,dmg);
    return best?best.kind:null;
  }
  function damage(run,q,n){
    const t=q.o;if(q.kind==='shield'){run.ev.push({k:'spark',x:t.x,y:t.y,z:t.z});return}
    t.hp-=n;run.score.hits++;run.ev.push({k:'dmg',n:Math.round(n),x:t.x,y:t.y+3,z:t.z,kind:q.kind});
    if(t.hp>0)return;t.alive=0;t.hp=0;if(q.kind!=='core')kill(run,q.kind);
    if(q.kind==='sam'){run.score.sams++;run.ev.push({k:'boom',x:t.x,y:t.y,z:t.z,s:.6});return}
    if(q.kind==='turret'){run.score.turrets++;run.ev.push({k:'boom',x:t.x,y:t.y,z:t.z,s:1})}
    else if(q.kind==='drone'){run.score.drones++;run.ev.push({k:'boom',x:t.x,y:t.y,z:t.z,s:.7})}
    else if(q.kind==='gen'){run.ev.push({k:'boom',x:t.x,y:t.y,z:t.z,s:1.4});run.ev.push({k:'gen',left:run.fort.gens.filter(g=>g.alive).length})}
    else if(q.kind==='core')coreDown(run);
  }
  // kill streak: every kill inside 4 s of the last one raises the combo (a hit on the ship resets it); each kill banks coin bonus
  function kill(run,kind){const c=run.combo;c.n++;c.t=COMBO.t;run.score.bonus+=Math.min(c.n,8)*(kind==='sam'?2:1);run.score.best=Math.max(run.score.best,c.n);run.ev.push({k:'combo',n:c.n,kind})}
  function coreDown(run){
    const f=run.fort;f.done=1;const c=f.core;run.score.kills++;
    run.ev.push({k:'boom',x:c.x,y:c.y,z:c.z,s:3});run.ev.push({k:'cleared',stage:f.k,boss:!!f.F.boss});
    for(const t of f.turrets)t.alive=0;run.shots.length=0;
    const s=run.ship;s.hull=Math.min(s.hullMax,s.hull+s.hullMax*.45);
    if(f.F.boss){run.state='win';run.tDone=run.t;run.ev.push({k:'win'})}
    else{run.state='transit';run.transit=3.2}
  }

  // ---- enemies ----
  function aimLead(from,s,speed,err,rnd){
    const t0=Math.hypot(s.x-from.x,s.y-from.y,s.z-from.z)/speed;
    const px=s.x+Math.sin(s.h)*Math.cos(s.p)*s.v*t0,py=s.y+Math.sin(s.p)*s.v*t0,pz=s.z+Math.cos(s.h)*Math.cos(s.p)*s.v*t0;
    let dx=px-from.x,dy=py-from.y,dz=pz-from.z;const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
    dx+=(rnd()-.5)*2*err;dy+=(rnd()-.5)*2*err;dz+=(rnd()-.5)*2*err;const m=Math.hypot(dx,dy,dz);return {x:dx/m,y:dy/m,z:dz/m};
  }
  function enemyShot(run,from,speed,dmg,life,err,kind){
    if(run.shots.length>=18)return;
    const d=aimLead(from,run.ship,speed,err,run.rnd);
    run.shots.push({x:from.x,y:from.y,z:from.z,vx:d.x*speed,vy:d.y*speed,vz:d.z*speed,dmg,life,kind});
    run.ev.push({k:'eshot',x:from.x,y:from.y,z:from.z,kind});
  }
  // homing SAM missiles (from the Bastion on): slower than a boosting ship, turn-limited, so a hard turn, a barrel roll or a shot kills/dodges them
  function launchSam(run,from){const s=run.ship,l=Math.hypot(s.x-from.x,s.y-from.y,s.z-from.z)||1;
    run.sams.push({id:'s'+(run.nid=(run.nid||0)+1),x:from.x,y:from.y+3,z:from.z,vx:(s.x-from.x)/l*SAM.speed*.5,vy:SAM.speed*.5,vz:(s.z-from.z)/l*SAM.speed*.5,hp:1,max:1,alive:1,life:SAM.life});run.ev.push({k:'sam',x:from.x,y:from.y,z:from.z})}
  function steerTo(m,tx,ty,tz,turn,speed,dt){let dx=tx-m.x,dy=ty-m.y,dz=tz-m.z;const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
    let vl=Math.hypot(m.vx,m.vy,m.vz)||1,ux=m.vx/vl,uy=m.vy/vl,uz=m.vz/vl;const k=clamp(turn*dt,0,1);ux+=(dx-ux)*k;uy+=(dy-uy)*k;uz+=(dz-uz)*k;const n=Math.hypot(ux,uy,uz)||1;
    vl=Math.min(speed,vl+speed*1.6*dt);m.vx=ux/n*vl;m.vy=uy/n*vl;m.vz=uz/n*vl}
  function missilesStep(run,dt){
    const s=run.ship;
    for(let i=run.sams.length-1;i>=0;i--){const m=run.sams[i];if(!m.alive){run.sams.splice(i,1);continue}
      m.life-=dt;steerTo(m,s.x,s.y,s.z,SAM.turn,SAM.speed,dt);m.x+=m.vx*dt;m.y+=m.vy*dt;m.z+=m.vz*dt;
      if(s.hull>0&&Math.hypot(m.x-s.x,m.y-s.y,m.z-s.z)<SHIP.r+2.5){if(s.inv<=0)hurt(run,SAM.dmg,'sam');run.ev.push({k:'boom',x:m.x,y:m.y,z:m.z,s:.8});run.sams.splice(i,1);continue}
      if(m.life<=0){run.ev.push({k:'boom',x:m.x,y:m.y,z:m.z,s:.4});run.sams.splice(i,1)}}
    if(!run.msl.length)return;const L=targets(run);
    for(let i=run.msl.length-1;i>=0;i--){const m=run.msl[i];m.life-=dt;const q=L.find(x=>x.o.id===m.tid&&x.kind!=='shield');
      if(q)steerTo(m,q.o.x,q.o.y,q.o.z,MSL.turn,MSL.speed,dt);else{const l=Math.hypot(m.vx,m.vy,m.vz)||1,v=Math.min(MSL.speed,l+MSL.speed*1.6*dt);m.vx*=v/l;m.vy*=v/l;m.vz*=v/l}
      m.x+=m.vx*dt;m.y+=m.vy*dt;m.z+=m.vz*dt;
      if(q&&Math.hypot(m.x-q.o.x,m.y-q.o.y,m.z-q.o.z)<q.r+2.5){run.ev.push({k:'boom',x:m.x,y:m.y,z:m.z,s:.8});damage(run,q,MSL.dmg);run.msl.splice(i,1);continue}
      if(m.life<=0){run.ev.push({k:'boom',x:m.x,y:m.y,z:m.z,s:.4});run.msl.splice(i,1)}}
  }
  function enemiesStep(run,dt){
    const s=run.ship,f=run.fort;
    if(f&&!f.done&&s.hull>0){
      const F=f.F;f.spin+=F.spin*dt;
      // boss phases: at 66% and 33% core health the shield regenerates once and a drone wave arrives
      if(F.boss){const frac=f.core.hp/f.core.max,ph=frac<.34?2:frac<.67?1:0;
        if(ph>f.ph){f.ph=ph;for(const g of f.gens){g.alive=1;g.hp=g.max*.6}for(const t of f.turrets)if(!t.alive&&run.rnd()<.5){t.alive=1;t.hp=t.max*.6}
          for(let i=0;i<4;i++)spawnDrone(run);run.ev.push({k:'phase',ph})}}
      const calm=!shield(f)?.78:1;                   // with the shield down the fortress panics a little... and fires slower
      for(let ti=0;ti<f.turrets.length;ti++){const t=f.turrets[ti];if(!t.alive)continue;t.cd-=dt;if(t.cd>0)continue;
        if(Math.hypot(t.x-s.x,t.y-s.y,t.z-s.z)>TURRET.range){t.cd=.4;continue}
        t.cd=(TURRET.minCd+run.rnd()*(TURRET.maxCd-TURRET.minCd))*(F.boss?.9:1)/calm*(F.boss?1:1.05);
        if(f.k>=1&&ti%3===0&&run.sams.length<SAM.max&&run.rnd()<.45){launchSam(run,t)}else enemyShot(run,t,TURRET.speed,TURRET.dmg,TURRET.life,TURRET.err,'t')}
    }
    // drones: orbit the ship at ~75 m and fire short bursts
    for(const d of run.drones){if(!d.alive)continue;
      d.ph+=dt*.55;const tx=s.x+Math.sin(d.ph+(d.id.length))*DRONE.orbit,tz=s.z+Math.cos(d.ph+(d.id.length))*DRONE.orbit,ty=s.y+8+Math.sin(d.ph*1.7)*14;
      let ax=tx-d.x,ay=ty-d.y,az=tz-d.z;const l=Math.hypot(ax,ay,az)||1;ax=ax/l*DRONE.speed;ay=ay/l*DRONE.speed;az=az/l*DRONE.speed;
      const k=1-Math.exp(-dt*1.6);d.vx+=(ax-d.vx)*k;d.vy+=(ay-d.vy)*k;d.vz+=(az-d.vz)*k;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;
      d.cd-=dt;if(d.burst>0){d.bt=(d.bt||0)-dt;if(d.bt<=0){d.bt=.16;d.burst--;enemyShot(run,d,DRONE.speed2,DRONE.dmg,DRONE.life,.05,'d')}}
      else if(d.cd<=0&&Math.hypot(d.x-s.x,d.y-s.y,d.z-s.z)<DRONE.range){d.cd=DRONE.cd+run.rnd();d.burst=DRONE.burst;d.bt=0}}
    run.drones=run.drones.filter(d=>d.alive);
    if(f&&!f.done&&run.state==='raid'){run.droneT-=dt;if(run.droneT<=0){run.droneT=DRONE.wave;if(run.drones.length<DRONE.max-1){spawnDrone(run);spawnDrone(run)}}}
    // enemy shots
    for(let i=run.shots.length-1;i>=0;i--){const p=run.shots[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      if(s.hull>0&&Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z)<SHIP.r+1.6){hurt(run,p.dmg,'shot');run.ev.push({k:'boom',x:p.x,y:p.y,z:p.z,s:.5});run.shots.splice(i,1);continue}
      if(p.life<=0)run.shots.splice(i,1)}
  }

  // ---- the gunner: a player (aim = {yaw (relative to the ship's heading), pit}) or the AI crew mate ----
  function gunnerStep(run,inp,dt){
    const s=run.ship;if(s.hull<=0)return;
    run.gunCd=Math.max(0,run.gunCd-dt);run.autoCd=Math.max(0,run.autoCd-dt);
    const pos={x:s.x,y:s.y+6,z:s.z};
    if(run.hasGunner){
      run.heat=Math.max(0,run.heat-GUN.cool*dt);run.lock=Math.max(0,run.lock-dt);run.mCd=Math.max(0,run.mCd-dt);
      if(inp&&inp.missile&&run.mCd<=0){          // missile salvo: up to 3 homing missiles at the targets nearest the crosshair
        const a=inp.aim||{yaw:0,pit:0},yw=s.h+a.yaw,cp=Math.cos(a.pit),d={x:Math.sin(yw)*cp,y:Math.sin(a.pit),z:Math.cos(yw)*cp},C=[];
        for(const q of targets(run)){if(q.kind==='shield'||q.kind==='sam')continue;const v={x:q.o.x-pos.x,y:q.o.y-pos.y,z:q.o.z-pos.z},l=Math.hypot(v.x,v.y,v.z);if(l>MSL.range||l<10)continue;const c=(v.x*d.x+v.y*d.y+v.z*d.z)/l;if(c>MSL.cone)C.push({q,c})}
        C.sort((x,y)=>y.c-x.c);run.mCd=MSL.cd;run.ev.push({k:'msl'});
        for(let i=0;i<MSL.n;i++){const tg=C.length?C[i%C.length].q:null,sp=(i-1)*.18;
          run.msl.push({x:pos.x,y:pos.y+1,z:pos.z,vx:(d.x+Math.cos(yw)*sp)*MSL.speed*.5+Math.sin(s.h)*s.v*.5,vy:(d.y+(i===1?.12:0))*MSL.speed*.5,vz:(d.z-Math.sin(yw)*sp)*MSL.speed*.5+Math.cos(s.h)*s.v*.5,tid:tg?tg.o.id:null,life:MSL.life})}}
      if(inp&&inp.fire&&run.gunCd<=0&&run.lock<=0&&run.heat<1){
        const a=inp.aim||{yaw:0,pit:0},yw=s.h+a.yaw,cp=Math.cos(a.pit);
        run.gunCd=GUN.rate;run.heat+=GUN.heat;if(run.heat>=1){run.heat=1;run.lock=GUN.lock;run.ev.push({k:'overheat'})}
        shoot(run,pos,{x:Math.sin(yw)*cp,y:Math.sin(a.pit),z:Math.cos(yw)*cp},GUN.dmg)}
    }else if(run.autoCd<=0&&(run.fort&&!run.fort.done||run.drones.length)){
      // AI crew mate: picks the nearest live target (turrets that can shoot us first), shoots a bit wide
      let best=null,bd=GUN.autoRange;for(const q of targets(run)){if(q.kind==='shield')continue;const d=dist3(pos,q.o)-(q.kind==='turret'||q.kind==='drone'?30:0);if(d<bd){bd=d;best=q}}
      if(best){run.autoCd=GUN.autoRate;const hit=run.rnd()<GUN.autoAcc;const t=best.o,l=dist3(pos,t)||1;let dx=(t.x-pos.x)/l,dy=(t.y-pos.y)/l,dz=(t.z-pos.z)/l;
        if(!hit){dx+=(run.rnd()-.5)*.22;dy+=(run.rnd()-.5)*.22;dz+=(run.rnd()-.5)*.22;const m=Math.hypot(dx,dy,dz);dx/=m;dy/=m;dz/=m}
        shoot(run,pos,{x:dx,y:dy,z:dz},GUN.autoDmg,hit)}
    }
  }

  // ---- one step of the whole raid. inp = {ix,iy,boost,aim,fire}. Returns the events produced (also left in run.ev until the caller takes them). ----
  function step(run,dt,inp){
    run.ev=[];run.t+=dt;
    if(run.state==='ready'){startStage(run,0)}
    if(run.state==='fail'||run.state==='win'){shipStep(run,{},dt*.3);enemiesStep(run,dt);return run.ev}
    if(inp&&inp.auto)inp=Object.assign({},inp,autoPilot(run));
    shipStep(run,inp,dt);
    gunnerStep(run,inp,dt);
    enemiesStep(run,dt);missilesStep(run,dt);
    if(run.combo.n>0){run.combo.t-=dt;if(run.combo.t<=0)run.combo.n=0}
    if(run.state==='transit'){run.transit-=dt;if(run.transit<=0)startStage(run,run.stage+1)}
    return run.ev;
  }

  // ---- autopilot for the empty pilot seat (solo gunner): flies to the marker, orbits the fortress ~170 m out, holds altitude, weaves, rolls away from missiles ----
  function autoPilot(run){
    const s=run.ship,m=marker(run),f=run.fort,out={ix:0,iy:0,boost:false,roll:false};if(!m)return out;
    const dx=m.x-s.x,dz=m.z-s.z,d=Math.hypot(dx,dz),brg=Math.atan2(dx,dz),orbit=run.state==='raid'&&f&&!f.done;
    let off=0;if(orbit){off=Math.PI/2*clamp((300-d)/110,0,1);if(d<170)off+=(170-d)/170*.9}
    let want=brg+off;
    for(const p of run.sams){const l=Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z);if(l<150){want+=((p.x-s.x)*Math.cos(s.h)-(p.z-s.z)*Math.sin(s.h)>0?-.5:.5);if(l<48&&s.rollCd<=0)out.roll=true}}
    for(const p of run.shots){const l=Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z);if(l<34&&s.rollCd<=0&&s.hull<s.hullMax*.7)out.roll=true}
    const ty=(orbit?f.site.y+30:m.y+35)+(orbit?Math.sin(run.t/3)*10:0);
    out.ix=-clamp(wrap(want-s.h)*2.2,-1,1)+(orbit?Math.sin(run.t*1.3)*.25:0);out.iy=-clamp((ty-s.y)*.05,-1,1);
    out.boost=d>480&&s.boostCd<=0;return out;
  }

  // ---- what the HUD and the compass need ----
  function objective(run){
    const f=run.fort;if(run.state==='win')return 'RAID COMPLETE';if(run.state==='fail')return 'SHIP LOST';if(run.state==='transit')return 'Fortress down! Next target marked.';
    if(!f)return '';const g=f.gens.filter(x=>x.alive).length,t=f.turrets.filter(x=>x.alive).length;
    return g?`${f.F.n}: destroy the shield generators (${g} left) · ${t} turrets`:`${f.F.n}: SHIELD DOWN, blast the core!`;
  }
  function marker(run){const f=run.fort;if(run.state==='transit'&&run.sites[run.stage+1])return run.sites[run.stage+1];return f&&!f.done?f.site:null}
  function payout(run){
    const st=Math.max(0,Math.min(run.stage+(run.state==='win'?1:0),FORTS.length));let c=0;
    for(let i=0;i<st;i++)c+=PAY.stage[i]||0;
    if(run.state==='win'){c+=PAY.boss;c+=Math.round(PAY.hull*run.ship.hull/run.ship.hullMax);const par=PAY.par.reduce((a,b)=>a+b,0);c+=Math.round(PAY.time*clamp((par-run.tDone)/par+.35,0,1))}
    c+=Math.min(160,run.score.bonus|0);
    if(run.state!=='win')c=Math.round(c*.6);
    return c;
  }

  // ---- net: compact snapshot of everything that changes; apply() mirrors it onto a guest's run ----
  const q=(v,p)=>Math.round(v*p)/p;
  function snapshot(run){
    const s=run.ship,f=run.fort;
    return {t:q(run.t,100),st:run.state,sg:run.stage,hg:run.hasGunner?1:0,
      s:[q(s.x,10),q(s.y,10),q(s.z,10),q(s.h,1000),q(s.p,1000),q(s.roll,1000),q(s.v,10),Math.round(s.hull),s.boost>0?1:0,q(s.boostCd,10),q(s.rollT,100),q(s.rollCd,10),s.rollDir],
      f:f?{k:f.k,t:f.turrets.map(x=>x.alive?Math.round(x.hp):0),g:f.gens.map(x=>x.alive?Math.round(x.hp):0),c:Math.round(f.core.alive?f.core.hp:0),ph:f.ph,dn:f.done?1:0}:null,
      d:run.drones.map(d=>[d.id,q(d.x,10),q(d.y,10),q(d.z,10),Math.round(d.hp)]),
      e:run.shots.map(p=>[q(p.x,10),q(p.y,10),q(p.z,10),q(p.vx,10),q(p.vy,10),q(p.vz,10)]),
      ml:run.msl.map(m=>[q(m.x,10),q(m.y,10),q(m.z,10),q(m.vx,10),q(m.vy,10),q(m.vz,10)]),sm:run.sams.map(m=>[m.id,q(m.x,10),q(m.y,10),q(m.z,10),q(m.vx,10),q(m.vy,10),q(m.vz,10)]),mc:q(run.mCd,10),cb:[run.combo.n,q(run.combo.t,10)],
      h:q(run.heat,100),lk:run.lock>0?1:0,sc:run.score,tr:q(run.transit||0,10)};
  }
  function apply(run,sn){
    run.t=sn.t;run.state=sn.st;run.hasGunner=!!sn.hg;const s=run.ship,a=sn.s;
    s.x=a[0];s.y=a[1];s.z=a[2];s.h=a[3];s.p=a[4];s.roll=a[5];s.v=a[6];s.hull=a[7];s.boost=a[8]?1:0;s.boostCd=a[9];s.rollT=a[10]||0;s.rollCd=a[11]||0;s.rollDir=a[12]||1;
    if(sn.f){if(!run.fort||run.fort.k!==sn.f.k){run.fort=buildFort(run,sn.f.k)}const f=run.fort;
      f.turrets.forEach((t,i)=>{t.hp=sn.f.t[i]||0;t.alive=t.hp>0?1:0});f.gens.forEach((g,i)=>{g.hp=sn.f.g[i]||0;g.alive=g.hp>0?1:0});f.core.hp=sn.f.c;f.core.alive=sn.f.c>0?1:0;f.ph=sn.f.ph;f.done=sn.f.dn}
    else run.fort=null;
    run.stage=sn.sg;
    const old=new Map(run.drones.map(d=>[d.id,d]));run.drones=sn.d.map(r=>{const d=old.get(r[0])||{id:r[0],vx:0,vy:0,vz:0,ph:0,max:DRONE.hp,alive:1};d.x=r[1];d.y=r[2];d.z=r[3];d.hp=r[4];return d});
    run.shots=sn.e.map(r=>({x:r[0],y:r[1],z:r[2],vx:r[3],vy:r[4],vz:r[5],life:1}));
    run.msl=(sn.ml||[]).map(r=>({x:r[0],y:r[1],z:r[2],vx:r[3],vy:r[4],vz:r[5],life:1}));run.sams=(sn.sm||[]).map(r=>({id:r[0],x:r[1],y:r[2],z:r[3],vx:r[4],vy:r[5],vz:r[6],hp:1,alive:1}));run.mCd=sn.mc||0;run.combo={n:sn.cb?sn.cb[0]:0,t:sn.cb?sn.cb[1]:0};
    run.heat=sn.h;run.lock=sn.lk?1:0;run.score=sn.sc;run.transit=sn.tr;
  }

  const API={MSL,SAM,COMBO,autoPilot,SHIP,GUN,TURRET,DRONE,FORTS,PAY,sites,newRun,step,shoot,targets,objective,marker,payout,snapshot,apply,hurt,shield,buildFort,startStage};
  if(typeof module!=='undefined')module.exports=API;
  return API;
})();
