// Ship camera modes (third / captain / cannon): anchors, restore, limits, fire direction = camera direction, leave rules.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','Alex','CAM-TEST-1');A.Ship.build();A.Fleet.build();
const C=A.SHIP,Sh=A.Ship,S=A.S,CR=A.CameraRig,P=Sh._ship;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// open water so nothing interferes
let SP=null;for(let r=200;r<900&&!SP;r+=25)for(let a=0;a<6.283&&!SP;a+=.2){const x=A.DOCK.ship.x+Math.sin(a)*r,z=A.DOCK.ship.z+Math.cos(a)*r;let g=true;for(let dx=-60;dx<=60&&g;dx+=30)for(let dz=-60;dz<=60&&g;dz+=30)if(A.H(x+dx,z+dz)>-6)g=false;if(g)SP=[x,z]}
P.x=SP[0];P.z=SP[1];P.h=0;P.v=0;P.sail=0;A.Ship._step(.01);A.Ship._s.host='a';
const step=(n,dt)=>{for(let i=0;i<(n||1);i++)Sh._step(dt||.05)};
Sh._board();step(2);
ok(Sh.cam()==='third'&&CR.last&&!CR.last.eye,'aboard: third-person boom, no eye anchor');
// helm
const hp=Sh._helmPos();S.x=hp.x;S.z=hp.z;S.y=hp.y;S._dk=null;A.Decks.pin(S,Sh._deck(),C.stations.helm[0],C.stations.helm[1]);step(2);
Sh._claim('helm');step(3);
ok(Sh.seated()&&Sh.cam()==='third'&&CR.last&&!CR.last.eye&&CR.last.pk===1,'at the helm: third-person by default');
ok(CR.last.d<45,'the boom is not miles behind ('+CR.last.d.toFixed(0)+' m)');
Sh.toggleCam();step(3);
const e=CR.last.eye;ok(Sh.cam()==='captain'&&!!e,'camera button: captain view with an eye anchor');
ok(e.y>S.y+2.4&&e.y<S.y+4.5&&Math.hypot(e.x-S.x,e.z-S.z)<1.5,'the anchor is above and right at the wheel (up '+(e.y-S.y).toFixed(1)+' m)');
// the anchor rides the ship: turn it, the eye stays over the wheel
P.h=1.2;step(2);const e2=CR.last.eye;ok(Math.hypot(e2.x-S.x,e2.z-S.z)<1.5&&Math.abs(wrap(S.yaw-(P.h+Math.PI)))<3.2,'the anchor follows the ship\'s heading');
// yaw follows the ship's turns
S.yaw=wrap(P.h+Math.PI+.4);const y0=S.yaw;P.h+=.3;step(1);ok(Math.abs(wrap(S.yaw-y0-.3))<.05,'the look direction turns with the ship (your drag offset is kept)');
Sh.toggleCam();ok(Sh.cam()==='third','toggle back to third-person');
Sh.toggleCam();
// leave the helm: Jump / exit button / interaction all call leave
Sh.leave();step(2);ok(!Sh.seated()&&Sh.cam()==='third'&&!CR.last.eye,'leaving the helm restores the third-person camera');
ok(!Sh.locked(),'controls are free again');
// cannon
Sh._board();step(2);
const v=Sh.vessel(),g=v.guns.find(q=>q.side>0);
ok(!!g,'there is a starboard cannon');
const m=A.Vessel.muzzle(v,g,{});S.x=m.x-1;S.z=m.z;S.y=m.y-1.4;S._dk=null;A.Decks.pin(S,Sh._deck(),g.x-1.4,g.z);step(2);
ok(A.Fleet.nearGun()===g,'standing by the gun');
ok(Sh.aimGun(g)&&Sh.gunning()&&Sh.cam()==='cannon','"Man the cannon" starts the cannon camera');
step(2);const ce=CR.last.eye,o=A.Vessel.outward(v,g,{});
ok(!!ce&&Math.hypot(ce.x-(m.x-o.x*3.2),ce.z-(m.z-o.z*3.2))<.8&&ce.y>m.y,'the camera is anchored behind and above THIS gun');
ok(CR.last.pr[0]===-C.cannon.aimUp&&CR.last.pr[1]===C.cannon.aimDown,'pitch limits are the cannon\'s');
// the ship moves: the anchor follows the real muzzle
for(let i=0;i<20;i++){P.h+=.02;P.x+=.4;step(1,.02)}step(2);const m2=A.Vessel.muzzle(v,g,{}),o2=A.Vessel.outward(v,g,{}),ce2=CR.last.eye;
ok(Math.hypot(ce2.x-(m2.x-o2.x*3.2),ce2.z-(m2.z-o2.z*3.2))<1,'the camera follows the gun as the ship turns and sails');
// yaw is held inside the horizontal limit
const cen=wrap(Math.atan2(o2.x,o2.z)+Math.PI);S.yaw=wrap(cen+2);step(1);ok(Math.abs(wrap(S.yaw-cen))<=C.cannon.aimYaw+.03,'aim yaw is clamped to the gun\'s arc');
// firing goes where the camera looks (clamped)
const ao=Math.atan2(o2.x,o2.z);
function shootAt(dyaw,el){const a=ao+dyaw,ce_=Math.cos(el);A.camera.d.set(Math.sin(a)*ce_,Math.sin(el),Math.cos(a)*ce_);const n0=A.Fleet.shells.length;g.cd=0;const okf=A.Fleet.playerFire(g,false,true);const s=A.Fleet.shells[A.Fleet.shells.length-1];return {okf,s,n:A.Fleet.shells.length-n0}}
let r=shootAt(.3,.2);const sd=r.s;ok(r.okf&&r.n===1,'fire! launches one ball');
const h=Math.hypot(sd.vx-Math.sin(P.h)*P.v,sd.vz-Math.cos(P.h)*P.v),ang=Math.atan2(sd.vx-Math.sin(P.h)*P.v,sd.vz-Math.cos(P.h)*P.v);
ok(Math.abs(wrap(ang-(ao+.3)))<.02&&Math.abs(Math.atan2(sd.vy,h)-.2)<.02,'the ball leaves along the camera direction (yaw '+wrap(ang-ao).toFixed(2)+', elev '+Math.atan2(sd.vy,h).toFixed(2)+')');
r=shootAt(1.4,.9);const s2=r.s,a2=Math.atan2(s2.vx-Math.sin(P.h)*P.v,s2.vz-Math.cos(P.h)*P.v),h2=Math.hypot(s2.vx-Math.sin(P.h)*P.v,s2.vz-Math.cos(P.h)*P.v);
ok(Math.abs(wrap(a2-ao))<=C.cannon.aimYaw+.02&&Math.atan2(s2.vy,h2)<=C.cannon.aimUp+.02,'the gun\'s limits clamp an impossible aim');
// leave: back to what it was
Sh.leave();step(1);ok(!Sh.gunning()&&Sh.cam()==='third'&&!CR.last.eye&&Sh.aboard!==false,'leaving the cannon restores third-person');
// previous mode restore: captain -> (forced cannon) -> captain
Sh._claim('helm');step(1);Sh.toggleCam();step(1);Sh.leave();step(1);
// ship sinking while at a cannon
Sh._board();step(2);Sh.aimGun(g);step(1);P.sunk=.5;step(2);ok(!Sh.gunning(),'a sinking ship drops you out of the cannon camera');
P.sunk=0;
process.exit(fails?1:0);
