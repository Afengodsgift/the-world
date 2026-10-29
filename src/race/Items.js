// Items: combat racing for Skybreak Rally. Pure (no THREE / DOM / network) and deterministic given a seed, like CarPhysics / Track / Pilot, so the whole rule set
// is covered by tests/rally_items.sim.js and the same code serves the player, the AI and remote events.
//
// Items: BLASTER (fast straight bolt), BURST (short-range blast), ROCKET (soft lock-on, limited turn rate and life, can be dodged / outrun / blocked by scenery),
// TURBO (a free boost), SHIELD (absorbs one hit, expires), MINE (dropped behind, visible, arms after a moment, never hurts its owner).
// Fairness rules (data in RALLY.items): a hit disrupts for <= 1.3 s (a speed cap, never a stop) and is followed by a protection window, so attacks cannot be
// chained; a shield pops on the first hit; item rolls favour the back of the pack; a box is ignored by a player who already holds an item.
// Multiplayer is VICTIM-AUTHORITATIVE: a weapon is announced once (fire / mine / burst), every phone simulates the projectile, and only the phone that owns a
// car decides whether THAT car was hit (racers with kind 'net' are never adjudicated here). That means no duplicate damage, no per-frame projectile traffic,
// and an attack really changes the other player's race.
// Racer interface: {key, kind:'me'|'ai'|'net', c (CarPhysics state), item:string|null, cool:number, place:number, r (Track racer)}.
const Items=(()=>{
  const IT=RALLY.items,KINDS=Object.keys(IT.kinds),MAXP=14,TAU=Math.PI*2;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

  function make(T,seed){
    return {T,t:0,rnd:rng(seed||1),proj:[],mines:[],events:[],nid:1,seen:new Set(),
      boxes:(T.itemBoxes||[]).map((b,i)=>({i,x:b.x,y:b.y,z:b.z,air:!!b.air,on:true,respT:0,claimKey:null,claimT:-9}))};
  }
  function reset(I){I.proj.length=0;I.mines.length=0;I.events.length=0;I.seen.clear();I.t=0;I.nid=1;for(const b of I.boxes){b.on=true;b.respT=0;b.claimKey=null;b.claimT=-9}}

  const dirOf=c=>{const cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);return [Math.sin(c.h)*cp,sp,Math.cos(c.h)*cp]};
  const ev=(I,e)=>{I.events.push(e);return e};

  // ---------------- pickups ----------------
  function roll(I,R,n){
    const f=n>1?clamp((R.place-1)/(n-1),0,1):.5,w=IT.weights;let tot=0;const ws=KINDS.map(k=>{const v=w[k][0]+(w[k][1]-w[k][0])*f;tot+=v;return v});
    let x=I.rnd()*tot;for(let i=0;i<KINDS.length;i++){x-=ws[i];if(x<=0)return KINDS[i]}return KINDS[0];
  }
  function pickups(I,racers,n){
    for(const b of I.boxes){
      if(!b.on){b.respT-=1/60;if(b.respT<=0){b.on=true;ev(I,{k:'respawn',i:b.i})}continue}
      for(const R of racers){
        if(R.kind==='net'||R.item||R.r.finished)continue;
        const c=R.c,dx=c.x-b.x,dz=c.z-b.z;if(dx*dx+dz*dz>IT.boxR*IT.boxR||Math.abs(c.y-b.y)>4.5)continue;
        b.on=false;b.respT=IT.respawn;b.claimKey=R.key;b.claimT=I.t;R.item=roll(I,R,n);R.held=0;
        ev(I,{k:'pickup',i:b.i,key:R.key,item:R.item,t:I.t});break;
      }
    }
  }
  // the partner took box i at its race time t. Returns {lost:true} if WE had claimed it within 0.6 s and the tie goes against us (the host's claim wins).
  function remoteClaim(I,i,key,t,racers,hostKey){
    const b=I.boxes[i];if(!b)return null;
    if(!b.on&&b.claimKey&&b.claimKey!==key&&Math.abs(b.claimT-t)<.6){
      if(hostKey===key){const me=racers.find(r=>r.key===b.claimKey);if(me&&me.kind==='me'){me.item=null;b.claimKey=key;return {lost:true}}}
      return {lost:false};
    }
    b.on=false;b.respT=IT.respawn;b.claimKey=key;b.claimT=t;return {lost:false};
  }

  // ---------------- applying a hit (the ONLY place a car is disrupted) ----------------
  function apply(I,R,kind,nx,nz,scale,pid){
    const c=R.c;
    if(c.protT>0)return ev(I,{k:'immune',kind,victim:R.key,x:c.x,y:c.y,z:c.z,pid});
    if(c.shieldT>0){c.shieldT=0;c.protT=.9;return ev(I,{k:'shield',kind,victim:R.key,x:c.x,y:c.y,z:c.z,pid})}
    const h=IT.hit[kind];CarPhysics.disrupt(c,h.t,h.slow,h.kb*(scale==null?1:scale),nx,nz);
    if(kind==='mine'){c.vx*=.6;c.vz*=.6}
    c.protT=h.t+IT.protect;                                          // disrupted time + the protection window: no chaining, no stun-lock
    return ev(I,{k:'hit',kind,victim:R.key,x:c.x,y:c.y,z:c.z,pid});
  }

  // ---------------- using an item ----------------
  function nearestAhead(I,R,racers,range,cone){
    const c=R.c,d=dirOf(c);let best=null,bd=1e9;
    for(const o of racers){if(o===R||o.r.finished)continue;const dx=o.c.x-c.x,dy=o.c.y-c.y,dz=o.c.z-c.z,dist=Math.hypot(dx,dy,dz);if(dist>range||dist<4)continue;
      const dot=(dx*d[0]+dy*d[1]+dz*d[2])/dist;if(Math.acos(clamp(dot,-1,1))>cone)continue;if(dist<bd){bd=dist;best=o}}
    return best;
  }
  function launch(I,R,kind,tgtKey,v0){
    const c=R.c,d=dirOf(c),sp=v0,id=R.key+':'+(I.nid++);
    const p={on:true,kind,id,owner:R.key,x:c.x+d[0]*3.4,y:c.y+.9+d[1]*3.4,z:c.z+d[2]*3.4,vx:d[0]*sp,vy:d[1]*sp,vz:d[2]*sp,life:kind==='rocket'?IT.rocket.life:IT.bolt.life,tgt:tgtKey||null};
    if(I.proj.length>=MAXP){const old=I.proj.find(q=>!q.on)||I.proj.shift();if(old&&old.on)ev(I,{k:'expire',id:old.id,x:old.x,y:old.y,z:old.z})}
    I.proj=I.proj.filter(q=>q.on);I.proj.push(p);I.seen.add(id);
    return ev(I,{k:'fire',kind,id,owner:R.key,x:p.x,y:p.y,z:p.z,vx:p.vx,vy:p.vy,vz:p.vz,tgt:p.tgt});
  }
  function use(I,R,racers){
    if(!R.item||R.cool>0)return null;const c=R.c,k=R.item,v=Math.hypot(c.vx,c.vy,c.vz);let e=null;   // speeds come from the real velocity (c.s is only refreshed inside a physics step)
    if(k==='blaster')e=launch(I,R,'blaster',null,IT.bolt.speed+v*.5);
    else if(k==='rocket'){const t=nearestAhead(I,R,racers,IT.rocket.range,IT.rocket.cone);e=launch(I,R,'rocket',t&&t.key,Math.max(v+IT.rocket.add,IT.rocket.speed))}
    else if(k==='burst')e=burst(I,R,racers);
    else if(k==='mine')e=dropMine(I,R);
    else if(k==='shield'){c.shieldT=IT.shieldT;e=ev(I,{k:'shield-on',key:R.key})}   // a fixed timer (never added to): cannot stack
    else if(k==='turbo'){CarPhysics.pad(c,2.2);e=ev(I,{k:'turbo',key:R.key})}
    R.item=null;R.cool=IT.cool;return e;
  }
  function burst(I,R,racers){
    const c=R.c;
    for(const o of racers){if(o===R||o.kind==='net')continue;const dx=o.c.x-c.x,dz=o.c.z-c.z,dy=o.c.y-c.y,d=Math.hypot(dx,dz);if(d>IT.burst.r||Math.abs(dy)>7)continue;
      apply(I,o,'burst',dx||0.01,dz,1-.5*d/IT.burst.r)}
    return ev(I,{k:'burst',key:R.key,x:c.x,y:c.y,z:c.z});
  }
  // the partner fired a burst: apply it to OUR cars only
  function remoteBurst(I,racers,d){
    for(const o of racers){if(o.kind==='net'||o.key===d.key)continue;const dx=o.c.x-d.x,dz=o.c.z-d.z,dy=o.c.y-d.y,q=Math.hypot(dx,dz);if(q>IT.burst.r||Math.abs(dy)>7)continue;apply(I,o,'burst',dx||.01,dz,1-.5*q/IT.burst.r)}
    return ev(I,{k:'burst',key:d.key,x:d.x,y:d.y,z:d.z,remote:true});
  }
  function dropMine(I,R){
    const c=R.c,s=Math.sin(c.h),co=Math.cos(c.h),x=c.x-s*IT.mine.back,z=c.z-co*IT.mine.back,y=I.T.ground(x,z,c.y+2)+.35,id=R.key+':'+(I.nid++);
    const m={on:true,id,owner:R.key,x,y,z,age:0};
    if(I.mines.length>=IT.maxMines){const o=I.mines.shift();ev(I,{k:'mine-gone',id:o.id,x:o.x,y:o.y,z:o.z})}
    I.mines.push(m);I.seen.add(id);return ev(I,{k:'mine',id,owner:R.key,x,y,z});
  }
  // remote announcements: create the same object here (ignoring duplicates)
  function spawnRemote(I,d){
    if(I.seen.has(d.id))return null;I.seen.add(d.id);
    if(d.k==='fire'){I.proj=I.proj.filter(q=>q.on);if(I.proj.length>=MAXP)I.proj.shift();I.proj.push({on:true,kind:d.kind,id:d.id,owner:d.owner,x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,vz:d.vz,life:d.kind==='rocket'?IT.rocket.life:IT.bolt.life,tgt:d.tgt||null,remote:true});return d}
    if(d.k==='mine'){if(I.mines.length>=IT.maxMines)I.mines.shift();I.mines.push({on:true,id:d.id,owner:d.owner,x:d.x,y:d.y,z:d.z,age:0,remote:true});return d}
    return null;
  }
  // the victim's phone says projectile / mine `id` was used up: remove it here too
  function remove(I,id){
    for(const q of I.proj)if(q.id===id)q.on=false;I.proj=I.proj.filter(q=>q.on);
    const i=I.mines.findIndex(m=>m.id===id);if(i>=0)I.mines.splice(i,1);
  }

  // ---------------- per-step simulation ----------------
  function step(I,dt,racers,n){
    I.t+=dt;pickups(I,racers,n||racers.length);
    for(const R of racers)if(R.cool>0)R.cool=Math.max(0,R.cool-dt);
    const T=I.T,locals=racers.filter(r=>r.kind!=='net');
    // projectiles
    for(const p of I.proj){
      if(!p.on)continue;
      if(p.kind==='rocket'&&p.tgt){   // limited tracking: turn toward the target at most `turn` rad/s, only while it is in range and not far behind
        const t=racers.find(r=>r.key===p.tgt);
        if(t&&!t.r.finished){
          const tx=t.c.x+t.c.vx*.12-p.x,ty=t.c.y+1-p.y,tz=t.c.z+t.c.vz*.12-p.z,dist=Math.hypot(tx,ty,tz),sp=Math.hypot(p.vx,p.vy,p.vz)||1;
          const dot=(tx*p.vx+ty*p.vy+tz*p.vz)/(dist*sp);
          if(dist<IT.rocket.range*1.3&&(dot>0||dist<30)){
            const ang=Math.acos(clamp(dot,-1,1)),k=ang>1e-4?Math.min(1,IT.rocket.turn*dt/ang):0;
            let nx=p.vx/sp+(tx/dist-p.vx/sp)*k,ny=p.vy/sp+(ty/dist-p.vy/sp)*k,nz=p.vz/sp+(tz/dist-p.vz/sp)*k;const l=Math.hypot(nx,ny,nz)||1;
            p.vx=nx/l*sp;p.vy=ny/l*sp;p.vz=nz/l*sp;
          }
        }
      }
      const x0=p.x,y0=p.y,z0=p.z;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.life-=dt;
      let done=false;
      // hits: swept sphere vs every car WE adjudicate (never its owner)
      const hr=(p.kind==='rocket'?IT.rocket.r:IT.bolt.r);
      for(const R of locals){
        if(R.key===p.owner)continue;
        const cx=R.c.x,cy=R.c.y+.9,cz=R.c.z,sx=p.x-x0,sy=p.y-y0,sz=p.z-z0,L2=sx*sx+sy*sy+sz*sz||1e-6;
        let t=((cx-x0)*sx+(cy-y0)*sy+(cz-z0)*sz)/L2;t=clamp(t,0,1);
        if(Math.hypot(x0+sx*t-cx,y0+sy*t-cy,z0+sz*t-cz)<hr){
          const sp=Math.hypot(p.vx,p.vz)||1;apply(I,R,p.kind,p.vx/sp,p.vz/sp,1,p.id);done=true;break;
        }
      }
      // the world: ground, solid scenery (so a rocket can be dodged behind a rock)
      if(!done){const g=T.ground(p.x,p.z,p.y+3);if(p.y<=g+.3||(T.solidHit&&T.solidHit(p.x,p.y,p.z,.4))){ev(I,{k:'impact',id:p.id,kind:p.kind,x:p.x,y:Math.max(p.y,g),z:p.z});done=true}}
      if(!done&&p.life<=0){ev(I,{k:'expire',id:p.id,kind:p.kind,x:p.x,y:p.y,z:p.z});done=true}
      if(done)p.on=false;
    }
    if(I.proj.some(p=>!p.on))I.proj=I.proj.filter(p=>p.on);
    // mines
    for(let i=I.mines.length-1;i>=0;i--){
      const m=I.mines[i];m.age+=dt;
      if(m.age>IT.mine.life){I.mines.splice(i,1);ev(I,{k:'mine-gone',id:m.id,x:m.x,y:m.y,z:m.z});continue}
      if(m.age<IT.mine.arm)continue;
      for(const R of locals){
        if(R.key===m.owner)continue;const dx=R.c.x-m.x,dz=R.c.z-m.z;
        if(dx*dx+dz*dz<IT.mine.r*IT.mine.r&&Math.abs(R.c.y-m.y)<3){apply(I,R,'mine',dx||.01,dz,1,m.id);I.mines.splice(i,1);break}
      }
    }
    const out=I.events;I.events=[];return out;
  }

  // ---------------- AI: when and why a rival uses its item (never "random fire") ----------------
  function aiThink(I,R,racers,dt,ctx){
    if(!R.item||R.cool>0)return null;
    R.held=(R.held||0)+dt;
    if(R.aiWait==null)R.aiWait=.5+I.rnd()*.9;                       // a human-ish reaction delay after picking something up
    if(R.held<R.aiWait)return null;
    const c=R.c,k=R.item,n=racers.length,others=racers.filter(o=>o!==R&&!o.r.finished);
    const sees=(range,cone)=>nearestAhead(I,R,racers,range,cone);
    let go=false;
    if(k==='blaster'){const t=sees(55,.13);go=!!t&&t.c.shieldT<=0&&t.c.protT<=.3&&(c.mode===t.c.mode||Math.abs(t.c.y-c.y)<14)}
    else if(k==='rocket'){const t=sees(IT.rocket.range*.9,.5);go=!!t&&Math.hypot(t.c.x-c.x,t.c.z-c.z)>18&&(R.place>t.place||I.rnd()<.3)&&t.c.protT<=.3}
    else if(k==='burst'){go=others.some(o=>Math.hypot(o.c.x-c.x,o.c.z-c.z)<10&&Math.abs(o.c.y-c.y)<5&&o.c.protT<=.2)}
    else if(k==='mine'){const s=Math.sin(c.h),co=Math.cos(c.h);go=c.grounded&&others.some(o=>{const dx=o.c.x-c.x,dz=o.c.z-c.z,d=Math.hypot(dx,dz);return d<24&&d>6&&(dx*s+dz*co)/d<-.55&&R.place<o.place})}
    else if(k==='shield'){const inc=I.proj.some(p=>p.on&&p.kind==='rocket'&&p.tgt===R.key&&Math.hypot(p.x-c.x,p.z-c.z)<70);go=inc||R.held>6}
    else if(k==='turbo'){go=!(ctx&&ctx.nearJump&&ctx.nearJump(R))&&Math.abs(c.steer)<.25&&(R.place>1||R.held>5)}
    return go?use(I,R,racers):null;
  }

  return {make,reset,step,use,apply,aiThink,remoteClaim,remoteBurst,spawnRemote,remove,roll,KINDS};
})();
