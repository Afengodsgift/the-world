// WARDEN: deterministic fixed-60Hz combat simulation. No THREE, no DOM, no Math.random, no globals except Moves/SwordHit.
// Driven by commands, emits events. Order of work in step(): (1) consume buffered commands, (2) snapshot positions, (3) root motion in <=0.1 m sub-steps with circle collision,
// (4) hit tests against the SNAPSHOT (so fighter order cannot matter), (5) resolve outcomes + emit events, (6) advance counters. A hit-stop freezes everything (counters, i-frames, deflect window) and buffers commands.
// Facing convention: angle th -> direction (sin th, cos th) in (x,z).
// TEAMS: a fighter may have `team`; same-team fighters never hurt each other (melee, projectiles, area bursts). EFFECTS (C.fx): moves can carry `fx:[{on:'start'|'release',k:'proj'|'aoe',...}]` -
//   proj = a travelling bolt (blockable/deflectable, dodgeable, stopped by solids), aoe = a ground circle that telegraphs for `delay` ticks and then bursts for `dur` ticks (unblockable, dodgeable by i-frames or by leaving it).
//   They resolve through the same outcome list as sword hits, so hit-stop freezes them and every event keeps its shape (hit/block/deflect/dodged/dead).
const CombatCore=(()=>{
  const PICK_R=1.0,RETURN_T=1500,DIS_CD=2400,KICK_REACH=2.1,KICK_DIST=6;   // DISARM (see Brawl.js): pick-up radius, ticks before a lost weapon slides back, the victim's no-disarm window, how far a kick reaches / punts a weapon on the floor
  const SPEED=.05,SUBM=.1,GUARD_ARC=1.2,REARM=7,DEFL=7,BUF=6,PARRY_T=26,PARRY_W=13,PERFECT=4;
  const PHI=42,RISE=336;   // RISE: a boss that 'rises' is felled at its phase line, lies down ~5.6 s (untouchable), then gets up in its second phase
     // ticks of invulnerability while a boss changes phase (0.7 s)
  function mkFighter(id,o){o=o||{};return{id,x:o.x||0,z:o.z||0,y:0,r:.45,face:o.face||0,hp:o.hp||100,hpMax:o.hp||100,st:100,stMax:100,po:0,poMax:100,
    team:o.team||null,arm:1,wd:o.wd||0,dcd:o.dcd===undefined?900:o.dcd,fs:o.fs||0,tw:o.tw||0,swb:-1,sa:o.sa||0,pg:o.pg||0,rise:o.rise||0,tm:o.tm||1,pgd:false,inv:0,sm:1,pm:1,dfl:0,bk:0,dm:o.dm||1,rm:o.rm||1,act:'free',pt:0,ph:null,pi:0,pk:0,mv:null,hold:0,done:{},sk:null,stun:0,kx:0,kz:0,kr:0,dir:null,guard:false,pry:0,pfs:0,pfT:0,gpt:99,rel:99,sr:99,pr:99,c:0,rel2:false,buf:null,q:[],ex:0,ez:0,lc:0,lcT:-999,dEnd:-999}}
  function create(o){o=o||{};const C={tick:0,hs:0,ev:[],fx:[],fxN:0,wp:{},F:{},solids:(o.solids||[]).slice(),arena:o.arena||{x:0,z:0,R:1e9},order:[]};
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
  function spend(f,v){f.st=Math.max(0,f.st-v*(f.sm||1));f.sr=0}
  function addPo(C,f,v){if(f.act==='dead')return;f.po=Math.min(f.poMax,f.po+v);f.pr=0;
    if(f.po>=f.poMax&&!(f.act==='stun'&&(f.sk==='stagger'||f.sk==='rise'))){f.po=0;stunF(f,60,'stagger');emit(C,'posturebreak',null,f.id)}}
  function stunF(f,n,kind){f.act='stun';f.sk=kind;f.stun=n;f.guard=false;f.ph=null;f.mv=null;f.buf=null;f.rel2=false;f.c=0}
  // FISTS: a grab (Moves[].gr) turns to its victim and keeps a staggered one down until it lands
  function grabFace(C,f,id){const t=fistTarget(C,f,id==='take',id==='bwwrench'?Moves.bwwrench.reach:0);if(!t)return;f.face=Math.atan2(t.x-f.x,t.z-f.z);if(id==='take'&&t.act==='stun')t.stun=Math.max(t.stun,Moves.take.phases[0].n+Moves.take.phases[1].n+6)}
  function fistTarget(C,f,staggered,rr){const R=rr||(staggered?3.0:2.2);let best=null,bd=1e9;
    for(const id of C.order){const t=C.F[id];if(!enemyOf(f,t))continue;if(staggered&&!(t.act==='stun'&&t.sk==='stagger'))continue;
      const d=Math.hypot(t.x-f.x,t.z-f.z);if(d>R+t.r||d>=bd)continue;if(SwordHit.angd(f.face,Math.atan2(t.x-f.x,t.z-f.z))>1.15)continue;bd=d;best=t}return best}
  function startMove(C,f,id,hold){const m=Moves[id];if(m&&m.gr)grabFace(C,f,id);f.act='attack';f.mv=m;f.ph=Moves.expand(id,hold,f.tm);f.hold=hold|0;f.pi=0;f.pk=0;f.pt=0;f.done={};f.guard=false;if(m.zn){f.zc=(f.zc||0)+1;f.zn=m.zn.charAt((f.zc+f.id.charCodeAt(0))%m.zn.length)}else f.zn=null;if(m.inv)f.inv=Math.max(f.inv||0,m.inv);if(m.stam)spend(f,m.stam);emit(C,'start',f.id,null,{move:id,per:m.per?1:0});
    if(m.fx)for(const d of m.fx)if(d.on==='start')spawnFx(C,f,d);skipEmpty(f)}
  const enemyOf=(a,t)=>t!==a&&t.act!=='dead'&&!(a.team&&t.team===a.team);
  function nearestFoe(C,a){let best=null,bd=1e9;for(const id of C.order){const t=C.F[id];if(!enemyOf(a,t))continue;const d=Math.hypot(t.x-a.x,t.z-a.z);if(d<bd){bd=d;best=t}}return best}
  // effects: spawned by startMove (on:'start') or when a `release` phase begins (on:'release'). The projectile/zone keeps the move's damage numbers unless the effect overrides them.
  function spawnFx(C,a,d){const t=nearestFoe(C,a),m=a.mv||{},id=++C.fxN;
    const mv={id:(m.id||'fx'),dmg:d.dmg!==undefined?d.dmg:m.dmg,pdmg:d.pdmg!==undefined?d.pdmg:m.pdmg,hs:d.hs!==undefined?d.hs:m.hs,stun:d.stun!==undefined?d.stun:m.stun,kb:d.kb!==undefined?d.kb:m.kb,reach:0,w:0};
    const fx={id,o:a.id,team:a.team,k:d.k,x:a.x,z:a.z,dx:0,dz:0,spd:0,r:(d.r||.5)*(d.k==='aoe'?a.rm||1:1),life:d.life||60,delay:d.delay||0,dur:d.dur||3,live:false,done:{},mv};
    if(d.k==='proj'){let dx=Math.sin(a.face),dz=Math.cos(a.face);if(d.aim!=='face'&&t){const L=Math.hypot(t.x-a.x,t.z-a.z)||1;dx=(t.x-a.x)/L;dz=(t.z-a.z)/L}fx.dx=dx;fx.dz=dz;fx.x=a.x+dx*(d.off||.8);fx.z=a.z+dz*(d.off||.8);fx.spd=d.spd||.25}
    else{const at=d.at||'self';if(at==='target'&&t){fx.x=t.x;fx.z=t.z}else if(at==='ahead'){fx.x=a.x+Math.sin(a.face)*(d.d||3);fx.z=a.z+Math.cos(a.face)*(d.d||3)}fx.x+=d.ox||0;fx.z+=d.oz||0}
    C.fx.push(fx);emit(C,'fx',a.id,null,{fid:id,k:fx.k,x:fx.x,z:fx.z,dx:fx.dx,dz:fx.dz,r:fx.r,delay:fx.delay,dur:fx.dur,spd:fx.spd,life:fx.life,move:mv.id,sty:d.sty});return fx}
  // DISARM: the weapon leaves the victim's hand and lands on the floor (C.wp[owner]); his own Light / Heavy become bare-handed until he takes it back. Mirrored on the owner as wx / wz so the AI can read it.
  function disarm(C,t,a,mv){const p=typeof Brawl!=='undefined'?Brawl.dropPoint(t,a,C.tick,C.arena):{x:t.x+1.5,z:t.z};
    C.wp[t.id]={x:p.x,z:p.z,t:C.tick,by:a.id};t.arm=0;t.tw=0;t.lc=0;t.dcd=DIS_CD;t.wx=p.x;t.wz=p.z;if(t.act==='charge'){t.act='free';t.c=0;t.rel2=false}
    emit(C,'disarm',a.id,t.id,{x:p.x,z:p.z,fx:t.x,fz:t.z,move:mv.id})}
  function wpRelease(C,id,why){const f=C.F[id],w=C.wp[id];if(!w)return;delete C.wp[id];if(f){f.arm=1;f.dcd=DIS_CD;f.wx=f.wz=undefined}emit(C,'regrab',id,null,{x:w.x,z:w.z,ret:why==='ret'?1:0})}
  function skipEmpty(f){while(f.act==='attack'&&f.ph[f.pi]&&f.pk>=f.ph[f.pi].n){f.pi++;f.pk=0}if(f.act==='attack'&&f.pi>=f.ph.length)f.act='free'}
  const recT=f=>{if(!f.ph||f.act!=='attack')return -1;const p=f.ph[f.pi];return p&&p.k==='recovery'?f.pk:-1};
  const DG=t=>t.side===2?Moves.flashstep:t.side?Moves.sidestep:Moves.dodge,iframe=t=>t.act==='dodge'&&t.pt>=DG(t).iStart&&t.pt<=DG(t).iEnd;
  function canCancel(f,to){const r=recT(f);if(r<0||!f.mv||!f.mv.cancel)return false;const t=f.mv.cancel[to];return t!==undefined&&r>=t}
  // SNAPPY DEFENCE: a parry / guard tap may cut your own swing 5 ticks into its recovery (was: only where a move listed a guard cancel), so a late whiff never costs a hit you saw coming
  const defCan=f=>f.act==='attack'&&(canCancel(f,'guard')||recT(f)>=5);
  function tryCmd(C,f,c){
    if(f.act==='dead')return true;
    const free=f.act==='free'||(f.act==='charge'&&c.t!=='heavyUp');
    switch(c.t){
      case'light':{const from=f.act==='attack'&&f.mv?f.mv.id:null;if(!(f.act==='free'||canCancel(f,'light'))||f.st<=0)return false;
        const CB=f.arm===0&&typeof Brawl!=='undefined'?Brawl.Combos:f.tw&&typeof Twin!=='undefined'?Twin.Combos:Combos;const id=CB.light({air:(f.y||0)>.7,guard:f.guard,from:f.act==='free'?null:from,adv:!!c.adv,far:!!c.far,chain:C.tick-f.lcT<=CB.CHAIN_GAP?f.lc:0,sinceDodge:C.tick-f.dEnd});startMove(C,f,id);f.lc=Moves[id].chain||0;return true}
      case'atk':if(f.act==='free'){if(f.arm===0&&!(Moves[c.m]&&(Moves[c.m].bw||Moves[c.m].bwf)))return true;startMove(C,f,c.m,c.hold||0);return true}return false;   // a disarmed fighter ignores the sword-only commands
      case'wrench':if((f.act==='free'||canCancel(f,'wrench'))&&f.st>0&&Moves.bwwrench){startMove(C,f,'bwwrench');f.lc=0;f.guard=false;f.pry=0;return true}return false;
      case'dodge':{if((f.act==='free'||f.act==='charge'||canCancel(f,'dodge'))&&f.st>0){const D=c.side===2?Moves.flashstep:c.side?Moves.sidestep:Moves.dodge;f.side=c.side===2?2:c.side?1:0;let dx=c.dx,dz=c.dz;if(!(Math.hypot(dx||0,dz||0)>.01)){dx=-Math.sin(f.face);dz=-Math.cos(f.face)}const L=Math.hypot(dx,dz);f.dir=[dx/L,dz/L];f.act='dodge';f.pt=0;f.guard=false;f.ph=null;f.mv=null;f.c=0;spend(f,D.stam*(f.tw&&typeof Twin!=='undefined'?Twin.DODGE_STAM:1));emit(C,'dodge',f.id,null);return true}return false}
      case'guardDown':if(f.act==='free'||defCan(f)){if(f.act==='attack'){f.act='free';f.ph=null;f.mv=null}f.guard=true;f.gpt=f.rel>=REARM?0:99;return true}return false;
      case'guardUp':if(f.guard&&!(f.pry>0)){f.guard=false;f.rel=0}return true;
      case'parry':if((f.act==='free'||defCan(f))&&f.rel>=REARM&&!(f.pry>0)){if(f.act==='attack'){f.act='free';f.ph=null;f.mv=null}f.guard=true;f.gpt=0;f.pry=PARRY_T;emit(C,'parry',f.id,null);return true}return false;   // a tap: a sweep of the blade; the first PARRY_W ticks DEFLECT, the rest block
      case'heavyDown':{const from=f.act==='attack'&&f.mv?f.mv.id:null;
        if(f.arm===0&&typeof Brawl!=='undefined'){if(from&&canCancel(f,'heavy')&&f.st>0){const id=Brawl.heavy({from});if(id){startMove(C,f,id);f.lc=0;return true}}}
        else if(f.tw&&typeof Twin!=='undefined'){if(from&&canCancel(f,'heavy')&&f.st>0){const id=Twin.heavy({from});if(id){startMove(C,f,id);f.lc=0;return true}}}
        else if(from&&canCancel(f,'heavy')&&f.st>0){const id=Combos.heavy({from});if(id){startMove(C,f,id);f.lc=Moves[id].chain||0;return true}}
        if(!f.fs&&f.act==='free'&&f.st>0&&!f.guard&&C.tick-f.dEnd<=Combos.EVADE_GAP&&!c.q&&f.dEnd>-900){startMove(C,f,f.tw?'twpierce':'lunge');f.lc=0;return true}
        if(f.act==='free'&&f.st>0&&!c.q){f.act='charge';f.c=0;f.rel2=false;f.guard=false;return true}return false}
      case'heavyUp':if(f.act==='charge'){f.rel2=true}return true;
      case'stance':{if(f.arm===0)return true;const w=c.tw?1:0;if(f.tw===w)return true;f.tw=w;f.lc=0;f.swb=C.tick+(typeof Twin!=='undefined'?Twin.SWAP_TICKS:90);emit(C,'stance',f.id,null,{tw:w});return true}}   // a weapon swap costs no action: it works mid-dodge, mid-recovery, mid-anything but death
    return true}
  function step(C,cmds){
    C.tick++;C.ev=[];
    for(const id of C.order){const f=C.F[id],c=cmds[id];if(!c)continue;if(c.face!==undefined&&(f.act==='free'||f.act==='charge'))f.face=c.face;f.ex=c.mx||0;f.ez=c.mz||0;if(c.list)for(const k of c.list)f.q.push(Object.assign({e:C.tick},k))}
    if(C.hs>0){C.hs--;emit(C,'hitstop',null,null,{left:C.hs});return C.ev}
    // (1) commands (with a short input buffer for ones that cannot start yet)
    for(const id of C.order){const f=C.F[id];const q=f.q;f.q=[];for(const c of q){if(!tryCmd(C,f,c)){if((c.t==='light'||c.t==='dodge'||c.t==='parry')&&C.tick-c.e<BUF)f.q.push(c);else if(c.t==='heavyDown'&&f.act==='attack'&&C.tick-c.e<18)f.q.push(Object.assign({},c,{q:1}))}}}
    // heavy: strike once released and min charge reached, or max charge
    for(const id of C.order){const f=C.F[id];if(f.act==='charge'&&((f.rel2&&f.c>=Moves.heavy.chargeMin)||f.c>=Moves.heavy.chargeMax)){{const ch=Math.max(0,Math.min(1,(f.c-Moves.heavy.chargeMin)/(Moves.heavy.chargeMax-Moves.heavy.chargeMin)));startMove(C,f,f.arm===0&&typeof Brawl!=='undefined'?'bwpower':f.tw&&typeof Twin!=='undefined'?'twpierce':f.fs&&typeof Fists!=='undefined'?'power':'heavy');f.chg=ch}}}
    // (2) snapshot
    const snap={};for(const id of C.order){const f=C.F[id];snap[id]={x:f.x,z:f.z,r:f.r,rm:f.rm}}
    // (3) root motion
    for(const id of C.order){const f=C.F[id];if(f.act==='dead')continue;if(f.inv>0)f.inv--;
      if(f.limp>0)f.limp--;if(f.act==='stun'&&f.lm==='throw'&&f.sk!=='stagger'&&f.stun>0){if(!f.r0){f.r0=f.r;f.r=Math.max(f.r,.95)}}else if(f.r0){f.r=f.r0;f.r0=0}   // a thrown body lies on the floor: it takes real space until it gets up
      if(f.act==='free'||f.act==='charge'){const k=(f.act==='charge'?.4:f.guard?.5:1)*(f.limp>0?.72:1)*(f.spd||1),L=Math.hypot(f.ex,f.ez),s=L>1?1/L:1;moveBy(C,f,f.ex*s*SPEED*k,f.ez*s*SPEED*k)}
      else if(f.act==='attack'){const p=f.ph[f.pi];if(p&&p.move){const d=p.move/p.n,[fx,fz]=faceV(f);moveBy(C,f,fx*d,fz*d)}}
      else if(f.act==='dodge'){const D=DG(f),R=f.side===2?Moves.flashRoot:f.side?Moves.sideRoot:Moves.dodgeRoot,i=f.pt-D.rootT0;if(i>=0&&i<R.length)moveBy(C,f,f.dir[0]*R[i],f.dir[1]*R[i])}
      if(f.kr>0){const s=Math.min(f.kr,.12);f.kr-=s;moveBy(C,f,f.kx*s,f.kz*s)}}
    // (3b) effects: `release` phases fire their effects on the first tick; live effects move / burst and add to the same outcome list as the sword
    for(const aid of C.order){const a=C.F[aid];if(a.act!=='attack'||!a.mv||!a.mv.fx)continue;const p=a.ph[a.pi];if(p&&a.pk===0&&/^release\d?$/.test(p.k))for(const d of a.mv.fx)if(d.on===p.k)spawnFx(C,a,d)}
    // (3c) KICKS PUNT WEAPONS: the first tick of a kick's active window sends any weapon lying just in front of the kicker ~6 m the way he faces (both fighters can keep each other from theirs)
    for(const aid of C.order){const a=C.F[aid];if(a.act!=='attack'||!a.mv||!a.mv.wk)continue;const p=a.ph[a.pi];if(!p||p.k!=='active'||a.pk!==0)continue;
      for(const oid in C.wp){const w=C.wp[oid],px=a.x+Math.sin(a.face)*1.2,pz=a.z+Math.cos(a.face)*1.2;if(Math.hypot(w.x-px,w.z-pz)>KICK_REACH)continue;
        const q=typeof Brawl!=='undefined'?Brawl.punt(w,a,C.arena):{x:w.x+Math.sin(a.face)*KICK_DIST,z:w.z+Math.cos(a.face)*KICK_DIST};emit(C,'wkick',a.id,oid,{x0:w.x,z0:w.z,x:q.x,z:q.z});w.x=q.x;w.z=q.z;const o=C.F[oid];if(o){o.wx=q.x;o.wz=q.z}}}
    const out=[];
    if(C.fx.length)C.fx=C.fx.filter(fx=>{const own=C.F[fx.o]||{id:fx.o,team:fx.team},foes=C.order.map(i=>C.F[i]).filter(t=>t.act!=='dead'&&!(fx.team&&t.team===fx.team)&&t.id!==fx.o);

      if(fx.k==='proj'){fx.x+=fx.dx*fx.spd;fx.z+=fx.dz*fx.spd;fx.life--;
        for(const s of C.solids){if(s.nb&&!s.wall)continue;if(Math.hypot(fx.x-s.x,fx.z-s.z)<s.r){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'wall',x:fx.x,z:fx.z});return false}}
        for(const t of foes){if(fx.done[t.id]||Math.hypot(t.x-fx.x,t.z-fx.z)>=fx.r+t.r)continue;fx.done[t.id]=true;
          if(iframe(t)){out.push({k:'dodged',a:own,t,fx:fx.id});continue}
          const br=Math.atan2(-fx.dx,-fx.dz);out.push({k:t.guard&&t.act==='free'&&SwordHit.angd(t.face,br)<=GUARD_ARC?(t.gpt<=(t.pry>0?PARRY_W:DEFL)+(t.dfl||0)?'deflect':'block'):'hit',a:own,t,mv:fx.mv,br,fx:fx.id});
          emit(C,'fxend',fx.o,t.id,{fid:fx.id,why:'hit',x:fx.x,z:fx.z});return false}
        if(fx.life<=0){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'expire',x:fx.x,z:fx.z});return false}return true}
      if(fx.delay>0){fx.delay--;return true}
      if(!fx.live){fx.live=true;emit(C,'fxburst',fx.o,null,{fid:fx.id,x:fx.x,z:fx.z,r:fx.r})}
      for(const t of foes){if(fx.done[t.id]||Math.hypot(t.x-fx.x,t.z-fx.z)>=fx.r+t.r*.5)continue;fx.done[t.id]=true;
        if(iframe(t)){out.push({k:'dodged',a:own,t,fx:fx.id});continue}
        out.push({k:'hit',a:own,t,mv:fx.mv,br:Math.atan2(fx.x-t.x,fx.z-t.z),fx:fx.id})}
      if(--fx.dur<=0){emit(C,'fxend',fx.o,null,{fid:fx.id,why:'done',x:fx.x,z:fx.z});return false}return true});
    // (4) hit tests on the snapshot
    for(const aid of C.order){const a=C.F[aid];if(a.act!=='attack')continue;const p=a.ph[a.pi];if(!p||p.k!=='active'||a.done[p.seg])continue;if(a.mv.sdm&&a.mv.sdm[p.seg]===0){a.done[p.seg]=true;continue}   // sdm[seg]===0: a feint, the swing is drawn but strikes nothing
      
      for(const tid of C.order){if(tid===aid)continue;const t=C.F[tid];if(t.act==='dead'||(a.team&&t.team===a.team))continue;
        const hit=SwordHit.tickHits(snap[aid],a.face,a.mv,p,a.pk,p.n,snap[tid],C.solids,a.y,t.y);if(!hit)continue;
        if(iframe(t)){out.push({k:'dodged',a,t,seg:p.seg,mv:a.mv});continue}
        const br=Math.atan2(snap[aid].x-snap[tid].x,snap[aid].z-snap[tid].z);
        if(t.guard&&t.act==='free'&&SwordHit.angd(t.face,br)<=GUARD_ARC&&!a.mv.gr)out.push({k:t.gpt<=(t.pry>0?PARRY_W:DEFL)+(t.dfl||0)?'deflect':'block',a,t,seg:p.seg,mv:a.mv,br});
        else out.push({k:'hit',a,t,seg:p.seg,mv:a.mv,br})}}
    // (5) resolve (all outcomes were decided from the pre-resolution state, so simultaneous hits both land)
    let hs=0;const stag0={};for(const id of C.order)stag0[id]=C.F[id].act==='stun'&&C.F[id].sk==='stagger';
    for(const o of out){const{a,t,mv}=o;
      if(o.k==='dodged'){emit(C,'dodged',a.id,t.id,{seg:o.seg});if(!o.fx&&mv&&mv.per&&a.act==='attack'&&!a.sa){stunF(a,46,'recoil');emit(C,'perdodge',a.id,t.id)}continue}
      if(!o.fx)a.done[o.seg]=true;const sc=!o.fx&&a.mv&&(a.mv.id==='heavy'||a.mv.id==='power'||a.mv.id==='twpierce'||a.mv.id==='bwpower')?1+.5*(a.chg||0):1;
      if(o.k==='deflect'){if(!o.fx){addPo(C,a,mv.pdmg*1.6);if(mv.bg&&a.act==='attack'){stunF(a,84,'stagger');emit(C,'brokenguard',a.id,t.id)}else if(a.act==='attack')stunF(a,16,'recoil')}addPo(C,t,mv.pdmg*.15);
        // PERFECT PARRY (the first PERFECT ticks of the window): a longer recoil for the attacker; three in a row inside 5 s breaks the boss open (Phantom Blade style sequence)
        const pf=!o.fx&&t.pry>0&&t.gpt<=PERFECT+(t.dfl||0);let sq=0;
        if(pf){t.pfs=(t.pfT>0?t.pfs:0)+1;t.pfT=300;if(a.act==='attack'&&!a.sa&&!mv.bg)stunF(a,30,'recoil');if(t.pfs>=3){t.pfs=0;sq=1;if(!a.sa&&a.act!=='dead')stunF(a,96,'stagger')}}
        emit(C,'deflect',a.id,t.id,{seg:o.seg,pf:pf?1:0,sq});hs=Math.max(hs,pf?8:5)}
      else if(o.k==='block'){t.st=mv.gb?0:Math.max(0,t.st-mv.dmg*.8*sc);t.sr=0;addPo(C,t,mv.pdmg*.7*sc);emit(C,'block',a.id,t.id,{seg:o.seg});hs=Math.max(hs,3);
        if(t.st<=0&&t.act==='free'){stunF(t,45,'stagger');emit(C,'guardbreak',a.id,t.id)}}
      else if(t.inv>0){emit(C,'immune',a.id,t.id,{seg:o.seg})}   // the phase roar: nothing lands (a few ticks, see below)
      else{const zn=!o.fx&&mv.zn?a.zn:null,zd=zn==='h'?1.2:zn==='l'?.8:1,zp=zn==='m'?1.2:zn==='l'?.7:1;   // HIT ZONES (hand moves): head hits hurt and stun more, body hits break posture, leg hits hurt less but cripple the foe's footwork
        const cd=mv.dis&&!o.fx&&t.wd&&t.arm!==0&&t.dcd<=0,crit=stag0[t.id]?2.5:1,back=a.bk&&SwordHit.angd(t.face,Math.atan2(a.x-t.x,a.z-t.z))>2.2?1+a.bk:1,dm=mv.dmg*zd*sc*(!o.fx&&mv.sdm&&mv.sdm[o.seg]||1)*crit*back*(mv.gr&&mv.dis&&!cd?3:1)*(a.dm||1)*(a.mm&&a.mm[mv.id]||1)*(a.swb>C.tick&&typeof Twin!=='undefined'?Twin.SWAP_BONUS:1);   // a.mm: per-move damage multipliers (the Iron Fist fighting styles)   // a.bk: the Shadow Edge style hits a foe that is facing away harder
        // PHASE GATE (bosses with .pg): damage that would carry the foe across its phase line, or kill it before the phase has happened, stops one point past the line and starts the roar. One-shots, huge crits and two co-op hits in the same tick can no longer skip a phase.
        const gate=t.pg>0?Math.ceil(t.hpMax*t.pg)-1:-1;let nh=t.hp-dm;
        if(gate>=0&&!t.pgd){if(t.hp<=gate)t.pgd=true;else if(nh<=gate){nh=gate;t.pgd=true;if(t.rise){t.inv=RISE+10;stunF(t,RISE,'rise');t.hold=0}else t.inv=PHI;emit(C,'phase',a.id,t.id,{rise:t.rise?1:0})}}
        t.hp=Math.max(0,nh);t.pr=0;emit(C,'hit',a.id,t.id,{move:mv.id,seg:o.seg,dmg:dm,crit:crit>1,fx:o.fx,zone:zn});hs=Math.max(hs,mv.hs);if(cd&&t.hp>0)disarm(C,t,a,mv);
        if(t.hp<=0){t.act='dead';t.guard=false;t.ph=null;t.mv=null;emit(C,'dead',a.id,t.id)}
        else{t.lm=mv.id;const wasStag=t.act==='stun'&&t.sk==='stagger';if(!wasStag&&!t.sa&&!(t.act==='stun'&&t.sk==='rise'))stunF(t,Math.round(mv.stun*(zn==='h'?1.25:1)),'hit');t.hz=zn;if(zn==='l'&&!t.sa)t.limp=100;addPo(C,t,mv.pdmg*zp*sc*(t.sa?.8:1)*(a.pm||1));
          if(!t.sa){const bx=Math.sin(o.br+Math.PI),bz=Math.cos(o.br+Math.PI);t.kx=-bx;t.kz=-bz;t.kr=mv.kb*sc}
          // THROWN INTO THE SCENERY (hand moves only): a body that is thrown / shoved / dropped smashes into whoever stands behind it, and into the ring's rope
          if(a.fs&&!o.fx&&(mv.id==='throw'||mv.id==='push'||mv.id==='drop'||mv.id==='take')){const kx=Math.sin(o.br+Math.PI),kz=Math.cos(o.br+Math.PI),fly=1.2+mv.kb;
            for(const uid of C.order){const u=C.F[uid];if(u===a||u===t||u.act==='dead'||(a.team&&u.team===a.team))continue;const rx=u.x-t.x,rz=u.z-t.z,al=rx*kx+rz*kz,pe=Math.abs(rx*kz-rz*kx);
              if(al>0&&al<fly+1&&pe<1.1){const cd=mv.dmg*.55*(a.dm||1);u.hp=Math.max(0,u.hp-cd);emit(C,'collide',a.id,u.id,{by:t.id,dmg:cd});if(u.hp<=0){u.act='dead';u.guard=false;u.ph=null;u.mv=null;emit(C,'dead',a.id,u.id)}else{stunF(u,34,'hit');addPo(C,u,mv.pdmg*.5);u.kx=kx;u.kz=kz;u.kr=mv.kb*.7}}}
            const A=C.arena;if(A&&t.act!=='dead'){const ex=t.x+kx*fly-A.x,ez=t.z+kz*fly-A.z;if(Math.hypot(ex,ez)>A.R-.6){const sd=mv.dmg*.4*(a.dm||1);t.hp=Math.max(0,t.hp-sd);emit(C,'slam',a.id,t.id,{dmg:sd,x:t.x+kx*fly,z:t.z+kz*fly});addPo(C,t,mv.pdmg*.5);if(t.hp<=0){t.act='dead';t.guard=false;t.ph=null;t.mv=null;emit(C,'dead',a.id,t.id)}}}}}}}
    if(hs>0)C.hs=hs;
    // (6) advance counters (not reached during hit-stop)
    for(const id of C.order){const f=C.F[id];if(f.act==='dead')continue;
      if(f.dcd>0&&f.arm!==0)f.dcd--;
      {const w=C.wp[id];if(w){if((f.act==='free'||f.act==='dodge'||f.act==='charge')&&Math.hypot(w.x-f.x,w.z-f.z)<PICK_R)wpRelease(C,id,'pick');else if(C.tick-w.t>=RETURN_T)wpRelease(C,id,'ret')}}
      if(f.guard)f.gpt=Math.min(99,f.gpt+1);else f.rel=Math.min(99,f.rel+1);
      if(f.pfT>0)f.pfT--;if(f.pry>0){f.pry--;if(f.pry===0){f.guard=false;f.rel=0}}
      f.sr=Math.min(999,f.sr+1);f.pr=Math.min(999,f.pr+1);
      if(f.sr>=30&&f.st<f.stMax)f.st=Math.min(f.stMax,f.st+(f.guard?.15:.4));
      if(f.pr>=90&&f.po>0)f.po=Math.max(0,f.po-.35);
      if(f.act==='attack'){f.lcT=C.tick;f.pt++;f.pk++;skipEmpty(f);if(f.act==='free'){f.ph=null;f.mv=null}}
      else if(f.act==='dodge'){f.pt++;if(f.pt>=DG(f).total){f.act='free';f.pt=0;f.dEnd=C.tick}}
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
  return{create,stepper,mkFighter,moveBy,stun:stunF,CONST:{SPEED,SUBM,GUARD_ARC,REARM,DEFL,BUF,PARRY_T,PARRY_W,PERFECT}}})();
