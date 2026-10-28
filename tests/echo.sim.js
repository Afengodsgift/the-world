// Hollow Echo: deterministic layout (both co-op clients must build the same room), bounded counts, fairness of spacing.
const E=require('../src/combat/Echo.js');let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
ok(E.stage(.9)===0&&E.stage(.7)===1&&E.stage(.5)===1&&E.stage(.35)===2&&E.stage(.1)===2,'echo stages at 70% and 35% boss health');
ok(E.count(1,false)===3&&E.count(2,false)===4&&E.count(1,true)===4&&E.count(2,true)===5,'bodies in the room: 3/4 solo, 4/5 co-op (bounded at 5)');
ok(E.searchTime(2,false)<E.searchTime(1,false)&&E.searchTime(1,true)>E.searchTime(1,false),'later echoes are quicker; co-op gets a little longer to find him');
const a=E.layout(12345,5,6,100,-50,true),b=E.layout(12345,5,6,100,-50,true);
ok(JSON.stringify(a)===JSON.stringify(b),'same seed => identical room on both clients');
ok(JSON.stringify(a)!==JSON.stringify(E.layout(12346,5,6,100,-50,true)),'a different seed gives a different room');
// over many seeds: real index uniform-ish, copies well spaced, all on the ring (so never on the players, who stand within 2 m of the centre)
const hist=[0,0,0,0,0];let minGap=1e9,minR=1e9,maxR=0;
for(let s=1;s<=600;s++){const L=E.layout(s*7919,5,6,0,0,true);hist[L.real]++;
  for(let i=0;i<5;i++){const r=Math.hypot(L.pos[i].x,L.pos[i].z);minR=Math.min(minR,r);maxR=Math.max(maxR,r);for(let j=i+1;j<5;j++)minGap=Math.min(minGap,Math.hypot(L.pos[i].x-L.pos[j].x,L.pos[i].z-L.pos[j].z))}}
ok(hist.every(h=>h>70),'the real one is any of the 5 slots (counts '+hist.join('/')+' of 600): no tell in the slot');
ok(minGap>2.6,'copies never overlap (closest pair '+minGap.toFixed(2)+' m)');
ok(minR>4.5,'copies stay well away from the centre where the players stand (closest '+minR.toFixed(2)+' m)');
const L=E.layout(99,4,6,0,0,true);ok(L.roles.join('')==='hghg'&&E.layout(99,4,6,0,0,false).roles.join('')==='hhhh','co-op alternates host/guest sides for the final lunge; solo is all on you');
console.log(bad?bad+' FAILED':'all ok');process.exit(bad?1:0)
