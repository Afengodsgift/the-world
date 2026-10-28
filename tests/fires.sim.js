// Deck fires (src/ship/Fires.js): hits ignite the deck, fires burn the hull and grow, two players put them out (taps), the carpenter helps, the partner mirrors everything.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','FIR-1'),B=client('b','B','FIR-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const P of [A,B]){P.Ship.build();P.Fleet.build();P.Fires.build()}
const F=A.Fires,C=A.SHIP,sh=A.Ship._ship,K=C.cls[C.player];
A.Ship._s.host=A.ctx.myId;B.Ship._s.host=A.ctx.myId;
const tick=(n,dt)=>{dt=dt||.05;for(let i=0;i<n;i++){A.Ship._step(dt);B.Ship._step(dt);A.Fires._step(dt);B.Fires._step(dt)}};
tick(5);
ok(F.igniteChance(0)===0&&F.igniteChance(24)>.3&&F.igniteChance(24)<.6&&F.igniteChance(500)<=.6,'bigger hits ignite more often (24 dmg: '+Math.round(F.igniteChance(24)*100)+'%, capped at 60%)');
ok(F.burnRate({age:20})>F.burnRate({age:1}),'an old fire is a blaze: it burns the hull faster');
ok(F.spreadOk(3)&&!F.spreadOk(4),'at most 4 fires at once');
let n=0;for(let i=0;i<400;i++){if(A.Fires.ignite(24))n++;A.Fires._clear()}ok(n>100&&n<260,'ignite() fires on roughly the right fraction of hits ('+n+'/400)');
// ignite for real
A.Fires._clear();ok(F.ignite(24,true)&&F.count()===1,'a hit sets the deck on fire (host)');
tick(3);ok(B.Fires.count()===1,'the partner sees the fire');
ok(A.log.banners.some(b=>/FIRE ON DECK/.test(b))&&B.log.banners.some(b=>/FIRE ON DECK/.test(b)),'both are warned');
const f=F.list()[0],v=A.Ship.vessel();const fl=A.Decks.floor(v.deck,f.x,f.z);ok(Math.abs(fl-K.deckM)<.15&&!A.Decks.wallAt(v.deck,f.x,f.z,K.deckM,.3),'the fire is on a walkable plank of the main deck');
const bf=B.Fires.list()[0];ok(Math.abs(bf.x-f.x)<.01&&Math.abs(bf.z-f.z)<.01,'...at the same spot on both screens (ship-local)');
// burns the hull
const h0=sh.hull;tick(20*5);ok(sh.hull<h0-3,'a fire burns the hull ('+h0.toFixed(1)+' -> '+sh.hull.toFixed(1)+' in 5 s)');
const h1=sh.hull;for(let i=0;i<20*14;i++)tick(1);ok(F.list()[0].age>12,'it grows into a blaze');
ok(F.count()>=2,'a blaze spreads to the planks beside it ('+F.count()+' fires)');
// put it out: stand next to it, tap
A.Fires._clear();B.Fires._clear();F.ignite(24,true);tick(2);const g=F.list()[0];
A.Decks.pin(A.S,v.deck,g.x+.8,g.z);A.S.grounded=true;tick(1);
ok(!!F._nearest()&&F._nearest().id===g.id,'standing by the fire offers "Put out the fire"');
F._douse();F._douse();ok(g.hp>0&&g.hp<100,'one tap, two taps: still burning (hp '+g.hp+')');F._douse();tick(2);ok(F.count()===0,'three taps put it out');
ok(B.Fires.count()===0,'...on the partner\'s screen too');
ok(A.log.banners.some(b=>/All fires out/.test(b)),'the crew is told');
// the GUEST puts one out
F.ignite(24,true);tick(3);const g2=B.Fires.list()[0];B.Decks.pin(B.S,B.Ship.vessel().deck,g2.x+.7,g2.z);B.S.grounded=true;tick(1);
ok(!!B.Fires._nearest(),'the partner can reach it too');B.Fires._douse();B.Fires._douse();B.Fires._douse();tick(4);
ok(F.count()===0&&B.Fires.count()===0,'the guest\'s three taps reach the host and the fire is out');
// far away: nothing to put out
F.ignite(24,true);tick(2);A.S.x+=40;ok(!F._nearest(),'nothing to douse when you are far from the flames');A.S.x-=40;
// carpenter helps
A.Fires._clear();B.Fires._clear();A.Fires.F.help=2;F.ignite(24,true);const gh=F.list()[0];
// (Deckhands exists in the harness) a fire left alone is fought by the crew
for(let i=0;i<20*20;i++)tick(1);ok(F.count()===0||F.list()[0].hp<100,'with the crew on, Chips the carpenter fights fires too');
// sinking clears the deck
A.Fires._clear();F.ignite(24,true);sh.sunk=.2;tick(3);ok(F.count()===0,'a sinking ship has no fires to track');sh.sunk=0;
// firing through Ship.damage
let hits=0;for(let i=0;i<60;i++){A.Fires._clear();sh.hull=C.hull;A.Ship.damage(24);if(F.count())hits++}ok(hits>10&&hits<45,'cannon hits on the ship really start fires ('+hits+'/60)');
A.Fires._clear();sh.hull=C.hull;for(let i=0;i<60;i++)A.Ship.damage(.1,true);ok(F.count()===0,'burn damage itself never starts new fires');
console.log(fails?fails+' failure(s)':'all fire checks passed');process.exit(fails?1:0);
