// Ship controls: crew orders can be cancelled by tapping them again, the Repair order and the repair button heal the hull, the galleon is fast and never stalls head to wind.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','CTL-1'),B=client('b','B','CTL-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const P of [A,B]){P.Ship.build();P.Fleet.build();P.Deckhands.build()}
const D=A.Deckhands,C=A.SHIP,sh=A.Ship._ship;A.Ship._s.host=A.ctx.myId;B.Ship._s.host=A.ctx.myId;
const tick=(n,dt)=>{dt=dt||.05;for(let i=0;i<n;i++){A.Ship._step(dt);B.Ship._step(dt);A.Deckhands.step(dt);B.Deckhands.step(dt)}};
tick(5);
D.command('fire',true);ok(D.order()==='fire'&&D.on(),'the default order is fire at will');
D.tap('board');ok(D.order()==='board','tap Board: crew boards');
D.tap('board');ok(D.order()==='fire','tap Board AGAIN: it cancels and the crew goes back to fire at will');
D.tap('hold');ok(D.order()==='hold','tap Hold fire: hold');D.tap('hold');ok(D.order()==='fire','tap Hold fire again: it cancels');
D.tap('fire');ok(D.order()==='hold','tap Fire at will while it is active: toggles to hold fire');D.tap('fire');ok(D.order()==='fire','...and back');
D.tap('repair');ok(D.order()==='repair','a Repair order exists');D.tap('repair');ok(D.order()==='fire','tap Repair again: it cancels');
D.tap('board');D.tap('recall');ok(D.order()==='fire','Back to the ship recalls the crew');
D.tap('crew');ok(!D.on(),'crew can be dismissed');D.tap('crew');ok(D.on(),'...and called again');
tick(3);B.Deckhands.command&&0;ok(B.Deckhands.order()===D.order(),'the partner has the same order');
// repair order heals fast
sh.hull=C.hull*.4;D.tap('repair');const h0=sh.hull;tick(20*5);ok(sh.hull>h0+60,'the Repair order patches the hull quickly ('+Math.round(h0)+' -> '+Math.round(sh.hull)+' in 5 s)');
const hr=sh.hull-h0;D.tap('repair');D.tap('fire');sh.hull=C.hull*.4;const h1=sh.hull;A.Deckhands._calm&&0;tick(20*5);ok(sh.hull-h1<hr,'without the order the carpenter is much slower');
// repair button
D.tap('hold');sh.hull=C.hull*.5;const hb=sh.hull;ok(A.Ship.fix()&&Math.round(sh.hull-hb)===Math.round(C.hull*.08),'the repair button heals 8% of the hull ('+Math.round(sh.hull-hb)+')');
ok(!A.Ship.fix(),'...and has a short cooldown');tick(40);ok(A.Ship.fix(),'...then works again');
sh.hull=C.hull;tick(40);ok(!A.Ship.fix(),'nothing to repair on a full hull');
sh.hull=C.hull*.5;tick(30);B.Ship._s.fixCd=0;const g0=sh.hull;ok(B.Ship.fix(),'the partner can repair too');tick(3);ok(sh.hull>g0+10,'...the host applies it ('+Math.round(g0)+' -> '+Math.round(sh.hull)+')');
sh.sunk=.3;sh.hull=100;ok(!A.Ship.fix(),'no repairs on a sinking ship');sh.sunk=0;
// speed
const Sl=A.Sailing,W=d=>({dir:d,s:1}),land=()=>-9;
const run=(h,wd)=>{const s=Sl.newShip(0,0,h,{vmax:C.cls.galleon.v,minEff:C.cls.galleon.minEff,accel:C.sailing.accel,coast:C.sailing.coast,turn:.6,turnV:C.sailing.turnV});s.sail=1;for(let i=0;i<20*60;i++)Sl.step(s,{},.05,{wind:W(wd),H:land});return s.v};
const beam=run(0,Math.PI/2),into=run(0,Math.PI),down=run(0,0);
ok(beam>17,'the galleon is fast: beam reach '+beam.toFixed(1)+' m/s ('+(beam*1.944).toFixed(0)+' kn)');
ok(into>3.5,'sailing into the wind still moves you ('+into.toFixed(1)+' m/s): no more stalling');
ok(down>beam*.5,'running before the wind is decent ('+down.toFixed(1)+' m/s)');
ok(C.sailing.boostT>=8&&C.sailing.boostCd>C.sailing.boostT,'boost lasts 8 s then a short recharge');
ok(C.sailing.vmax*C.sailing.boostMul<=C.cls.galleon.v*1.6,'boost is strong but not absurd');
// ---------- grappling hooks ----------
{
  for(const e of [...A.Fleet.ships.values()])A.Fleet.remove(e);
  const Fl=A.Fleet,p=sh;p.x=-300;p.z=300;p.h=0;p.v=0;p.sail=0;p.hull=C.hull;
  const e=Fl.make(901,'barnacle',p.x+40,p.z+25,Math.PI);ok(!!e,'a pirate ship 47 m away');
  ok(Fl.grappleTarget()===e,'it is in grapple range');
  const far=Fl.make(902,'skiff',p.x+300,p.z,0);ok(Fl.grappleTarget()===e,'a ship 300 m away is not');
  Fl.remove(far);
  ok(Fl.grapple(),'the hooks fly');ok(e.lash&&e.lashT>60,'the pirate is lashed to us ('+Math.round(e.lashT)+' s)');
  const d0=Math.hypot(e.sh.x-p.x,e.sh.z-p.z);let jump=0,last={x:e.sh.x,z:e.sh.z};
  for(let i=0;i<20*8;i++){A.Fleet._step(.05);const dx=Math.hypot(e.sh.x-last.x,e.sh.z-last.z);jump=Math.max(jump,dx);last={x:e.sh.x,z:e.sh.z}}
  const d1=Math.hypot(e.sh.x-p.x,e.sh.z-p.z);
  ok(d1<d0&&d1<(A.Ship.vessel().hb+e.v.hb),'it is hauled alongside ('+Math.round(d0)+' m -> '+Math.round(d1)+' m)');
  ok(jump<4,'...smoothly, no teleport (largest step '+jump.toFixed(2)+' m)');
  p.v=12;for(let i=0;i<20;i++)A.Fleet._step(.05);ok(!!e.lash,'it stays hooked while you sail at 12 m/s (you can tow it)');
  p.v=18;A.Fleet._step(.05);ok(!e.lash,'...but the lines snap at ramming speed');p.v=0;
  }
console.log(fails?fails+' failure(s)':'all ship control checks passed');process.exit(fails?1:0);
