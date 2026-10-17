// Pirate crews (src/ship/Crew.js): they spawn on the deck, stand on it, chase and hurt you, die to hits, captain down = ship down, guests mirror.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','CREW-TEST-1'),B=client('b','Bee','CREW-TEST-1');
A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
for(const c of [A,B]){c.Ship.build();c.Fleet.build();c.Crew.build()}
A.SHIP.enemy.cap=0;B.SHIP.enemy.cap=0;
const F=A.Fleet,CR=A.Crew,C=A.SHIP;
let SP=null;for(let r=200;r<900&&!SP;r+=25)for(let a=0;a<6.283&&!SP;a+=.2){const x=A.DOCK.ship.x+Math.sin(a)*r,z=A.DOCK.ship.z+Math.cos(a)*r;let g=true;for(let dx=-100;dx<=100&&g;dx+=40)for(let dz=-100;dz<=100&&g;dz+=40)if(A.H(x+dx,z+dz)>-6)g=false;if(g)SP=[x,z]}
ok(!!SP,'open sea');
const PL=A.Ship._ship;PL.x=SP[0];PL.z=SP[1];PL.h=0;PL.v=0;A.Ship._step(.01);
const tick=(s,dt)=>{dt=dt||.05;for(let i=0;i<s/dt;i++){A.Ship._step(dt);F._step(dt);A.Crew.step(dt);B.Ship._step(dt);FB._step(dt);B.Crew.step(dt)}};
const FB=B.Fleet;
const e=F.make(900,'maiden',SP[0]+70,SP[1]+4,Math.PI/2);
const mine=CR.ofShip(900);
ok(mine.length===8,'maiden gets 5 cutlass + 2 pistol + captain ('+mine.length+')');
ok(mine.filter(c=>c.cap).length===1,'exactly one captain');
const dy=mine.map(c=>c.B.y-e.v.pose.y);ok(dy.every(v=>v>3&&v<14),'crew stand on the deck, not in the hull/sea ('+Math.min(...dy).toFixed(1)+'..'+Math.max(...dy).toFixed(1)+')');
tick(3);
for(const c of mine){const d=Math.hypot(c.B.x-e.v.pose.x,c.B.z-e.v.pose.z);if(d>e.v.hl+2)console.log('OFF',c.kind,d.toFixed(1),c.B.y.toFixed(1),c.dead,c.swim,e.v.hl.toFixed(1))}
ok(mine.every(c=>Math.hypot(c.B.x-e.v.pose.x,c.B.z-e.v.pose.z)<e.v.hl+2),'crew ride the ship');
// guest mirrors
tick(1);
ok(B.Crew.list.size===8,'guest sees the same crew ('+B.Crew.list.size+')');
// they fight: put the player on the enemy deck next to a cutlass pirate
const c0=mine.find(c=>c.kind==='cut'&&!c.dead);
A.S.x=c0.B.x+3;A.S.z=c0.B.z;A.S.y=c0.B.y;A.S._dk=null;A.Fleet._me.hp=100;
for(let i=0;i<20&&A.Fleet._me.hp>=100;i++){A.S.x=c0.B.x+1.5;A.S.z=c0.B.z;A.S.y=c0.B.y;tick(.5)}
ok(A.Fleet._me.hp<100,'a pirate cutlasses you (hp '+A.Fleet._me.hp+')');
// slash kills
A.Fleet._me.hp=100;A.Fleet._me.down=0;
const t=mine.find(c=>c.kind==='cut'&&!c.dead);A.S.x=t.B.x+1.2;A.S.z=t.B.z;A.S.y=t.B.y;
for(let i=0;i<30&&!mine.some(c=>c.dead);i++){A.Fleet._me.hp=100;A.Fleet._me.down=0;A.S.x=t.B.x+1.2;A.S.z=t.B.z;A.S.y=t.B.y;A.Crew.slash();tick(.45)}
const dd=mine.find(c=>c.dead);ok(!!dd,'cutlass slashes beat a pirate');
ok(dd&&B.Crew.list.get(dd.id)&&B.Crew.list.get(dd.id).dead,'guest sees him fall');
// gun hits
const p=mine.find(c=>c.kind==='pis'&&!c.dead);CR.hit(p.id,999,'head');ok(p.dead,'a headshot drops a pistol pirate');
// captain down = ship sinks
const cap=mine.find(c=>c.cap);CR.hit(cap.id,999,'torso');tick(.2);
ok(e.sinking,'captain defeated: the ship surrenders and sinks');
tick(10);ok(!F.ships.has(900)&&CR.ofShip(900).length===0,'ship and crew gone after it sinks');
process.exit(fails?1:0);
