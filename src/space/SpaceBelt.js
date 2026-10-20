// SpaceBelt: an asteroid field, ~5 km across, between the satellite and the second world (positions in SpaceMap). Hundreds of tons of slowly tumbling rock you can
// fly between: ~120 low-poly rocks in four shapes drawn as four InstancedMeshes (4 draw calls, ~10k triangles), each a different size and slightly flattened, in a thin
// disc with a round clearing at its middle (that is where the gate stands) and a clear lane along the gate's axis toward the planet.
// The rocks are solid: collide(S) keeps you outside each one (a soft slide, no damage, nothing to learn). Everything is deterministic (seeded), so both phones
// see the same field without sending a byte. It is found like the satellite (get close to its edge and look at it); its beacon blinks until then.
// Only built geometry and per-frame matrices: no allocation in update. Globals used: THREE, S, SpaceObjects, SpaceMap.
const SpaceBelt=(()=>{
  const M=SpaceMap,POS=M.belt.pos,R=M.belt.r,CLEAR=M.belt.clear,AX=M.axis,N=118,PAD=3.5,THICK=420;
  let rocks=null,meshes=[];
  const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_ax=new THREE.Vector3();
  // one rock shape: a subdivided icosahedron pushed in and out by smooth noise (flat shaded: faceted like real rubble), same noise for shared vertices so there are no cracks
  function shape(seed,stretch){
    const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).normalize();
      const n=M.fbm3(v.x*1.5+seed*3.1,v.y*1.5+seed*1.7,v.z*1.5+seed*.9,seed,3),k=.74+.62*n;
      p.setXYZ(i,v.x*k*stretch[0],v.y*k*stretch[1],v.z*k*stretch[2])}
    g.computeVertexNormals();return g}
  function layout(){
    const rnd=M.lcg(4711),list=[];let guard=0;
    while(list.length<N&&guard++<6000){
      const big=list.length<4;                                          // a few huge ones give the field scale and a skyline
      const size=big?170+rnd()*130:12+Math.pow(rnd(),2.6)*112,a=rnd()*Math.PI*2,rad=R*Math.sqrt(rnd()),y=(rnd()-.5)*2*THICK*(1-rad/R*.55);
      const x=Math.cos(a)*rad,z=Math.sin(a)*rad;
      if(Math.hypot(x,z)<CLEAR+size+60&&Math.abs(y)<CLEAR+size)continue;                // the clearing around the gate
      const t=x*AX[0]+y*AX[1]+z*AX[2];if(t>0){const px=x-AX[0]*t,py=y-AX[1]*t,pz=z-AX[2]*t;if(Math.hypot(px,py,pz)<size*1.15+90)continue}   // a lane down the gate's axis
      let hit=false;for(const o of list){const d=Math.hypot(o.x-x,o.y-y,o.z-z);if(d<(o.r+size)*1.1+4){hit=true;break}}if(hit)continue;
      const sx=size*(.8+rnd()*.4),sy=size*(.55+rnd()*.45),sz=size*(.8+rnd()*.4);
      let ax=rnd()-.5,ay=rnd()-.5,az=rnd()-.5;const al=Math.hypot(ax,ay,az)||1;
      list.push({x,y,z,sx,sy,sz,r:Math.max(sx,sy,sz)*.94,ax:ax/al,ay:ay/al,az:az/al,w:(rnd()-.5)*(big?.012:.05),ph:rnd()*6.28,v:list.length%4,hue:rnd(),lum:rnd()})}
    return list}
  function build(o){
    rocks=layout();const g=new THREE.Group();
    const geo=[shape(1,[1,1,1]),shape(2,[1.25,.8,1]),shape(3,[1,.7,1.3]),shape(4,[1.1,1,.85])],cnt=[0,0,0,0];
    for(const r of rocks)cnt[r.v]++;
    const mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:.04,flatShading:true}),c=new THREE.Color();meshes=[];
    for(let k=0;k<4;k++){const im=new THREE.InstancedMesh(geo[k],mat,Math.max(1,cnt[k]));im.frustumCulled=false;im.userData.n=0;g.add(im);meshes.push(im)}
    for(const r of rocks){const im=meshes[r.v];r.i=im.userData.n++;c.setHSL(.06+.05*r.hue,.07+.12*r.hue,.30+.20*r.lum);im.setColorAt(r.i,c)}
    for(const im of meshes)if(im.instanceColor)im.instanceColor.needsUpdate=true;
    tumble(0);return g}
  function tumble(t){
    for(const r of rocks){_ax.set(r.ax,r.ay,r.az);_q.setFromAxisAngle(_ax,r.ph+t*r.w);_p.set(r.x,r.y,r.z);_s.set(r.sx,r.sy,r.sz);_m.compose(_p,_q,_s);meshes[r.v].setMatrixAt(r.i,_m)}
    for(const im of meshes)im.instanceMatrix.needsUpdate=true}
  // keep a point (the player) outside every rock: pushed straight out along the normal, so you slide around a rock instead of sticking to it
  function collide(P,pad){
    if(!rocks)return 0;pad=pad===undefined?PAD:pad;let n=0;
    const bx=P.x-POS[0],by=P.y-POS[1],bz=P.z-POS[2];
    if(bx*bx+by*by+bz*bz>(R+400)*(R+400))return 0;
    for(const r of rocks){const dx=bx-r.x,dy=by-r.y,dz=bz-r.z,rad=r.r+pad,d2=dx*dx+dy*dy+dz*dz;
      if(d2<rad*rad){const d=Math.sqrt(d2)||1e-6,push=(rad-d)/d;P.x+=dx*push;P.y+=dy*push;P.z+=dz*push;n++}}
    return n}
  function update(o,dt,t){tumble(t);collide(S)}
  SpaceObjects.register({id:'belt',name:'Asteroid field',pos:POS,r:R,icon:'☄️',build,update,
    found:{text:'Found an asteroid field far out, and something catching the light in the middle of it',banner:'Rock drifting in the dark. Something in the middle catches the light.'}});
  return {POS,R,CLEAR,N,layout,collide,get rocks(){return rocks},get meshes(){return meshes}};
})();
if(typeof module!=='undefined')module.exports=SpaceBelt;
