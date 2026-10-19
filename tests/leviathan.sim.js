// The leviathan: circle -> wind up -> lunge -> bite -> retreat cycle, ship + player damage, cannon hit zones, death + loot, guest mirroring.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','LEV-1'),B=client('b','B','LEV-1');A.others.get('b').group.position=B.S;B.others.get('a').group.position=A.S;
A.Ship.build();A.Fleet.build();A.Leviathan.build();B.Ship.build();B.Fleet.build();B.Leviathan.build();
const H=A.Fleet.isHost()?A:B,G=H===A?B:A,L=H.Leviathan,C=H.SHIP;
let best=[0,-300];{const Hf=H.H;outer:for(let r=80;r<1500;r+=40)for(let a=0;a<6.28;a+=.25){const x=Math.cos(a)*r,z=Math.sin(a)*r;let ok2=true;for(let da=0;da<6.28;da+=.6)for(const rr of [30,60,90,120])if(Hf(x+Math.cos(da)*rr,z+Math.sin(da)*rr)>-8)ok2=false;if(ok2){best=[x,z];break outer}}}
H.Ship._ship.x=best[0];H.Ship._ship.z=best[1];H.Ship._ship.v=0;H.Ship._ship.sail=0;H.Ship._step(.05);H.Ship._s.host=H.ctx.myId;
const sp=H.Ship.vessel().pose;H.Decks.pin(H.S,H.Ship.vessel().deck,0,2);H.S.grounded=true;
const m=L.spawn(sp.x+40,sp.z+10);ok(!!m&&L.get()===m,'the leviathan spawns');
const seen=new Set();const hp0=H.Fleet._me.hp,hull0=H.Ship._ship.hull;let minD=1e9;
for(let i=0;i<20*60;i++){H.Ship._step(.05);L.step(.05);seen.add(m.st);minD=Math.min(minD,Math.hypot(m.x-H.Ship.vessel().pose.x,m.z-H.Ship.vessel().pose.z));if(i%20===0)H.Decks.pin(H.S,H.Ship.vessel().deck,0,2)}
ok(seen.has(L.ST.SWIM)&&seen.has(L.ST.WIND)&&seen.has(L.ST.LUNGE)&&seen.has(L.ST.BACK),'it circles, winds up, lunges and swims off again');
ok(H.Ship._ship.hull<hull0,'the bite damages the ship ('+hull0+' -> '+H.Ship._ship.hull+')');
ok(minD<14,'it really reaches the hull (closest '+minD.toFixed(1)+' m)');
ok(m.hp===m.max,'it was not hurt by itself');
// hit zones
const part=(id)=>L.PARTS.find(p=>p.id===id);
const hp=L.partPos(m,part('h'),{}),ch=L.partPos(m,part('c'),{}),tl=L.partPos(m,part('t'),{});
let h0=m.hp;L.shellHit({x:hp.x,y:hp.y+1,z:hp.z,dmg:24});const dh=h0-m.hp;
h0=m.hp;L.shellHit({x:ch.x,y:ch.y+1,z:ch.z,dmg:24});const dc=h0-m.hp;
h0=m.hp;L.shellHit({x:tl.x,y:tl.y+1,z:tl.z,dmg:24});const dt=h0-m.hp;
ok(dh>dc&&dc>dt&&dt>0,'head > chest > tail damage ('+dh+' / '+dc+' / '+dt+')');
ok(L.shellHit({x:hp.x,y:C.sea-6,z:hp.z,dmg:24})===null,'balls under the water miss');
ok(L.shellHit({x:900,y:5,z:900,dmg:24})===null,'balls far away miss');
// guest mirror
G.Leviathan.onNet({k:'lb',id:m.id,x:m.x,z:m.z,h:m.hd});G.Leviathan.onNet({k:'lo',a:[m.x,m.z,m.hd,m.hp,m.st,0,m.sp]});for(let i=0;i<40;i++)G.Leviathan.step(.05);
const g=G.Leviathan.get();ok(g&&Math.abs(g.x-m.x)<2&&g.hp===Math.round(m.hp),'a guest mirrors it');
// death
L.damage('h',99999);ok(m.dead,'enough damage kills it');for(let i=0;i<20*9;i++)L.step(.05);ok(L.get()===null,'the carcass sinks and is removed');
process.exit(fails?1:0);
