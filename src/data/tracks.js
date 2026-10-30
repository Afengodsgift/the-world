// Skybreak Rally routes. Static data (no THREE/DOM), consumed by race/Track.js. All numbers are metres, world coordinates unless a road has `o` (origin),
// in which case its points are local to that island's centre. A control point is [x, z, dy?, width?]: dy = height above the terrain (bridges, ramps),
// width overrides the road width at that point. Gates / pads / hazards reference a road by id and a control-point index `p`.
//
// Leg 1: PALM ATOLL -> STORM CAY. Palm Atoll is flat (pk 0, shore at ~212 m from its centre, the foot-race loop `KT` fills the middle), so the
// road keeps to the ring between the loop and the beach: east-side start grid, sweep into a slalom, two swinging hammers, a crest, a 180 hairpin,
// a bridge, a second hairpin, a kicker jump (a real gap) and then the massive launch ramp pointing at Storm Cay (bearing from the lip to the
// touchdown strip is exactly the ramp's heading). The sky section is five rings on a rising-then-gliding arc, ending in a wide landing strip.
const PALM={x:760,z:1400},STORM={x:0,z:1750},FROST={x:-980,z:1450};
// A flight path is a cubic Bezier from the launch lip (leaving along the ramp's heading d0) to the touchdown point (arriving along the strip's heading d3).
// Rings sit on it at parameter u with a chosen altitude and face along the path, so the sky leg flows from the ramp into the landing strip.
const _air=(P0,d0,P3,d3,pts)=>{
  const D=Math.hypot(P3.x-P0.x,P3.z-P0.z),k0=D*.4,k3=D*.3,P1={x:P0.x+d0[0]*k0,z:P0.z+d0[1]*k0},P2={x:P3.x-d3[0]*k3,z:P3.z-d3[1]*k3};
  return pts.map(([u,y,k])=>{const v=1-u,x=v*v*v*P0.x+3*v*v*u*P1.x+3*v*u*u*P2.x+u*u*u*P3.x,z=v*v*v*P0.z+3*v*v*u*P1.z+3*v*u*u*P2.z+u*u*u*P3.z,
    tx=3*v*v*(P1.x-P0.x)+6*v*u*(P2.x-P1.x)+3*u*u*(P3.x-P2.x),tz=3*v*v*(P1.z-P0.z)+6*v*u*(P2.z-P1.z)+3*u*u*(P3.z-P2.z);
    return {x,y,z,h:Math.atan2(tx,tz),r:16,k:k||'ring'}});
};
const _box=(P0,d0,P3,d3,u,y)=>{const q=_air(P0,d0,P3,d3,[[u,y]])[0];return {x:q.x,y:q.y,z:q.z}};
const _dir=(a,b)=>{const l=Math.hypot(b.x-a.x,b.z-a.z);return [(b.x-a.x)/l,(b.z-a.z)/l]};
const _P=(o,x,z)=>({x:o.x+x,z:o.z+z});
// Leg 1 ramp lip (Palm) and Storm touchdown; leg 2 lip (Storm) and Frost touchdown
const _LIP1=_P(PALM,-135,-130),_TD1={x:110,z:1690},_D1=_dir(_LIP1,_TD1);
const _LIP2=_P(STORM,-144,-58.5),_RD2=[-.15,-.989],_TD2=_P(FROST,225,69),_D2T=[-.956,-.293];
// Frost: a spiral road up the mountain. Points every `step` degrees on r(phi), dy from a function (bridge / kicker), width 16.
const _spiral=(f0,f1,step,r0,k,dy)=>{const out=[];for(let f=f0;f<=f1+1e-6;f+=step){const r=r0-k*(f-17),a=f*Math.PI/180;out.push([FROST_X(r,a),FROST_Z(r,a),dy?dy(f):0])}return out};
const FROST_X=(r,a)=>r*Math.cos(a),FROST_Z=(r,a)=>r*Math.sin(a);
// Frost spiral, built once: angles (degrees) + control points for the road before the kicker (A) and after it (B)
const _FA={a:[],p:[]},_FB={a:[],p:[]};
{
  const K=76/450,R0=136,pt=(f,dy)=>{const r=R0-K*(f-17),a=f*Math.PI/180;return [r*Math.cos(a),r*Math.sin(a),dy||0]};
  const bridge=f=>f===212||f===260?2.5:(f===224||f===236||f===248)?6:0;
  // landing strip from the rim, then a constant-radius (R=30) corner onto the spiral. The arc is generated backwards from the spiral entry E (phi=26 deg)
  // so it ends exactly tangent to the spiral; the strip narrows 40 -> 16 m across it.
  const E=pt(26,0),Rr=30,psiE=Math.atan2(-Math.sin(26*Math.PI/180)*1,Math.cos(26*Math.PI/180)),psi0=Math.atan2(-.956,-.293);
  const C=[E[0]+Rr*Math.cos(psiE),E[1]-Rr*Math.sin(psiE)],arc=[];
  for(let k=0;k<=3;k++){const psi=psi0+(psiE-psi0)*k/3;arc.push([C[0]-Rr*Math.cos(psi),C[1]+Rr*Math.sin(psi),0,[24,20,17,16][k]])}
  _FA.a.push(0,0,0,0,0,0);_FA.p.push([225,69,0,40],[190,56,0,40],arc[0],arc[1],arc[2],arc[3]);   // arc[3] IS the spiral entry E (no duplicate point)
  for(let f=32;f<=284;f+=12){_FA.a.push(f);_FA.p.push(pt(f,bridge(f)))}
  for(const [f,dy] of [[296,0],[304,0],[310,1.4],[316,3.5]]){_FA.a.push(f);_FA.p.push(pt(f,dy))}  // kicker approach + lip (the road ends at 316)
  for(let f=332;f<=464;f+=12){const w=f===332?38:f===344?28:f===356?20:16;_FB.a.push(f);const q=pt(f,0);q[3]=w;_FB.p.push(q)}   // landing after the 24 m gap (a wide pad, narrowing), then up to the summit
  _FB.a.push(467);_FB.p.push(pt(467,0));
}
const _ia=(A,f)=>A.a.indexOf(f);
const _air_items1=()=>[_box(_LIP1,_D1,_TD1,_D1,.245,58),_box(_LIP1,_D1,_TD1,_D1,.415,22),_box(_LIP1,_D1,_TD1,_D1,.58,36)];   // high line / low dive / mid
const _air_items2=()=>[_box(_LIP2,_RD2,_TD2,_D2T,.25,56),_box(_LIP2,_RD2,_TD2,_D2T,.43,22),_box(_LIP2,_RD2,_TD2,_D2T,.61,36)];
const TRACKS={
  'skybreak-1':{
    id:'skybreak-1',name:'Skybreak Rally: Palm - Storm - Frost',mode:'p2p',
    roads:[
      // ---- Palm Atoll (ground course, kicker, massive ramp) ----
      {id:'palm-a',o:[PALM.x,PALM.z],w:16,lipV:46,pts:[
        [162,95],[162,40],[162,-20],[158,-62],[145,-90],[125,-100],[105,-93],[85,-100],[65,-107],[45,-100],   // 0-9   start straight, sweep, slalom (wavelength 80 m, amplitude 7 m: radius >= 20 m)
        [32,-100],[16,-100],[-4,-100,4],[-24,-100],                                                          // 10-13 straight, crest (4 m)
        [-40,-100],[-54,-106],[-60,-120],[-54,-134],[-40,-140],[-20,-140],                                   // 14-19 west hairpin (semicircle, centre-line radius 20)
        [0,-140],[25,-140,6],[50,-140,6],[70,-140],                                                          // 20-23 bridge (6 m up)
        [80,-140],[92.7,-145.3],[98,-158],[92.7,-170.7],[80,-176],[70,-176],                                 // 24-29 east hairpin (semicircle, radius 18)
        [48,-176],[34,-176,2.8],                                                                             // 30-31 kicker approach and lip (the road ends here)
      ]},
      {id:'palm-b',o:[PALM.x,PALM.z],w:16,pts:[
        [10,-176],[-30,-176],[-62,-170],[-98.6,-159.7,0,16],                                                 // 0-3   kicker landing, run-up
        [-104.8,-154.6,.5,20],[-111,-149.6,3.2,20],[-117.2,-144.5,7.6,20],[-123.4,-139.5,12,20],[-129.6,-134.4,16.4,20],[-135,-130,20.3,20], // 4-9 the massive ramp (lip at 9)
      ]},
      // ---- Storm Cay: wide landing strip, a loop through the island, the second ramp (lip = last point) ----
      {id:'storm',o:[STORM.x,STORM.z],w:16,shoulder:8,pts:[
        [110,-60,0,40],[63.5,-22.1,0,40],[24.8,9.5,0,24],[-6.3,34.8,0,16],                                    // 0-3   touchdown strip
        [-27,54],[-52,70],[-82,84],[-112,70],[-134,48],[-141,18],[-137,-12],                                  // 4-10  S-bend west across the island, north up the west coast
        [-138.2,-19.9,.5,20],[-139.4,-27.8,3.2,20],[-140.6,-35.7,7.6,20],[-141.8,-43.6,12,20],[-143,-51.5,16.4,20],[-144,-58.5,20.3,20], // 11-16 ramp 2
      ]},
      // ---- Frost Isle: land at the east rim, climb the mountain by a spiral (bridge, hammers, kicker), finish at the summit ----
      {id:'frost-a',o:[FROST.x,FROST.z],w:16,shoulder:6,lipV:44,pts:_FA.p},    // lipV: the speed a kicker wants (the Frost landing curves away, so no flat-out)
      {id:'frost-b',o:[FROST.x,FROST.z],w:16,shoulder:6,pts:_FB.p},
    ],
    gates:[
      {road:'palm-a',p:1,k:'start'},{road:'palm-a',p:4},{road:'palm-a',p:9},{road:'palm-a',p:13},{road:'palm-a',p:16},{road:'palm-a',p:22},{road:'palm-a',p:26},
      {road:'palm-b',p:2},
      {road:'palm-b',p:9,r:22,loose:1.6,mode:'fly',k:'lip'},                                                 // 8: passing the lip switches the craft to flight
      ..._air(_LIP1,_D1,_TD1,_D1,[[.16,42],[.33,52],[.5,44],[.66,32],[.82,20]]),                             // 9-13: five rings
      {road:'storm',p:1,r:30,mode:'car',k:'touchdown'},                                                      // 14
      {road:'storm',p:5},{road:'storm',p:8},{road:'storm',p:10},
      {road:'storm',p:16,r:22,loose:1.6,mode:'fly',k:'lip'},                                                 // 18
      ..._air(_LIP2,_RD2,_TD2,_D2T,[[.16,40],[.34,50],[.52,44],[.7,32],[.87,20]]),                           // 19-23
      {road:'frost-a',p:1,r:30,mode:'car',k:'touchdown'},
      {road:'frost-a',p:_ia(_FA,116)},{road:'frost-a',p:_ia(_FA,188)},{road:'frost-a',p:_ia(_FA,236)},{road:'frost-a',p:_ia(_FA,296)},
      {road:'frost-b',p:_ia(_FB,380)},{road:'frost-b',p:_ia(_FB,440)},
      {road:'frost-b',p:_FB.p.length-1,r:16,finish:true,k:'finish'},
    ],
    pads:[{road:'palm-a',p:5,len:14,w:10},{road:'palm-a',p:20,len:14,w:10},{road:'palm-a',p:30,len:14,w:10},{road:'palm-b',p:3,len:16,w:12},
      {road:'storm',p:3,len:14,w:10},{road:'storm',p:10,len:16,w:12},
      {road:'frost-a',p:_ia(_FA,56),len:14,w:10},{road:'frost-a',p:_ia(_FA,164),len:14,w:10},{road:'frost-a',p:_ia(_FA,176),len:14,w:10},{road:'frost-b',p:_ia(_FB,356),len:14,w:10}],
    hazards:[{k:'hammer',road:'palm-a',p:1.7,amp:6,period:3.2,phase:0,r:1.5},{k:'hammer',road:'palm-a',p:2,amp:6,period:3.2,phase:Math.PI,r:1.5},   // on the 157 m east straight: a clear run-in to read them
      {k:'hammer',road:'frost-a',p:_ia(_FA,92),amp:6,period:3.0,phase:0,r:1.5},{k:'hammer',road:'frost-a',p:_ia(_FA,104),amp:6,period:3.0,phase:Math.PI,r:1.5}],
    // item boxes: open straights where players contest them, a jump approach, bridge edges, and risk/reward lines in the sky (a high line and a low dive between rings)
    items:[
      {road:'palm-a',p:2.6,lat:[-5,0,5]},{road:'palm-a',p:10.6,lat:[0]},{road:'palm-a',p:21.5,lat:[-4.5,4.5]},{road:'palm-b',p:2.5,lat:[0]},
      ..._air_items1(),
      {road:'storm',p:2.3,lat:[-6,0,6]},{road:'storm',p:6.5,lat:[0]},{road:'storm',p:9.5,lat:[-4,4]},
      ..._air_items2(),
      {road:'frost-a',p:1.6,lat:[-8,0,8]},{road:'frost-a',p:_ia(_FA,140),lat:[-5,0,5]},{road:'frost-a',p:_ia(_FA,200),lat:[-4,4]},{road:'frost-a',p:_ia(_FA,272),lat:[0]},{road:'frost-b',p:_ia(_FB,392),lat:[-5,0,5]},
    ],
    landing:[{x:63.5,z:1727.9,r:80},{x:FROST.x+165,z:FROST.z+51,r:90}],
  },
};

// ======================================================================================================================================================
// GRAND CIRCUIT: the classic route, longer, with shortcuts. Built from skybreak-1 so the two never drift apart:
//   - two SHORTCUT roads (alt roads, dirt-coloured, narrower): the Cay Cut across Storm Cay (skips the S-bend) and the Summit Dash over the shoulder of Frost
//     (skips the bridge). Each rejoins the main road at its own control point; the main route's gates inside the fork are `opt` (skipped by taking the shortcut).
//   - bonus rings in the sky (a high line and a low dive on every flight): off the gate chain, fly through for a boost, once each.
//   - the climb does not end at the Frost summit any more: the spiral keeps winding up to the top, a launch ramp points back across the sea, and a third flight
//     (~1.6 km, the longest) glides home to Palm Atoll's south beach, where a wide strip carries you to the finish.
// ======================================================================================================================================================
(()=>{
  const B=TRACKS['skybreak-1'],K=76/450;
  const fpt=(f,dy,w)=>{const r=136-K*(f-17),a=f*Math.PI/180,o=[r*Math.cos(a),r*Math.sin(a),dy||0];if(w)o.push(w);return o};
  const roads=B.roads.map(r=>r.id==='frost-b'?Object.assign({},r):r);
  // ---- Frost: the spiral carries on to the summit (3 more quarter turns), then a straight run and a launch ramp aimed at Palm ----
  const fb=roads.find(r=>r.id==='frost-b'),baseN=fb.pts.length,ext=[];
  const extA=[];for(let f=479;f<=647;f+=12){extA.push(f);ext.push(fpt(f,0))}
  {const e=fpt(647,0),t=[.956,.292];   // spiral heading at the top of the climb (east-north-east: toward Palm)
    for(let k=1;k<=4;k++)ext.push([e[0]+t[0]*k*12,e[1]+t[1]*k*12,0,k>=3?20:16]);
    const b=ext[ext.length-1];for(let k=1;k<=6;k++){const dd=[.5,3.2,7.6,12,16.4,20.3][k-1];ext.push([b[0]+t[0]*k*7,b[1]+t[1]*k*7,dd,20])}}
  fb.pts=fb.pts.concat(ext);
  const FLIP=ext[ext.length-1],FLIPW={x:FROST.x+FLIP[0],z:FROST.z+FLIP[1]},_t=[.956,.292];
  // ---- Palm south strip (the finale lands here, heading east) ----
  roads.push({id:'palm-c',o:[PALM.x,PALM.z],w:16,pts:[[-150,105,0,40],[-112,105,0,40],[-62,105,0,28],[0,105,0,20],[58,105,0,16],[108,105,0,16]]});
  // ---- the Cay Cut: a dirt shortcut across the island's hump, leaving the main road at control point 3 and rejoining it at 10 ----
  roads.push({id:'storm-cut',o:[STORM.x,STORM.z],w:11,alt:true,shoulder:6,join:{road:'storm',p:10},pts:[[-6.3,34.8,0,11],[-18,34],[-42,26],[-72,16],[-100,9],[-122,5],[-133,-2],[-137,-12]]});
  const gates=B.gates.slice(0,B.gates.length-1).map(g=>Object.assign({},g));            // everything but the old finish at the summit
  const gi=(road,p,extra)=>gates.findIndex(g=>g.road===road&&g.p===p);
  for(const g of gates){if(g.road==='storm'&&(g.p===5||g.p===8))g.opt=true}
  // the new Frost gates (the extra spiral), the launch lip, three flights of rings, the Palm touchdown and the finish
  const BF=baseN;[491,551,611].forEach(f=>gates.push({road:'frost-b',p:BF+extA.indexOf(f)}));
  const LIP=BF+ext.length-1;gates.push({road:'frost-b',p:LIP,r:22,loose:1.6,mode:'fly',k:'lip'});
  const TD3={x:PALM.x-128,z:PALM.z+105},D3=[1,0],_L3=FLIPW,_RD3=_t;
  const ringsU=[[.1,80],[.22,74],[.34,66],[.46,57],[.58,47],[.7,36],[.82,26],[.92,17]];
  const rings3=_air(_L3,_RD3,TD3,D3,ringsU);rings3.forEach(q=>{q.r=18});gates.push(...rings3);
  gates.push({road:'palm-c',p:0.5,r:34,mode:'car',k:'touchdown'},{road:'palm-c',p:3},{road:'palm-c',p:5,r:16,finish:true,k:'finish'});
  // bonus rings: high line and low dive on every flight
  const bonus=[];
  for(const [L,d0,T3,d3,hi,lo] of [[_LIP1,_D1,_TD1,_D1,[.36,84],[.64,12]],[_LIP2,_RD2,_TD2,_D2T,[.38,82],[.66,12]],[_L3,_RD3,TD3,D3,[.3,104],[.64,14]]]){
    const q=_air(L,d0,T3,d3,[hi,lo]);q[0].name='HIGH LINE';q[1].name='LOW DIVE';for(const b of q)bonus.push({x:b.x,y:b.y,z:b.z,h:b.h,r:13,secs:2.4,name:b.name})}
  const pads=B.pads.concat([{road:'storm-cut',p:3,len:14,w:7},{road:'storm-cut',p:6,len:14,w:7},{road:'palm-c',p:3,len:16,w:10}]);
  const items=B.items.concat([{road:'storm-cut',p:3.5,lat:[-2,2]},{road:'palm-c',p:2.5,lat:[-8,0,8]},
    {x:rings3[3].x,y:rings3[3].y+22,z:rings3[3].z},{x:rings3[5].x,y:rings3[5].y-14,z:rings3[5].z}]);
  TRACKS['skybreak-2']={id:'skybreak-2',name:'Skybreak Grand Circuit: Palm - Storm - Frost - Palm',mode:'p2p',roads,gates,pads,hazards:B.hazards,items,bonus,
    forks:[{road:'storm',at:3,alt:'storm-cut',name:'CAY CUT'}],
    landing:B.landing.concat([{x:PALM.x-60,z:PALM.z+105,r:110}])};
})();
