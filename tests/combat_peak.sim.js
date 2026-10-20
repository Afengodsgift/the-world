// Combat feel: monsters hunt pirates too, pirates fire back at monsters, hull damage slows ships, hits kick the hull.
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
const L=A.Leviathan,K=A.Monster;A.Leviathan.build();A.Monster.build();
// 1. a damaged pirate is slower
{const e=F.make(7001,'maiden',SP[0]+400,SP[1],0);e.sh.sail=1;
 const run=()=>{e.sh.x=SP[0]+400;e.sh.z=SP[1];e.sh.h=0;e.sh.v=0;tick(12,.05,()=>{e.sh.x=SP[0]+400;e.sh.z=SP[1];e.sh.h=0;e.sh.sail=1});return e.sh.v};
 const vFull=run();e.hp=e.K.hp*.2;const vHurt=run();ok(vHurt<vFull*.9,'a battered pirate sails slower ('+vFull.toFixed(1)+' -> '+vHurt.toFixed(1)+')');F.remove(e)}
// 2. the leviathan catches a ship under sail
{place(A,SP[0],SP[1],0);PL.v=12;PL.sail=1;const m=L.spawn(SP[0]+60,SP[1]+50);const h0=PL.hull;let bit=false;
 tick(45,.05,()=>{L.step(.05);PL.v=Math.max(PL.v,10);if(PL.hull<h0)bit=true;return !bit});
 ok(bit,'the leviathan runs down a sailing ship and bites it');L.drop()}
// 3. a pirate ship attacked by the leviathan is bitten, and shoots back at it
{place(A,SP[0],SP[1],0);PL.v=0;PL.sail=0;const e=F.make(7002,'whisper',SP[0]+70,SP[1]+10,0);const hp0=e.hp;
 const m=L.spawn(SP[0]+120,SP[1]+10);m.pe=e.id;m.cd=0;m.hp=m.max=99999;let mshell=0,hpm0=m.hp;
 tick(40,.05,()=>{L.step(.05);for(const s of A.Fleet.shells)if(s.m)mshell++;});
 ok(e.hp<hp0||e.sinking,'the leviathan bites the pirate ship ('+hp0+' -> '+e.hp+')');
 ok(mshell>0,'the pirate fires back at the beast');
 ok(m.hp<hpm0,'and its cannonballs hurt the beast ('+Math.round(hpm0-m.hp)+')');
 F.remove(e);L.drop()}
// 4. hull hits kick the hull
{place(A,SP[0],SP[1],0);const v=A.Ship.vessel();A.Vessel.kick(v,.3,.2,0);const k=v.kk;ok(Math.abs(k.rv)>.2,'kick adds spring velocity');
 for(let i=0;i<200;i++)A.Ship._step(.05);ok(Math.abs(v.kk.r)<.01&&Math.abs(v.kk.rv)<.02,'the kick settles by itself')}
process.exit(fails?1:0);
