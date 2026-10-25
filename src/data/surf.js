// SURF: the named surf spots (pure data, no THREE/DOM). Each is a swell train that only exists at its spot (see Ocean.setBreaks): x,z = centre in the water ~55 m off the beach,
// dx,dz = unit direction toward the beach, A = amplitude (m; trough-to-crest is a bit over 2x, more as the wave stands up toward the beach), L = wavelength (m), peel = crest-line angle
// (rad; sign = which way the wave peels, so "left" / "right"), Lh/Wh = half length / half width of the break, kind = how it breaks. Found by scanning H(): every centre is in 3-4 m of water and
// the bottom shoals to the sand over ~100 m, clear of every other island. tests/surf.sim.js re-checks all of that against the real terrain.
const SurfData=(()=>{
  const SPOTS=[
    {id:'shell',n:'Shell Break',x:212.9,z:170.5,dx:-.866,dz:-.5,A:1.7,L:34,peel:.42,seed:.3,lvl:1,tag:'Friendly rollers off the town beach'},
    {id:'palm',n:'Palm Point',x:536.3,z:1587.7,dx:.766,dz:-.6428,A:1.9,L:36,peel:-.4,seed:1.7,lvl:1,tag:'Long, easy rights'},
    {id:'sunken',n:'Sunken Lines',x:910,z:-420,dx:1,dz:0,A:2,L:36,peel:.4,seed:2.9,lvl:2,tag:'Clean lines, fast walls'},
    {id:'frost',n:'Frost Reef',x:-1347.3,z:1385.2,dx:.9848,dz:.1736,A:2.1,L:38,peel:-.45,seed:4.1,lvl:2,tag:'Cold, glassy, punchy'},
    {id:'ember',n:'Ember Barrels',x:-1045.8,z:-1054.5,dx:-.866,dz:.5,A:2.3,L:40,peel:.35,seed:5.2,lvl:3,tag:'Steep and hollow under the volcano'},
    {id:'bone',n:'Boneyard Bowl',x:1861.3,z:-957.7,dx:-.6428,dz:-.766,A:2.5,L:42,peel:.3,seed:.9,lvl:3,tag:'A heavy bowl - bring your nerve'},
    {id:'far',n:'Far Reef Pipeline',x:1892.3,z:1377,dx:.1736,dz:-.9848,A:2.8,L:46,peel:-.35,seed:3.6,lvl:4,tag:'The big one'}];
  for(const s of SPOTS){s.Lh=105;s.Wh=95;s.r=Math.max(s.Lh,s.Wh)+25}
  return{SPOTS,byId:id=>SPOTS.find(s=>s.id===id),near:(x,z,pad)=>{let b=null,bd=1e9;for(const s of SPOTS){const d=Math.hypot(x-s.x,z-s.z);if(d<s.r+(pad||0)&&d<bd){bd=d;b=s}}return b}}})();
if(typeof module!=='undefined')module.exports=SurfData;
