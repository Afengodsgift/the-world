// SpaceMap: where things are out in space, in ONE place (metres from the world's centre; y is altitude), plus the tiny 3D value noise the procedural bits share.
// The belt, the gate and the planet all read this, so they cannot disagree. Nothing here draws anything.
//   satellite  (8, 112, -11) km     the first thing you find: straight up from the town, a little to one side
//   belt       (-190, 140, 230) km  an asteroid field ~5 km across, ~300 km from the satellite, toward the second world; a clearing at its middle holds the gate
//   planet     (-520, 300, 610) km  a second world, radius 90 km, ~856 km from home (inside the 1,200 km limit); seen from the edge of space as a big disc
// `axis` is the unit vector from the belt to the planet: the gate faces down it and its beam of light follows it.
const SpaceMap=(()=>{
  const belt={pos:[-190000,140000,230000],r:2600,clear:440},planet={pos:[-520000,300000,610000],r:90000};
  const v=[planet.pos[0]-belt.pos[0],planet.pos[1]-belt.pos[1],planet.pos[2]-belt.pos[2]],l=Math.hypot(v[0],v[1],v[2]);
  const axis=[v[0]/l,v[1]/l,v[2]/l];
  // integer-lattice hash -> 0..1, trilinear smooth value noise, and a few octaves of it
  function h3(x,y,z,s){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1274126177)^Math.imul(s|0,2246822519);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967295}
  const f3=t=>t*t*(3-2*t);
  function vn3(x,y,z,s){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),u=f3(x-xi),w=f3(y-yi),q=f3(z-zi),a=(i,j,k)=>h3(xi+i,yi+j,zi+k,s);
    const l=(p,r,t)=>p+(r-p)*t;
    return l(l(l(a(0,0,0),a(1,0,0),u),l(a(0,1,0),a(1,1,0),u),w),l(l(a(0,0,1),a(1,0,1),u),l(a(0,1,1),a(1,1,1),u),w),q)}
  function fbm3(x,y,z,s,oct){let a=.5,f=1,t=0,n=0;for(let i=0;i<(oct||4);i++){t+=a*vn3(x*f,y*f,z*f,s+i*17);n+=a;a*=.5;f*=2.03}return t/n}
  const lcg=seed=>{let s=(seed>>>0)%2147483647||1;return()=>(s=s*16807%2147483647)/2147483647};
  return {belt,planet,axis,h3,vn3,fbm3,lcg,sat:[8000,112000,-11000]};
})();
if(typeof module!=='undefined')module.exports=SpaceMap;
