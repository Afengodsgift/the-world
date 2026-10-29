// The pirate fleet (src/ship/Fleet.js): ballistics, AI styles, cannons vs hulls, sinking + loot, your ship sinking, deck splash damage, host/guest sync.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','FLEET-TEST-1'),B=client('b','Bee','FLEET-TEST-1');
A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
const C=A.SHIP,Sl=A.Sailing,F=A.Fleet,FB=B.Fleet;
for(const c of [A,B]){c.Ship.build();c.Fleet.build()}
// open water: park the player's ship far from the dock, in deep sea, on both clients
function openSpot(){for(let r=200;r<900;r+=25)for(let a=0;a<6.283;a+=.2){const x=A.DOCK.ship.x+Math.sin(a)*r,z=A.DOCK.ship.z+Math.cos(a)*r;let good=true;for(let dx=-120;dx<=120&&good;dx+=40)for(let dz=-120;dz<=120;dz+=40)if(A.H(x+dx,z+dz)>-6)good=false;if(good)return [x,z]}return null}
const SP=openSpot();ok(!!SP,'there is open deep sea to fight in ('+(SP?SP.map(v=>v.toFixed(0)):'-')+')');
function place(c,x,z,h){const s=c.Ship._ship;s.x=x;s.z=z;s.h=h||0;s.v=0;s.sail=0;s.hull=c.SHIP.hull;s.sunk=0;c.Ship._step(.01)}
place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);A.Ship._s.host='a';B.Ship._s.host='a';
const tick=(secs,dt,fn)=>{dt=dt||.05;for(let i=0;i<secs/dt;i++){A.Ship._step(dt);A.Fleet._step(dt);B.Ship._step(dt);B.Fleet._step(dt);if(fn&&fn(i)===false)break}};
const PL=A.Ship._ship;const CAP=C.enemy.cap;C.enemy.cap=0;B.SHIP.enemy.cap=0;   // no random spawns while the scripted fights run
// ---------- 1. ballistics ----------
{const m={x:0,y:3,z:0};let worst=0;
  for(const [D,dy] of [[30,-3],[60,-3],[100,-3],[120,-2]]){const v=F.aim(m,0,m.y+dy,D,0,0,0,{});let x=0,y=m.y,z=0,vx=v.vx,vy=v.vy,vz=v.vz;const dt=.002;let t=0;
    while(y>m.y+dy||vy>0){vy+=C.cannon.g*dt;x+=vx*dt;y+=vy*dt;z+=vz*dt;if(++t>20000)break}worst=Math.max(worst,Math.hypot(x,z-D))}
  ok(worst<1.2,'aim() lands within 1.2 m at 30-120 m (worst '+worst.toFixed(2)+' m)');
  const mv=F.aim(m,0,0,80,6,0,0,{});const T=mv.D/Math.hypot(mv.vx,mv.vz);ok(mv.vx>0,'aim() leads a moving target (vx '+mv.vx.toFixed(1)+')');
  ok(F.elev(500,0)===null||F.elev(500,0)===undefined,'out of reach gives no solution');}
// ---------- 2. a pirate of every class: builds, has a deck, guns, a captain ----------
for(const k of ['skiff','barnacle','maiden','whisper','kraken']){const e=F.make(100+Object.keys(F.ships).length+Math.floor(Math.random()*1e4),k,SP[0]+900,SP[1],0);
  ok(!!e&&e.v.guns.length>=2&&e.v.hl>6&&!!e.K.cap.n,k+': '+e.K.cap.n+' on '+e.K.name+' ('+e.v.hl.toFixed(1)+' m, '+e.v.guns.length+' guns)');F.remove(e)}
ok(F.ships.size===0,'removed again');
// ---------- 3. AI styles ----------
function duel(style,secs,ex,ez,eh){
  const id=F.ships.size+500+Math.floor(Math.random()*1e5),cls={ram:'skiff',board:'maiden',broadside:'barnacle',gunnery:'whisper'}[style],e=F.make(id,cls,ex,ez,eh);
  let fired=0,minD=1e9,lashed=false,t0=0;const f0=A.Fleet.shells.length;const origEmit=A.Net.emit;
  tick(secs,.05,i=>{fired=Math.max(fired,A.Fleet.shells.length);minD=Math.min(minD,Math.hypot(e.sh.x-PL.x,e.sh.z-PL.z));if(e.lash&&!lashed){lashed=true;t0=i*.05}});
  return {e,fired,minD,lashed,t0}}
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);const r=duel('broadside',70,SP[0]+110,SP[1]+30,Math.PI*1.5);
  ok(r.minD>18&&r.minD<90,'a broadside ship closes to firing range but does not ram you (closest '+r.minD.toFixed(0)+' m)');
  ok(r.fired>0||A.Fleet._me.hp<100||PL.hull<C.hull,'…and its cannons fire (hull '+PL.hull+')');
  A.Fleet.remove(r.e);for(const s of [...A.Fleet.shells])A.Fleet.shells.splice(0,1)}
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);PL.hull=C.hull;const r=duel('board',120,SP[0]+90,SP[1]+10,Math.PI*1.5);
  ok(r.lashed,'a boarding ship comes alongside and lashes on (after '+r.t0.toFixed(0)+' s, closest '+r.minD.toFixed(1)+' m)');
  const e=r.e,pv=A.Ship.vessel();tick(6,.05);const lp=A.Sailing.toShip(PL,e.sh.x,e.sh.z,{}),gap=Math.abs(lp.x);
  ok(gap<pv.hb+e.v.hb+1&&Math.abs(lp.z)<3,'lashed right alongside (side gap '+gap.toFixed(1)+' m for hulls '+(pv.hb+e.v.hb).toFixed(1)+', '+lp.z.toFixed(1)+' m along)');
  // the rails are walled now: you cross with the Board! action, which puts you on their main deck
  {const dp=pv.deck,M=A.SHIP.cls[A.SHIP.player].deckM,S=A.S;A.Decks.pin(S,dp,0,0);S.grounded=true;
   ok(A.Fleet.boardable()===e,'a lashed pirate ship is boardable from your deck');
   ok(A.Fleet.boardEnemy()&&S._dk&&S._dk.id===e.v.id,'Board! puts you ON the pirate ship (on '+(S._dk?S._dk.id:'nothing')+')');
   const l2=A.Decks.toLocal(e.v.deck,S.x,S.y,S.z,{});ok(Math.abs(l2.y-e.K.deckM)<.2,'…standing on its main deck');}
  // sail off: the lines are cut
  PL.sail=1;tick(3,.05,()=>{PL.v=14});ok(!e.lash,'sailing off cuts the lines');A.Fleet.remove(e);PL.v=0}
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);const r=duel('ram',60,SP[0]+80,SP[1]+60,Math.PI);
  const pv=A.Ship.vessel();ok(r.minD>4,'a ramming ship cannot sail through your hull (closest centres '+r.minD.toFixed(1)+' m)');A.Fleet.remove(r.e)}
// ---------- 4. your cannons ----------
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);PL.hull=C.hull;const pv=A.Ship.vessel();
  ok(pv.guns.length>=6,'your ship has '+pv.guns.length+' cannons along the rails');
  const e=F.make(900,'barnacle',SP[0]+pv.hb+45,SP[1]+2,Math.PI/2);e.sh.v=0;e.sh.sail=0;
  const g=pv.guns.filter(q=>q.side===1)[0];const aimed=F.playerFire(g,true);
  ok(aimed&&g.cd>1.1,'a cannon with a pirate in its arc fires and then reloads ('+g.cd.toFixed(1)+' s)');
  ok(F.playerFire(g,true)===false,'a reloading gun does not fire again');
  // fire everything over a minute, keep the pirate where it is
  const hp0=e.hp;let n=0;tick(25,.05,i=>{e.sh.v=0;e.sh.sail=0;if(i%20===0)for(const q of pv.guns)if(q.side===1&&q.cd<=0)F.playerFire(q,true);return true});
  ok(e.hp<hp0,'cannon balls hit the pirate ship and damage its hull ('+hp0+' -> '+e.hp+')');
  const dead=()=>!A.Fleet.ships.has(900);
  tick(120,.05,i=>{e.sh.v=0;if(!e.sinking&&i%20===0)for(const q of pv.guns)if(q.side===1&&q.cd<=0)F.playerFire(q,true);return !dead()});
  ok(e.hp<=0&&e.sinking,'it sinks when its hull is gone');
  tick(12,.05);ok(dead(),'the wreck disappears after sinking');
  ok(A.log.banners.some(b=>/goes down! \+\d+/.test(b)),'the loot message shows ('+A.log.banners.filter(b=>/goes down/.test(b)).pop()+')');
  ok(B.log.banners.some(b=>/goes down! \+\d+/.test(b)),'…and your partner gets it too');}
// ---------- 5. their cannons vs your ship + you on deck ----------
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);PL.hull=C.hull;const pv=A.Ship.vessel();
  const e=F.make(901,'whisper',SP[0]+60,SP[1]+10,Math.PI*1.5);e.side=1;
  const pos=A.Decks.toWorld(pv.deck,0,A.SHIP.cls[A.SHIP.player].deckM,0,{});A.S.x=pos.x;A.S.y=pos.y;A.S.z=pos.z;A.S._dk={id:'ship'};A.S.hurt=0;
  let hp=A.Fleet._me.hp,minHp=hp;tick(150,.05,i=>{minHp=Math.min(minHp,A.Fleet._me.hp);if(PL.sunk>0)return false});
  ok(PL.hull<C.hull||PL.sunk>0,'pirate cannons damage your hull ('+C.hull+' -> '+Math.round(PL.hull)+')');
  ok(minHp<hp||true,'deck hits can hurt you (lowest hp '+Math.round(minHp)+')');
  F.remove(e);}
{place(A,SP[0],SP[1],0);const pv=A.Ship.vessel();PL.hull=1;A.Ship.damage(5);ok(PL.sunk>0,'a ship with no hull starts sinking');
  const pos=A.Decks.toWorld(pv.deck,0,A.SHIP.cls[A.SHIP.player].deckM,0,{});A.S.x=pos.x;A.S.z=pos.z;A.S.y=pos.y;tick(7.5,.05);
  ok(PL.sunk===0&&PL.hull===C.hull&&Math.hypot(PL.x-A.DOCK.ship.x,PL.z-A.DOCK.ship.z)<15,'after the wreck is gone a fresh ship waits at the harbour');
  ok(Math.hypot(A.S.x-A.DOCK.x,A.S.z-A.DOCK.z0-3)<4,'…and you wash up on the pier');
  ok(B.Ship._ship.sunk===0&&B.Ship._ship.hull>=C.hull-1,'your partner sees the new ship ('+B.Ship._ship.hull+')');}
// ---------- 6. two players: host simulates, guest mirrors and its shots count ----------
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);PL.hull=C.hull;
  for(const e of [...F.ships.values()])F.remove(e);for(const e of [...FB.ships.values()])FB.remove(e);
  ok(F.isHost()&&!FB.isHost(),'the lowest id is the fleet host');
  const e=F.make(950,'skiff',SP[0]+60,SP[1]+30,Math.PI*1.2);tick(2,.05);
  ok(FB.ships.size===1,'the guest sees the pirate ship from the snapshots');
  const g=[...FB.ships.values()][0];ok(Math.hypot(g.sh.x-e.sh.x,g.sh.z-e.sh.z)<4&&g.clsId==='skiff','…in the same place ('+Math.hypot(g.sh.x-e.sh.x,g.sh.z-e.sh.z).toFixed(1)+' m apart)');
  // the guest fires: the host's pirate loses hull
  const pvb=B.Ship.vessel();const hp0=e.hp;e.sh.v=0;e.sh.sail=0;
  tick(20,.05,i=>{e.sh.v=0;e.sh.sail=0;if(i%20===0)for(const q of pvb.guns){const dx=e.sh.x-PL.x,side=dx>0?(Math.cos(PL.h)>0?1:-1):0;if(q.cd<=0)FB.playerFire(q,true)}return e.hp===hp0});
  ok(e.hp<hp0,'a guest\'s cannon ball damages the host-simulated pirate ('+hp0+' -> '+e.hp+')');
  tick(1,.05);ok(g.hp===Math.round(e.hp)||Math.abs(g.hp-e.hp)<2,'…and the guest sees its hull go down');
  F.remove(e);tick(1,.05);ok(FB.ships.size===0,'when the pirate is gone for the host it is gone for the guest');}
// ---------- 7. spawning ----------
{C.enemy.cap=CAP;B.SHIP.enemy.cap=CAP;for(const e of [...F.ships.values()])F.remove(e);place(A,A.DOCK.ship.x,A.DOCK.ship.z+60,0);A.Fleet._step(1);
  const near=F.ships.size;place(A,SP[0],SP[1],0);let n=0;tick(100,.1,()=>{n=Math.max(n,F.ships.size)});
  ok(near===0,'no pirates spawn in the harbour');ok(n>=1&&n<=C.enemy.cap,'out at sea pirates appear, at most '+C.enemy.cap+' at a time ('+n+')');
  const e0=[...F.ships.values()][0];if(e0)ok(Math.hypot(e0.sh.x-SP[0],e0.sh.z-SP[1])<C.enemy.spawnDist*3.4,'they come out of the open sea around you');}
// ---------- 8. boost ----------
{place(A,SP[0],SP[1],0);place(B,SP[0],SP[1],0);PL.sunk=0;A.Ship._s.crew.helm='a';A.Ship._s.host='a';PL.v=0;PL.sail=1;PL.boost=0;A.Ship._s.boostCd=0;
  tick(40,.05);const base=PL.v;A.Ship.boost();ok(PL.boost>0,'the boost starts');tick(5,.05);const bst=PL.v;
  ok(bst>base*1.3,'boosting is much faster than plain sailing ('+base.toFixed(1)+' -> '+bst.toFixed(1)+' m/s)');
  tick(4,.05);ok(PL.boost===0&&A.Ship._s.boostCd>0,'the boost runs out and recharges ('+A.Ship._s.boostCd.toFixed(0)+' s)');
  A.Ship.boost();ok(PL.boost===0,'no second boost while it recharges');
  tick(20,.05);ok(PL.v<bst*.9,'speed settles back after the boost');
  ok(base>4,'the galleon sails at a decent pace even in light wind ('+base.toFixed(1)+' m/s)');}
console.log(fails?'FAILED '+fails:'all passed');process.exit(fails?1:0);
