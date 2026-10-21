// WestKit: loads the converted Wild West pieces (assets/west/*.glb + manifest.json, tools/convert_west.mjs) and MERGES a building's pieces into one vertex-coloured mesh
// (a whole building = one draw call). Globals: THREE (+GLTFLoader).
//   WestKit.manifest()                      -> Promise<manifest>   (also what WestTown.plan needs for window / door openings)
//   WestKit.mesh(pieces, opt)               -> Promise<THREE.Mesh>  pieces = WestTown plan pieces ({n,x,y,z,ry,s} or {box:{x0,x1,z0,z1,y0,y1},col})
//   WestKit.place(name,x,y,z,ry,s)          -> Promise<THREE.Group>  one loose piece (props that move or are interactive)
const WestKit=(()=>{
  const BASE='assets/west/',geo=new Map();let man=null,manP=null;
  function manifest(){return manP||(manP=fetch(BASE+'manifest.json').then(r=>r.json()).then(m=>{man=m;return m}))}
  // a piece as plain arrays (positions, normals, colours), in metres, original pivot
  function piece(name){
    if(geo.has(name))return geo.get(name);
    const p=new Promise((res,rej)=>new THREE.GLTFLoader().load(BASE+name+'.glb',g=>{
      const pos=[],nrm=[],col=[],idx=[];let base=0;g.scene.updateMatrixWorld(true);
      g.scene.traverse(o=>{if(!o.isMesh)return;const gm=o.geometry,P=gm.attributes.position,N=gm.attributes.normal,c=o.material.color||{r:.5,g:.5,b:.5};
        for(let i=0;i<P.count;i++){pos.push(P.getX(i),P.getY(i),P.getZ(i));nrm.push(N?N.getX(i):0,N?N.getY(i):1,N?N.getZ(i):0);col.push(c.r,c.g,c.b)}
        if(gm.index)for(let i=0;i<gm.index.count;i++)idx.push(gm.index.getX(i)+base);else for(let i=0;i<P.count;i++)idx.push(i+base);base+=P.count});
      res({pos,nrm,col,idx})},undefined,rej));
    geo.set(name,p);return p}
  const BOX=(x0,x1,y0,y1,z0,z1)=>{ // 24 vertices
    const P=[],N=[],I=[];const f=(n,a,b,c,d)=>{const o=P.length/3;P.push(...a,...b,...c,...d);for(let k=0;k<4;k++)N.push(...n);I.push(o,o+1,o+2,o,o+2,o+3)};
    f([0,1,0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]);f([0,-1,0],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
    f([1,0,0],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]);f([-1,0,0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
    f([0,0,1],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);f([0,0,-1],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]);
    return {pos:P,nrm:N,idx:I}};
  const hex=h=>{const c=new THREE.Color(h);return [c.r,c.g,c.b]};
  async function mesh(pieces,opt){
    opt=opt||{};const names=[...new Set(pieces.filter(p=>p.n).map(p=>p.n))];const G={};await Promise.all(names.map(async n=>{try{G[n]=await piece(n)}catch(e){G[n]=null}}));
    const pos=[],nrm=[],col=[],idx=[],tint=opt.tint||[1,1,1];let base=0;
    const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),v=new THREE.Vector3(),sc=new THREE.Vector3(),nm=new THREE.Matrix3(),n3=new THREE.Vector3();
    for(const p of pieces){
      if(p.box){const b=p.box,B=BOX(b.x0,b.x1,p.box.y0,p.box.y1,b.z0,b.z1),c=hex(p.col||'#7a4a26');for(let i=0;i<B.pos.length;i+=3){pos.push(B.pos[i],B.pos[i+1],B.pos[i+2]);nrm.push(B.nrm[i],B.nrm[i+1],B.nrm[i+2]);col.push(c[0]*tint[0],c[1]*tint[1],c[2]*tint[2])}for(const k of B.idx)idx.push(k+base);base+=B.pos.length/3;continue}
      const g=G[p.n];if(!g)continue;
      q.setFromEuler(e.set(0,p.ry||0,0));sc.set(p.s?p.s[0]:1,p.s?p.s[1]:1,p.s?p.s[2]:1);m4.compose(v.set(p.x,p.y,p.z),q,sc);nm.getNormalMatrix(m4);
      for(let i=0;i<g.pos.length;i+=3){v.set(g.pos[i],g.pos[i+1],g.pos[i+2]).applyMatrix4(m4);pos.push(v.x,v.y,v.z);n3.set(g.nrm[i],g.nrm[i+1],g.nrm[i+2]).applyMatrix3(nm).normalize();nrm.push(n3.x,n3.y,n3.z);col.push(g.col[i]*tint[0],g.col[i+1]*tint[1],g.col[i+2]*tint[2])}
      for(const k of g.idx)idx.push(k+base);base+=g.pos.length/3}
    const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bg.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));bg.setIndex(idx);bg.computeBoundingSphere();bg.computeBoundingBox();
    const m=new THREE.Mesh(bg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:.02}));m.castShadow=m.receiveShadow=true;return m}
  async function place(name,x,y,z,ry,s){const g=await piece(name),bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(g.pos,3));bg.setAttribute('normal',new THREE.Float32BufferAttribute(g.nrm,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(g.col,3));bg.setIndex(g.idx);
    const m=new THREE.Mesh(bg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92}));m.castShadow=m.receiveShadow=true;m.position.set(x,y,z);m.rotation.y=ry||0;if(s)m.scale.set(s[0],s[1],s[2]);return m}
  return {manifest,mesh,place,piece};
})();
