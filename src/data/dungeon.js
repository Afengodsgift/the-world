// WARDEN: The Ashen Catacombs - the layout of the Warden Isles' dungeon. Pure (no THREE/DOM; tests run it in a vm).
// A dungeon is a CHAIN OF SEALED ROOMS joined by corridors, built on a flat terrace at the east rim of the isle. Every room is an ordinary Warden fight site (circular arena, fog gate, foes) so the
// whole combat / co-op / progression stack already works in it; this file only says where the rooms are and generates the walls, doors, floors, torches, chests and the terrain pads.
// Local frame: u = along the route (the entrance is at u=0 in the south, the route runs north = -z), v = lateral (east). Isle-local metres: x = ox + v, z = oz - u.
//   gate > corridor > Guardroom (camp, soldiers) > door > Ossuary (2 Arena Shades) > door > Gaoler's Hall (miniboss) > door > Hollow Court (Ganfaul + Artorias, the dungeon's boss) > door > Ash Treasury (chest, lever out)
//   side branch: bars off the corridor after the Ossuary open to the Vault (a Vault Warden guards a chest).
const DUNGEON=(()=>{
  const D={id:'catacombs',n:'The Ashen Catacombs',ox:150,oz:112,y:2.5,K:1.4,HW:1.6,WALLW:2.95,EDGE:3.0,BAND:2.8,WALLH:4.3,SOLID_R:.8,SOLID_STEP:1.2};
  const S1=[{t:'soldier',dx:-3,dz:-1},{t:'soldier',dx:3,dz:-2},{t:'soldier',dx:0,dz:-5}];
  // rooms. R = arena radius (the fight circle). mouths = directions (local du,dv) of the corridor openings. need = a door at the +u mouth opens when this room is cleared.
  const ROOMS=[
    {id:'dg_guard',n:'The Guardroom',u:27,v:0,R:11,fog:false,boss:false,mouths:[[-1,0],[1,0]],foes:S1},
    {id:'dg_ossuary',n:'The Ossuary',u:66,v:0,R:12,fog:true,boss:false,mouths:[[-1,0],[1,0]],foes:[{t:'shade',dx:-3,dz:-3},{t:'shade',dx:3,dz:-3,late:true}]},
    {id:'dg_vault',n:'The Vault',u:88,v:-33,R:9,fog:true,boss:false,mouths:[[0,1]],foes:[{t:'vaultwarden',dx:0,dz:-4}]},
    {id:'dg_gaol',n:"The Gaoler's Hall",u:111,v:0,R:13,fog:true,boss:false,mini:true,mouths:[[-1,0],[1,0]],foes:[{t:'gaoler',dx:0,dz:-6}]},
    {id:'dg_court',n:'The Hollow Court',u:158,v:0,R:17,fog:true,boss:true,mouths:[[-1,0],[1,0]],foes:[{t:'ganfauld',dx:-6,dz:-7},{t:'darkknightd',dx:6,dz:-7,late:true}]},
    {id:'dg_treasury',n:'The Ash Treasury',u:200,v:0,R:9,safe:true,mouths:[[-1,0]]}];
  const room=id=>ROOMS.find(r=>r.id===id);
  // corridors: [from room, to room] along the line between their centres (or from the gate), with optional wall gaps (junction for the vault branch) given in metres along the corridor
  const COR=[{id:'c0',a:'gate',b:'dg_guard'},{id:'c1',a:'dg_guard',b:'dg_ossuary'},{id:'c2',a:'dg_ossuary',b:'dg_gaol',gapsR:[[5.5,8.9]]},{id:'cv',a:'junction',b:'dg_vault'},{id:'c3',a:'dg_gaol',b:'dg_court'},{id:'c4',a:'dg_court',b:'dg_treasury'}];
  // doors open when their room is cleared (the vault bars with the Ossuary). u,v are filled in by build().
  const DOORS=[{id:'dg_d1',kind:'door',cor:'c1',at:'a',need:'dg_guard'},{id:'dg_d2',kind:'door',cor:'c2',at:'a',need:'dg_ossuary'},{id:'dg_dv',kind:'bars',cor:'cv',at:'a',need:'dg_ossuary'},{id:'dg_d3',kind:'door',cor:'c3',at:'a',need:'dg_gaol'},{id:'dg_d4',kind:'door',cor:'c4',at:'a',need:'dg_court'}];
  const CHESTS=[{id:'dg_chest_vault',u:88,v:-38.5,ang:Math.PI/2,need:'dg_vault',kind:'vault'},{id:'dg_chest_main',u:205.5,v:0,ang:0,need:'dg_court',kind:'main'}];
  const LEVERS=[{id:'dg_lever_exit',u:200,v:6.4,need:'dg_court',act:'exit',n:'Pull the lever (leave the catacombs)'}];
  const W=(u,v)=>({x:D.ox+v,z:D.oz-u});
  const rc=r=>r.R+D.BAND;                 // polygon circumradius of a room's wall
  const inr=r=>rc(r)*Math.cos(Math.PI/polyN(r));
  const polyN=r=>Math.max(8,Math.round(2*Math.PI*rc(r)/D.EDGE));
  let cache=null;
  function build(){
    if(cache)return cache;
    const walls=[],floors={discs:[],strips:[]},solids=[],doors=[],torches=[],props=[],pads=[],sites=[],chunks={};
    const ry=(dx,dz)=>Math.atan2(-dz,dx);
    const addWall=(chunk,x1,z1,x2,z2,extra)=>{const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);if(len<.2)return;const w={chunk,x:(x1+x2)/2,z:(z1+z2)/2,len:len+.25,ang:ry(dx,dz),k:walls.length};walls.push(w);
      const n=Math.max(1,Math.round(len/D.SOLID_STEP));for(let i=0;i<=n;i++){const t=i/n;solids.push({x:WRDX(x1+dx*t),z:WRDZ(z1+dz*t),r:D.SOLID_R,dg:1})}};
    const WRDX=x=>x,WRDZ=z=>z;
    // ---- rooms ----
    for(const r of ROOMS){const c=W(r.u,r.v),R=rc(r),n=polyN(r),ch='room:'+r.id;r.cx=c.x;r.cz=c.z;r.Rc=R;r.n_=n;
      floors.discs.push({x:c.x,z:c.z,r:R-.15,chunk:ch});
      const mouths=(r.mouths||[]).map(m=>({x:m[1],z:-m[0]}));   // local (du,dv) -> world direction (dx=dv, dz=-du)
      const V=[];for(let i=0;i<n;i++){const a=(i+.5)/n*Math.PI*2;V.push({x:c.x+Math.sin(a)*R,z:c.z+Math.cos(a)*R})}
      for(let i=0;i<n;i++){const A=V[i],B=V[(i+1)%n],mx=(A.x+B.x)/2-c.x,mz=(A.z+B.z)/2-c.z;let gap=false;
        for(const m of mouths){const dot=mx*m.x+mz*m.z;if(dot<=0)continue;const perp=Math.abs(mx*m.z-mz*m.x);if(perp<D.HW+.5+D.EDGE/2)gap=true}
        if(!gap)addWall(ch,A.x,A.z,B.x,B.z)}
      // sites: the fight circle (the engine's own site record)
      if(!r.safe)sites.push({id:r.id,n:r.n,x:c.x,z:c.z,R:r.R,y:D.y,fog:!!r.fog,boss:r.boss===true,mini:!!r.mini,dg:true,foes:r.foes});
      else sites.push({id:r.id,n:r.n,x:c.x,z:c.z,R:r.R,y:D.y,fog:false,safe:true,dg:true,foes:[]})}
    // ---- corridors ----
    const endpoint=(id,toward)=>{ // where a corridor meets room/gate `id`, heading toward point `toward`
      if(id==='gate')return W(-1.5,0);if(id==='junction')return W(88,0);
      const r=room(id),c=W(r.u,r.v),dx=toward.x-c.x,dz=toward.z-c.z,L=Math.hypot(dx,dz);return{x:c.x+dx/L*(inr(r)-.15),z:c.z+dz/L*(inr(r)-.15)}};
    const centre=id=>id==='gate'?W(-1.5,0):id==='junction'?W(88,0):W(room(id).u,room(id).v);
    for(const cr of COR){const ca=centre(cr.a),cb=centre(cr.b),pa=endpoint(cr.a,cb),pb=endpoint(cr.b,ca);cr.p0=pa;cr.p1=pb;
      const dx=pb.x-pa.x,dz=pb.z-pa.z,L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L,nx=-uz,nz=ux;cr.L=L;cr.ux=ux;cr.uz=uz;const ch='cor:'+cr.id;
      floors.strips.push({x:(pa.x+pb.x)/2,z:(pa.z+pb.z)/2,len:L+.6,w:D.HW*2+.5,ang:ry(dx,dz),chunk:ch});
      for(const side of[1,-1]){const gaps=(side===1?cr.gapsL:cr.gapsR)||[];let s=0;const cuts=gaps.slice().sort((a,b)=>a[0]-b[0]);const segs=[];for(const g of cuts){if(g[0]>s)segs.push([s,g[0]]);s=g[1]}if(s<L)segs.push([s,L]);
        for(const [s0,s1] of segs){const n=Math.max(1,Math.ceil((s1-s0)/D.WALLW));for(let i=0;i<n;i++){const a=s0+(s1-s0)*i/n,b=s0+(s1-s0)*(i+1)/n;
          addWall(ch,pa.x+ux*a+nx*D.HW*side,pa.z+uz*a+nz*D.HW*side,pa.x+ux*b+nx*D.HW*side,pa.z+uz*b+nz*D.HW*side)}}}
      for(let t=2.5;t<L;t+=5){pads.push({x:pa.x+ux*t,z:pa.z+uz*t,R:5,y:D.y})}
      // torches along the corridor, alternating sides, every 9 m
      for(let t=4,k=0;t<L-2;t+=9,k++){const side=k%2?1:-1;torches.push({x:pa.x+ux*t+nx*(D.HW-.35)*side,z:pa.z+uz*t+nz*(D.HW-.35)*side,ang:ry(-nx*side,-nz*side),chunk:ch})}}
    for(const r of ROOMS){pads.push({x:r.cx,z:r.cz,R:r.Rc+1,y:D.y})}
    // ---- doors ----
    for(const d of DOORS){const cr=COR.find(c=>c.id===d.cor);const t=d.at==='a'?(d.cor==='cv'?4:3.2):cr.L-3.2;d.x=cr.p0.x+cr.ux*t;d.z=cr.p0.z+cr.uz*t;d.ang=ry(cr.ux,cr.uz)+Math.PI/2;d.w=D.HW*2;
      const nn=3;for(let i=0;i<nn;i++){const o=(i/(nn-1)-.5)*(D.HW*2-1);const s={x:d.x-cr.uz*o*-1,z:d.z+cr.ux*o*-1,r:.9,door:d.id};s.x=d.x+(-cr.uz)*o;s.z=d.z+cr.ux*o;d.solids=d.solids||[];d.solids.push(s)}
      doors.push(d)}
    // ---- chests, levers, torches in rooms, columns, barrels ----
    for(const c of CHESTS){const p=W(c.u,c.v);c.x=p.x;c.z=p.z}
    for(const l of LEVERS){const p=W(l.u,l.v);l.x=p.x;l.z=p.z}
    for(const r of ROOMS){const n=r.n_,R=r.Rc;let k=0;
      for(let i=0;i<n;i+=3){const a=(i+.5)/n*Math.PI*2+Math.PI/n,x=r.cx+Math.sin(a)*(R-.75),z=r.cz+Math.cos(a)*(R-.75);
        const mouths=(r.mouths||[]).map(m=>({x:m[1],z:-m[0]}));let near=false;for(const m of mouths){const mx=x-r.cx,mz=z-r.cz;if(mx*m.x+mz*m.z>0&&Math.abs(mx*m.z-mz*m.x)<D.HW+1.8)near=true}
        if(!near){torches.push({x,z,ang:ry(-Math.sin(a),-Math.cos(a)),chunk:'room:'+r.id});k++}}
      if(r.id==='dg_court'||r.id==='dg_gaol'||r.id==='dg_ossuary'||r.id==='dg_treasury'){const m=r.id==='dg_court'?8:r.id==='dg_treasury'?4:6;
        for(let i=0;i<m;i++){const a=(i+.5)/m*Math.PI*2+.4,x=r.cx+Math.sin(a)*(r.R+1.25),z=r.cz+Math.cos(a)*(r.R+1.25);
          let skip=false;for(const mm of(r.mouths||[])){const dx=mm[1],dz=-mm[0],px=x-r.cx,pz=z-r.cz;if(px*dx+pz*dz>0&&Math.abs(px*dz-pz*dx)<D.HW+1.4)skip=true}
          if(!skip){props.push({p:'column',x,z,s:.62,ang:a,chunk:'room:'+r.id});solids.push({x,z,r:.7,dg:1})}}}
      if(r.id==='dg_guard'||r.id==='dg_vault'){const m=5;for(let i=0;i<m;i++){const a=(i+.5)/m*Math.PI*2+1.1,x=r.cx+Math.sin(a)*(r.R+1.3),z=r.cz+Math.cos(a)*(r.R+1.3);
          let skip=false;for(const mm of(r.mouths||[])){const dx=mm[1],dz=-mm[0],px=x-r.cx,pz=z-r.cz;if(px*dx+pz*dz>0&&Math.abs(px*dz-pz*dx)<D.HW+1.4)skip=true}
          if(!skip)props.push({p:i%2?'barrel':'bookcase',x,z,s:i%2?1.1:.55,ang:a+Math.PI,chunk:'room:'+r.id})}}}
    // the entrance: a great arch and two braziers, so the way in can be seen from the isle
    const g=W(0,0);props.push({p:'arch',x:g.x,z:g.z,s:1.35,ang:0,chunk:'gate'});
    const lm={id:'dg_gate',x:g.x,z:g.z};
    // pick a variant per wall piece (deterministic)
    walls.forEach((w,i)=>{w.p=(i*7+(i>>2))%10<7?'wall_b':'wall_c'});
    cache={D,walls,floors,solids,doors,torches,props,pads,sites,rooms:ROOMS,corridors:COR,chests:CHESTS,levers:LEVERS,gate:lm};return cache}
  return{D,ROOMS,COR,DOORS,CHESTS,LEVERS,build,W,room,rc,inr,polyN,reset:()=>{cache=null;for(const c of COR){delete c.p0;delete c.p1}}}})();
if(typeof module!=='undefined')module.exports=DUNGEON;
