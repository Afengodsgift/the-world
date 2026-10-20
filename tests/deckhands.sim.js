// Deckhands: AI crew on your galleon: gunners fire at pirates and monsters, hold-fire works, the carpenter patches the hull when it is quiet.
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
const PL=A.Ship._ship;C.enemy.cap=0;B.SHIP.enemy.cap=0;
const D=A.Deckhands;D.build();A.Leviathan.build();
place(A,SP[0],SP[1],0);A.Ship._step(.05);D.step(.05);
const nGuns=A.Ship.vessel().guns.length;
ok(D.list.filter(c=>c.role==="gun").length===Math.min(nGuns,6)&&D.list.some(c=>c.role==='carp'),'a gunner per cannon and a carpenter ('+D.list.length+' crew)');
// 1. they shoot at a pirate ship alongside
{const e=F.make(8001,'maiden',SP[0]+28,SP[1],0);e.sh.v=0;const hp0=e.hp;let shots=0;
 tick(30,.05,i=>{D.step(.05);e.sh.x=SP[0]+28;e.sh.z=SP[1];shots=Math.max(shots,A.Fleet.shells.filter(s=>!s.f).length)});
 ok(shots>0,'the gunners open fire on a pirate ship in their arc');ok(e.hp<hp0,'and hit it ('+hp0+' -> '+e.hp+')');F.remove(e)}
// 2. hold fire
{D.toggle();ok(D.hold(),'hold fire on');const e=F.make(8002,'maiden',SP[0]-28,SP[1],0);let shots=0;
 tick(15,.05,()=>{D.step(.05);A.Fleet.ships.forEach(q=>{q.sh.x=SP[0]-28;q.sh.z=SP[1];q.prov=0});for(const s of A.Fleet.shells)if(!s.f)shots++});
 ok(shots===0,'held crew do not fire');D.toggle();F.remove(e)}
// 3. they shoot a monster
{const L=A.Leviathan;const m=L.spawn(SP[0]+30,SP[1]+2);m.hp=m.max=99999;m.st=3;m.cd=99;const h0=m.hp;
 tick(25,.05,()=>{D.step(.05);m.x=SP[0]+30;m.z=SP[1]+2;m.st=3;m.T=0});ok(m.hp<h0,'the gunners shoot a sea monster ('+Math.round(h0-m.hp)+' damage)');L.drop()}
// 4. the carpenter patches the hull
{PL.hull=60;A.Fleet.shells.length=0;const h0=PL.hull;tick(3,.05,()=>D.step(.05));const h1=PL.hull;tick(12,.05,()=>D.step(.05));
 ok(h1<=h0+1,'no repairs straight after being hit');ok(PL.hull>h0+8,'then the carpenter patches her up ('+h0+' -> '+Math.round(PL.hull)+')')}
process.exit(fails?1:0);
