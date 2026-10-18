// Skybreak Rally routes. Static data (no THREE/DOM), consumed by race/Track.js. All numbers are metres, world coordinates unless a road has `o` (origin),
// in which case its points are local to that island's centre. A control point is [x, z, dy?, width?]: dy = height above the terrain (bridges, ramps),
// width overrides the road width at that point. Gates / pads / hazards reference a road by id and a control-point index `p`.
//
// Leg 1: PALM ATOLL -> STORM CAY. Palm Atoll is flat (pk 0, shore at ~212 m from its centre, the foot-race loop `KT` fills the middle), so the
// road keeps to the ring between the loop and the beach: east-side start grid, sweep into a slalom, two swinging hammers, a crest, a 180 hairpin,
// a bridge, a second hairpin, a kicker jump (a real gap) and then the massive launch ramp pointing at Storm Cay (bearing from the lip to the
// touchdown strip is exactly the ramp's heading). The sky section is five rings on a rising-then-gliding arc, ending in a wide landing strip.
const PALM={x:760,z:1400},STORM={x:0,z:1750};
const _LIP={x:PALM.x-135,z:PALM.z-130},_TOUCH={x:110,z:1690};
const _ring=(u,y,k)=>({x:_LIP.x+(_TOUCH.x-_LIP.x)*u,y,z:_LIP.z+(_TOUCH.z-_LIP.z)*u,h:Math.atan2(_TOUCH.x-_LIP.x,_TOUCH.z-_LIP.z),r:16,k});
const TRACKS={
  'palm-storm':{
    id:'palm-storm',name:'Palm to Storm (leg 1)',mode:'p2p',
    roads:[
      {id:'palm-a',o:[PALM.x,PALM.z],w:16,pts:[
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
      {id:'storm',o:[0,0],w:40,shoulder:8,pts:[[110,1690,0,40],[63.5,1727.9,0,40],[24.8,1759.5,0,24],[-6.3,1784.8,0,16]]},
    ],
    gates:[
      {road:'palm-a',p:1,k:'start'},{road:'palm-a',p:4},{road:'palm-a',p:9},{road:'palm-a',p:13},{road:'palm-a',p:16},{road:'palm-a',p:22},{road:'palm-a',p:26},
      {road:'palm-b',p:2},
      {road:'palm-b',p:9,r:22,loose:1.6,mode:'fly',k:'lip'},                                                 // passing the lip switches the craft to flight
      _ring(.16,42),_ring(.33,52),_ring(.5,44),_ring(.66,32),_ring(.82,20),
      {road:'storm',p:1,r:30,mode:'car',k:'touchdown'},
      {road:'storm',p:3,r:16,finish:true,k:'finish'},
    ],
    pads:[{road:'palm-a',p:5,len:14,w:10},{road:'palm-a',p:20,len:14,w:10},{road:'palm-a',p:30,len:14,w:10},{road:'palm-b',p:3,len:16,w:12}],
    hazards:[{k:'hammer',road:'palm-a',p:1.7,amp:6,period:3.2,phase:0,r:1.5},{k:'hammer',road:'palm-a',p:2,amp:6,period:3.2,phase:Math.PI,r:1.5}],   // on the 157 m east straight: a clear run-in to read them
    landing:[{x:63.5,z:1727.9,r:80}],
    landingTarget:{x:_TOUCH.x,z:_TOUCH.z},
  },
};
