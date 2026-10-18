// WARDEN: deterministic fixed-60Hz combat simulation. No THREE, no DOM, no Math.random, no globals except Moves/SwordHit.
// Driven by commands, emits events. Order of work in step(): (1) consume buffered commands, (2) snapshot positions, (3) root motion in <=0.1 m sub-steps with circle collision,
// (4) hit tests against the SNAPSHOT (so fighter order cannot matter), (5) resolve outcomes + emit events, (6) advance counters. A hit-stop freezes everything (counters, i-frames, deflect window) and buffers commands.
// Facing convention: angle th -> direction (sin th, cos th) in (x,z).
// TEAMS: a fighter may have `team`; same-team fighters never hurt each other (melee, projectiles, area bursts). EFFECTS (C.fx): moves can carry `fx:[{on:'start'|'release',k:'proj'|'aoe',...}]` -
//   proj = a travelling bolt (blockable/deflectable, dodgeable, stopped by solids), aoe = a ground circle that telegraphs for `delay` ticks and then bursts for `dur` ticks (unblockable, dodgeable by i-frames or by leaving it).
//   They resolve through the same outcome list as sword hits, so hit-stop freezes them and every event keeps its shape (hit/block/deflect/dodged/dead).
const CombatCore=(()=>{
  const SPEED=.05,SUBM=.1,GUARD_ARC=1.2,REARM=14,DEFL=7,BUF=6;
  function mkFighter(id,o){o=o||{};return{id,x:o.x||0,z:o.z||0,y:0,r:.45,face:o.face||0,hp:o.hp||100,hpMax:o.hp||100,st:100,stMax:100,po:0,poMax:100,
    team:o.team||null,dm:o.dm||1,rm:o.rm||1,act:'free',pt:0,ph:null,pi:0,pk:0,mv:null,hold:0,done:{},sk:null,stun:0,kx:0,kz:0,kr:0,dir:null,guard:false,gpt:99,rel:99,sr:99,pr:99,c:0,rel2:false,buf:null,q:[],ex:0,ez:0,lc:0,lcT:-999,dEnd:-999}}
  function create(o){o=o||{};const C={tick:0,hs:0,ev:[],fx:[],fxN:0,F:{},solids:(o.solids||[]).slice(),arena:o.arena||{x:0,z:0,R:1e9},order:[]};
    C.add=(id,fo)=>{C.F[id]=mkFighter(id,fo);C.order.push(id);return C.F[id]};
    C.step=cmds=>step(C,cmds||{});C.start=(id,m,hold)=>{const f=C.F[id];if(f&&Moves[m])startMove(C,f,m,hold|0)};return C}
  const emit=(C,t,a,d,x)=>{const e=Object.assign({tk:C.tick,t,a,d},x||{});C.ev.push(e);return e};
  const faceV=f=>[Math.sin(f.face),Math.cos(f.face)];
  function moveBy(C,f,dx,dz){
    const L=Math.hypot(dx,dz);if(L<1e-9)return;const n=Math.ceil(L/SUBM),sx=dx/n,sz=dz/n;
    for(let i=0;i<n;i++){f.x+=sx;f.z+=sz;
      for(let pass=0;pass<2;pass++){   // fighters first, then solids, then the rim: static geometry always wins
        for(const id of C.order){const o=C.F[id];if(o===f||o.act==='dead')continue;const ex=f.x-o.x,ez=f.z-o.z,d=Math.hypot(ex,ez),m=f.r+o.r;if(d<m){if(d<1e-6){f.x+=m;continue}f.x=o.x+ex/d*m;f.z=o.z+ez/d*m}}
        for(const s of C.solids){if(s.nb&&!s.wall)continue;const ex=f.x-s.x,ez=f.z-s.z,d=Math.hypot(ex,ez),m=s.r+f.r;if(d<m){if(d<1e-6){f.x+=m;continue}f.x=s.x+ex/d*m;f.z=s.z+ez/d*m}}
        const A=C.arena,ax=f.x-A.x,az=f.z-A.z,ad=Math.hypot(ax,az),lim=A.R-f.r;if(ad>lim){f.x=A.x+ax/ad*lim;f.z=A.z+az/ad*lim}}}}
  function spend(f,v){f.st=Math.max(0,f.st-v);f.sr=0}
  function addPo(C,f,v){if(f.act==='dead')return;f.po=Math.min(f.poMax,f.po+v);f.pr=0;
    if(f.po>=f.poMax&&!(f.act==='stun'&&f.sk==='stagger')){f.po=0;stunF(f,60,'stagger');emit(C,'posturebreak',null,f.id)}}
  function stunF(f,n,kind){f.act='stun';f.sk=kind;f.stun=n;f.guard=false;f.ph=null;f.mv=null;f.buf=null;f.rel2=false;f.c=0}
  function startMove(C,f,id,hold){const m=Moves[id];f.act='attack';f.mv=m;f.ph=Moves.expand(id,hold);f.hold=hold|0;f.pi=0;f.pk=0;f.pt=0;f.done={};f.guard=false;if(m.stam)spend(f,m.stam);emit(C,'start',f.id,null,{move:id});
    if(m.fx)for(const d of m.fx)if(d.on==='start')spawnFx(C,f,d);skipEmpty(f)}
  const enemyOf=(a,t)=>t!==a&&t.act!=='dead'&&!(a.team&&t.team===a.team);
  function nearestFoe(C,a){let best=null,bd=1e9;for(const id of C.order){const t=C.F[id];if(!enemyOf(a,t))continue;const d=Math.hypot(t.x-a.x,t.z-a.z);if(d<bd){bd=d;best=t}}return best}
  // effects: spawned by startMove (on:'start') or when a `release` phase begins (on:'release'). The projectile/zone keeps the move's damage numbers unless the effect overrides them.
  function spawnFx(C,a,d){const t=nearestFoe(C,a),m=a.mv||{},id=++C.fxN;
    const mv={id:(m.id||'fx'),dmg:d.dmg!==undefined?d.dmg:m.dmg,pdmg:d.pdmg!==undefined?d.pdmg:m.pdmg,hs:d.hs!==undefined?d.hs:m.hs,stun:d.stun!==undefined?d.stun:m.stun,kb:d.kb!==undefined?d.kb:m.kb,reach:0,w:0};
    const fx={id,o:a.id,team:a.team,k:d.k,x:a.x,z:a.z,dx:0,dz:0,spd:0,r:(d.r||.5)*(d.k==='aoe'?a.rm||1:1),life:d.life||60,delay:d.delay||0,dur:d.dur||3,live:false,done:{},mv};
    if(d.k==='proj'){let dx=Math.sin(a.face),dz=Math.cos(a.face);if(d.aim!=='face'&&t){const L=Math.hypot(t.x-a.x,t.z-a.z)||1;dx=(t.x-a.x)/L;dz=(t.z-a.z)/L}fx.dx=dx;fx.dz=dz;fx.x=a.x+dx*(d.off||.8);fx.z=a.z+dz*(d.off||.8);fx.spd=d.spd||.25}
    else{const at=d.at||'self';if(at==='target'&&t){fx.x=t.x;fx.z=t.z}else if(at==='ahead'){fx.x=a.x+Math.sin(a.face)*(d.d||3);fx.z=a.z+Math.cos(a.face)*(d.d||3)}}
    C.fx.push(fx);emit(C,'fx',a.id,null,{fid:id,k:fx.k,x:fx.x,z:fx.z,dx:fx.dx,dz:fx.dz,r:fx.r,delay:fx.delay,dur:fx.dur,spd:fx.spd,life:fx.life,move:mv.id});return fx}
  function skipEmpty(f){while(f.act==='attack'&&f.ph[f.pi]&&f.pk>=f.ph[f.pi].n){f.pi++;f.pk=0}if(f.act==='attack'&&f.pi>=f.ph.length)f.act='free'}
  const recT=f=>{if(!f.ph||f.act!=='attack')return -1;const p=f.ph[f.pi];return p&&p.k==='recovery'?f.pk:-1};
  function canCancel(f,to){const r=recT(f);if(r<0||!f.mv||!f.mv.cancel)return false;const t=f.mv.cancel[to];return t!==undefined&&r>=t}
  function tryCmd(C,f,c){
    if(f.act==='dead')return true;
    const free=f.act==='free'||(f.act==='charge'&&c.t!=='heavyUp');
    switch(c.t){
      case'light':{const from=f.act==='attack'&&f.mv?f.mv.id:null;if(!(f.act==='free'||canCancel(f,'light'))||f.st<=0)return false;
        const id=Combos.light({from:f.act==='free'?null:from,adv:!!c.adv,chain:C.tick-f.lcT<=Combos.CHAIN_GAP?f.lc:0,sinceDodge:C.tick-f.dEnd});startMove(C,f,id);f.lc=Moves[id].chain||0;return true}
      case'atk':if(f.act==='free'){startMove(C,f,c.m,c.hold||0);return true}return false;
      case'dodge':{if((f.act==='free'||f.act==='charge'||canCancel(f,'dodge'))&&f.st>0){const D=Moves.dodge;let dx=c.dx,dz=c.dz;if(!(Math.hypot(dx||0,dz||0)>.01)){dx=-Math.sin(f.face);dz=-Math.cos(f.face)}const L=Math.hypot(dx,dz);f.dir=[dx/L,dz/L];f.act='dodge';f.pt=0;f.guard=false;f.ph=null;f.mv=null;f.c=0;spend(f,D.stam);emit(C,'dodge',f.id,null);return true}return false}
      case'guardDown':if(f.act==='free'||canCancel(f,'guard')){if(f.act==='attack'){f.act='free';f.ph=null;f.mv=null}f.guard=true;f.gpt=f.rel>=REARM?0:99;return true}return false;
      case'guardUp':if(f.guard){f.guard=false;f.rel=0}return true;
      case'heavyDown':{const from=f.act==='attack'&&f.mv?f.mv.id:null;
        if(from&&canCancel(f,'heavy')&&f.st>0){const id=Combos.heavy({from});if(id){startMove(C,f,id);f.lc=Moves[id].chain||0;return true}}
        if(f.act==='free'&&f.st>0&&!c.q){f.act='charge';f.c=0;f.rel2=false;f.guard=false;return true}return false}
      case'heavyUp':if(f.act==='charge'){f.rel2=true}return true}
    return true}
  function step(C,cmds){
    C.tick++;C.ev=[];
    for(const id of C.order){const f=C.F[id],c=cmds[id];if(!c)continue;if(c.face!==undefined&&(f.act==='free'||f.act==='charge'))f.face=c.face;f.ex=c.mx||0;f.ez=c.mz||0;if(c.list)for(const k of c.list)f.q.push(Object.assign({e:C.tick},k))}
    if(C.hs>0){C.hs--;emit(C,'hitstop',null,null,{left:C.hs});return C.ev}
    // (1) commands (with a short input buffer for ones that cannot start yet)
    for(const id of C.order){const f=C.F[id];const q=f.q;f.q=[];for(const c of q){if(!tryCmd(C,f,c)){if((c.t==='light'||c.t==='dodge')&&C.tick-c.e<BUF)f.q.push(c);else if(c.t==='heavyDown'&&f.act==='attack'&&C.tick-c.e<18)f.q.push(Object.assign({},c,{q:1}))}}}
    // heavy: strike once released and min charge reached, or max charge
    for(const id of C.order){const f=C.F[id];if(f.act==='charge'&&((f.rel2&&f.c>=Moves.heavy.chargeMin)||f.c>=Moves.heavy.chargeMax)){{const ch=Math.max(0,Math.min(1,(f.c-Moves.heavy.chargeMin)/(Moves.heavy.chargeMax-Moves.heavy.chargeMin)));startMove(C,f,'heavy');f.chg=ch}}}
    // (2) snapshot
    const snap={};for(const id of C.order){const f=C.F[id];snap[id]={x:f.x,z:f.z,r:f.r,rm:f.rm}}
    // (3) root motion
    for(const id of C.order){const f=C.F[id];if(f.act==='dead')continue;
      if(f.act==='free'||f.act==='charge'){const k=(f.act==='charge'?.4:f.guard?.5:1)*(f.spd||1),L=Math.hypot(f.ex,f.ez),s=L>1?1/L:1;moveBy(C,f,f.ex*s*SPEED*k,f.ez*s*SPEED*k)}
      else if(f.act==='attack'){const p=f.ph[f.pi];if(p&&p.move){const d=p.move/p.n,[fx,fz]=faceV(f);moveBy(C,f,fx*d,fz*d)}}
      else if(f.act==='dodge'){const D=Moves.dodge,i=f.pt-D.rootT0;if(i>=0&&i<Moves.dodgeRoot.length)moveBy(C,f,f.dir[0]*Moves.dodgeRoot[i],f.dir[1]*Moves.dodgeRoot[i])}
      if(f.kr>0){const s=Math.min(f.kr,.12);f.kr-=s;moveBy(C,f,f.kx*s,f.kz*s)}}
    // (3b) effects: `release` phases fire their effects on the first tick; live effects move / burst and add to the same outcome list as the sword
    for(const aid of C.order){const a=C.F[aid];if(a.act!=='attack'||!a.mv||!a.mv.fx)continue;const p=a.ph[a.pi];if(p&&p.k==='release'&&a.pk===0)for(const d of a.mv.fx)if(d.on==='release')spawnFx(C,a,d)}
    const out=[];
    if(C.fx.length)C.fx=C.fx.filter(fx=>{const own=C.F[fx.o]||{id:fx.o,team:fx.team},foes=C.order.map(i=>C.F[i]).filter(t=>t.act!=='dead'&&!(fx.team&&t.team===fx.team)&&t.id!==fx.o);
      const iframe=t=>t.act==='dodge'&&t.pt>=Moves.dodge.iStart&&t.pt<=Moves.dodge.iEnd;
      if(fx.k==='proj'){fx.x+=fx.dx*fx.spd;fx.z+=fx.dz*fx.spd;fx.life--;
        for(const s of C.solids){if(s.nb&&!s.wall)continue;if(Math.hypot(fx.x-s.x,fx.z-s.z)<s.r){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'wall',x:fx.x,z:fx.z});return false}}
        for(const t of foes){if(fx.done[t.id]||Math.hypot(t.x-fx.x,t.z-fx.z)>=fx.r+t.r)continue;fx.done[t.id]=true;
          if(iframe(t)){out.push({k:'dodged',a:own,t,fx:fx.id});continue}
          const br=Math.atan2(-fx.dx,-fx.dz);out.push({k:t.guard&&t.act==='free'&&SwordHit.angd(t.face,br)<=GUARD_ARC?(t.gpt<=DEFL?'deflect':'block'):'hit',a:own,t,mv:fx.mv,br,fx:fx.id});
          emit(C,'fxend',fx.o,t.id,{fid:fx.id,why:'hit',x:fx.x,z:fx.z});return false}
        if(fx.life<=0){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'expire',x:fx.x,z:fx.z});return false}return true}
      if(fx.delay>0){fx.delay--;return true}
      if(!fx.live){fx.live=true;emit(C,'fxburst',fx.o,null,{fid:fx.id,x:fx.x,z:fx.z,r:fx.r})}
      for(const t of foes){if(fx.done[t.id]||Math.hypot(t.x-fx.x,t.z-fx.z)>=fx.r+t.r*.5)continue;fx.done[t.id]=true;
        if(iframe(t)){out.push({k:'dodged',a:own,t,fx:fx.id});continue}
        out.push({k:'hit',a:own,t,mv:fx.mv,br:Math.atan2(fx.x-t.x,fx.z-t.z),fx:fx.id})}
      if(--fx.dur<=0){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'done',x:fx.x,z:fx.z});return false}return true});
    // (4) hit tests on the snapshot
    for(const aid of C.order){const a=C.F[aid];if(a.act!=='attack')continue;const p=a.ph[a.pi];if(!p||p.k!=='active'||a.done[p.seg])continue;
      for(const tid of C.order){if(tid===aid)continue;const t=C.F[tid];if(t.act==='dead'||(a.team&&t.team===a.team))continue;
        const hit=SwordHit.tickHits(snap[aid],a.face,a.mv,p,a.pk,p.n,snap[tid],C.solids,a.y,t.y);if(!hit)continue;
        if(t.act==='dodge'&&t.pt>=Moves.dodge.iStart&&t.pt<=Moves.dodge.iEnd){out.push({k:'dodged',a,t,seg:p.seg});continue}
        const br=Math.atan2(snap[aid].x-snap[tid].x,snap[aid].z-snap[tid].z);
        if(t.guard&&t.act==='free'&&SwordHit.angd(t.face,br)<=GUARD_ARC)out.push({k:t.gpt<=DEFL?'deflect':'block',a,t,seg:p.seg,mv:a.mv,br});
        else out.push({k:'hit',a,t,seg:p.seg,mv:a.mv,br})}}
    // (5) resolve (all outcomes were decided from the pre-resolution state, so simultaneous hits both land)
    let hs=0;const stag0={};for(const id of C.order)stag0[id]=C.F[id].act==='stun'&&C.F[id].sk==='stagger';
    for(const o of out){const{a,t,mv}=o;
      if(o.k==='dodged'){emit(C,'dodged',a.id,t.id,{seg:o.seg});continue}
      if(!o.fx)a.done[o.seg]=true;const sc=!o.fx&&a.mv&&a.mv.id==='heavy'?1+.5*(a.chg||0):1;
      if(o.k==='deflect'){if(!o.fx){addPo(C,a,mv.pdmg*1.6);if(a.act==='attack')stunF(a,16,'recoil')}addPo(C,t,mv.pdmg*.15);emit(C,'deflect',a.id,t.id,{seg:o.seg});hs=Math.max(hs,5)}
      else if(o.k==='block'){t.st=mv.gb?0:Math.max(0,t.st-mv.dmg*.8*sc);t.sr=0;addPo(C,t,mv.pdmg*.7*sc);emit(C,'block',a.id,t.id,{seg:o.seg});hs=Math.max(hs,3);
        if(t.st<=0&&t.act==='free'){stunF(t,45,'stagger');emit(C,'guardbreak',a.id,t.id)}}
      else{const crit=stag0[t.id]?2.5:1,dm=mv.dmg*sc*crit*(a.dm||1);t.hp=Math.max(0,t.hp-dm);t.pr=0;emit(C,'hit',a.id,t.id,{move:mv.id,seg:o.seg,dmg:dm,crit:crit>1,fx:o.fx});hs=Math.max(hs,mv.hs);
        if(t.hp<=0){t.act='dead';t.guard=false;t.ph=null;t.mv=null;emit(C,'dead',a.id,t.id)}
        else{const wasStag=t.act==='stun'&&t.sk==='stagger';if(!wasStag)stunF(t,mv.stun,'hit');addPo(C,t,mv.pdmg*sc);
          const bx=Math.sin(o.br+Math.PI),bz=Math.cos(o.br+Math.PI);t.kx=-bx;t.kz=-bz;t.kr=mv.kb*sc}}}
    if(hs>0)C.hs=hs;
    // (6) advance counters (not reached during hit-stop)
    for(const id of C.order){const f=C.F[id];if(f.act==='dead')continue;
      if(f.guard)f.gpt=Math.min(99,f.gpt+1);else f.rel=Math.min(99,f.rel+1);
      f.sr=Math.min(999,f.sr+1);f.pr=Math.min(999,f.pr+1);
      if(f.sr>=30&&f.st<f.stMax)f.st=Math.min(f.stMax,f.st+(f.guard?.15:.4));
      if(f.pr>=90&&f.po>0)f.po=Math.max(0,f.po-.35);
      if(f.act==='attack'){f.lcT=C.tick;f.pt++;f.pk++;skipEmpty(f);if(f.act==='free'){f.ph=null;f.mv=null}}
      else if(f.act==='dodge'){f.pt++;if(f.pt>=Moves.dodge.total){f.act='free';f.pt=0;f.dEnd=C.tick}}
      else if(f.act==='charge')f.c++;
      else if(f.act==='stun'){f.stun--;if(f.stun<=0){f.act='free';f.sk=null}}}
    return C.ev}
  // Fixed-step host: inputs carry their event timestamp (ms since the stepper's origin) and are mapped onto ticks, so 15 fps and 144 Hz see the same windows.
  // advance(nowMs) runs every tick up to floor(nowMs/16.667); at most MAXT ticks per call: a longer frame slows the sim (the dropped ticks shift the clock) instead of skipping simulation.
  function stepper(C,maxT){maxT=maxT||6;const S={pend:[],clamped:0,skew:0,tickMs:1000/60};
    S.input=(id,cmd,tms)=>{S.pend.push({id,cmd,tick:Math.floor(tms/S.tickMs+1e-9)-S.skew+1})};
    S.advance=(nowMs,getHeld,post)=>{let n=Math.floor(nowMs/S.tickMs+1e-9)-S.skew-C.tick;if(n>maxT){S.skew+=n-maxT;for(const p of S.pend)p.tick-=n-maxT;n=maxT;S.clamped++}const evs=[];
      for(let i=0;i<n;i++){const nt=C.tick+1,cm={},held=getHeld?getHeld(nt):{};for(const id in held)cm[id]=Object.assign({list:[]},held[id]);
        for(const p of S.pend)if(p.tick<=nt){(cm[p.id]=cm[p.id]||{list:[]}).list.push(p.cmd)}S.pend=S.pend.filter(p=>p.tick>nt);
        for(const e of C.step(cm))evs.push(e);if(post)post(nt)}return evs};return S}
  return{create,stepper,mkFighter,moveBy,CONST:{SPEED,SUBM,GUARD_ARC,REARM,DEFL,BUF}}})();
