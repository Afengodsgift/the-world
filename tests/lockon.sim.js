// Enemy lock-on: target choice, camera follows, auto next target, range drop, unlock.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','LOCK-1'),L=A.LockOn,S=A.S,TAU=Math.PI*2;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
S.x=0;S.y=0;S.z=0;S.yaw=Math.PI;                    // camera looks along +z
let foes=[{id:'n',x:6,y:0,z:8,hp:50,max:50},{id:'f',x:0,y:0,z:25,hp:50,max:50},{id:'b',x:0,y:0,z:-5,hp:50,max:50}];
L.source('t',()=>foes.filter(f=>f.hp>0));
L.build();
// scoring
ok(L.pick(foes,0,0,0).id==='n','the closest foe in front of the camera is picked first');
ok(L.pick([{id:'x',x:0,y:0,z:12,hp:1},{id:'y',x:12,y:0,z:0,hp:1}],0,0,0).id==='x','of two equally close foes the one the camera already faces wins');
ok(L.pick([{id:'a',x:0,y:0,z:10,hp:1},{id:'c',x:0,y:0,z:11,hp:1,cap:1}],0,0,0).id==='c','a captain is slightly preferred');
// toggle
ok(L.toggle()===true&&L.active()&&L.target().id==='n','toggle locks the best target');
for(let i=0;i<60;i++)L._step(1/30);
const want=wrap(Math.atan2(6,8)+Math.PI);ok(Math.abs(wrap(S.yaw-want))<.05,'the camera swings round to look at the target');
// target dies -> next closest
foes[0].hp=0;L._step(.05);L._step(.05);ok(L.active()&&L.target().id!=='n','when the target dies the lock jumps to the next foe');
const cur=L.target().id;ok(L.cycle()&&L.target().id!==cur,'cycle switches target');
// out of range
foes=[{id:'far',x:0,y:0,z:80,hp:50,max:50}];L.clear();ok(L.toggle()===false&&!L.active(),'nobody within range: nothing to lock');
foes=[{id:'near',x:0,y:0,z:10,hp:50,max:50}];L.toggle();foes[0].z=100;for(let i=0;i<10;i++)L._step(.05);ok(!L.active(),'the lock drops when the target gets far away');
// unlock
foes=[{id:'near',x:0,y:0,z:10,hp:50,max:50}];L.toggle();ok(L.active(),'locked again');L.toggle();ok(!L.active()&&L.target()===null,'toggling again unlocks');
// does not touch the camera while unlocked
const y0=S.yaw;for(let i=0;i<30;i++)L._step(1/30);ok(S.yaw===y0,'unlocked: the camera is left alone');
process.exit(fails?1:0);
