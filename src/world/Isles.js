// Isles: makes the OUTER islands feel lived-in. Their land is extended by ISLX (src/data/islands.js); this module fills it with forests, meadows, rocks and small hamlets
// built from assets/isle.glb (low-poly KayKit + LowPoly pieces, ~0.4 MB; AM['KK_*'] / AM['LP_*'], loaded by loadIsle()). The heavy Quaternius kits stay floating-island only.
// Everything is deterministic from the room code on a PRIVATE rng stream per island, so it never changes where the world's existing trees, shards or hunt sites are,
// and both clients build the same thing with no networking. Perf: instanced + chunked through scatter() (vegCull hides far cells), only 2-3 tree types per island,
// grass tufts are 44 triangles, no per-instance scene objects. Hamlets are a few houses (existing Kenney wall/roof pieces) + lanterns, and each is a named discovery.
// Globals read at call time: THREE, scene, solids, VEG, AM, H, place, house, ISL, ISLX, LOCS, KT, RING, BOARD, OUT, Sites, mulberry, hashSeed.
const Isles=(()=>{
  const TH={KK_Tree_1_A:9,KK_Tree_1_B:10.5,KK_Tree_2_A:10,KK_Tree_2_B:12,KK_Tree_3_A:7.5,KK_Tree_4_A:11,KK_Tree_Bare_1_A:7,KK_Tree_Bare_2_A:8.5,LP_Tree_1:12,
    KK_Bush_2_A:.7,KK_Bush_2_B:1.1,KK_Bush_3_A:.8,KK_Bush_4_C:1.5,LP_Bush_1:1.1,KK_Grass_1_A:.55,KK_Grass_2_A:.8,
    KK_Rock_1_A:.9,KK_Rock_1_D:1.5,KK_Rock_2_B:.9,KK_Rock_2_C:1.8,KK_Rock_3_A:1.1,KK_Rock_3_G:2.6,LP_Rock_4:2.2,LP_Log_3:.7};
  // per island: tree/bush/rock/grass piece lists, density multipliers (trees, bushes, rocks, grass) and hamlet names
  const LUSH={T:['KK_Tree_1_A','KK_Tree_2_A','KK_Tree_4_A'],B:['KK_Bush_2_B','KK_Bush_4_C'],R:['KK_Rock_1_D','KK_Rock_2_C'],G:['KK_Grass_1_A'],d:[1.1,1.3,.6,1.6],H:['Reedwater Landing']};
  const THEME={
    'Ember Isle':{T:['KK_Tree_Bare_1_A','KK_Tree_Bare_2_A','KK_Tree_2_A'],B:['KK_Bush_3_A'],R:['KK_Rock_3_G','KK_Rock_1_D','LP_Rock_4'],G:['KK_Grass_2_A'],d:[.9,.5,2.2,.35],H:['Ashfall Camp']},
    'Sunken Isle':LUSH,
    'Palm Atoll':{T:['KK_Tree_3_A','KK_Tree_1_B'],B:['KK_Bush_2_B','KK_Bush_4_C','LP_Bush_1'],R:['KK_Rock_2_C','KK_Rock_1_A'],G:['KK_Grass_1_A'],d:[.55,1.4,.5,1.6],H:['Driftwood Huts','Palm Cove']},
    'Frost Isle':{T:['KK_Tree_4_A','KK_Tree_Bare_2_A','KK_Tree_2_B'],B:['KK_Bush_3_A'],R:['KK_Rock_3_G','KK_Rock_3_A','KK_Rock_2_C'],G:['KK_Grass_2_A'],d:[.8,.4,1.8,.3],H:['Frostlight Lodge']},
    'Far Reef':{T:['KK_Tree_1_A','KK_Tree_3_A','KK_Tree_2_A'],B:['KK_Bush_2_B','KK_Bush_4_C'],R:['KK_Rock_1_D','KK_Rock_2_B'],G:['KK_Grass_1_A'],d:[1,1.2,.5,1.5],H:['Reefside Hamlet']},
    'Storm Cay':{T:['KK_Tree_2_A','KK_Tree_Bare_1_A'],B:['KK_Bush_3_A','KK_Bush_2_A'],R:['KK_Rock_3_G','KK_Rock_1_D','LP_Rock_4'],G:['KK_Grass_2_A'],d:[.6,.7,1.6,.6],H:['Lightning Rod Post']},
    'The Boneyard':{T:['KK_Tree_Bare_1_A','KK_Tree_Bare_2_A'],B:['KK_Bush_3_A'],R:['KK_Rock_3_A','KK_Rock_1_D','LP_Log_3'],G:['KK_Grass_2_A'],d:[.7,.3,2,.2],H:[]}
  };
  const safe=f=>{try{return f()}catch(e){return false}};
  let built=false;
  function build(code){
    if(built||!scene||!AM.KK_Tree_1_A)return;built=true;
    // coarse grid of everything that is already solid (legacy trees/rocks/houses/camps) + reserved sites, so new content never lands on them
    const grid=new Map(),G=24,key=(i,j)=>i+','+j;
    const gadd=(x,z,r)=>{const k=key(Math.floor(x/G),Math.floor(z/G));let c=grid.get(k);if(!c)grid.set(k,c=[]);c.push([x,z,r])};
    const near=(x,z,r)=>{const i=Math.floor(x/G),j=Math.floor(z/G);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const c=grid.get(key(i+a,j+b));if(c)for(const o of c)if(Math.hypot(x-o[0],z-o[1])<o[2]+r)return true}return false};
    for(const s of ISL)for(const c of solids)if(Math.hypot(c.x-s.x,c.z-s.z)<s.R*1.8)gadd(c.x,c.z,c.r);
    for(const t of Sites.taken())gadd(t.x,t.z,t.r+3);
    const blocked=(x,z)=>safe(()=>Math.abs(x-KT.x)<KT.hw+14&&Math.abs(z-KT.z)<KT.hh+14)||safe(()=>Math.hypot(x-RING.x,z-RING.z)<RING.R+10)||safe(()=>Math.hypot(x-OUT.x,z-OUT.z)<OUT.R+30)||
      safe(()=>dash.start&&Math.hypot(x-dash.start.x,z-dash.start.z)<60)||safe(()=>srun.start&&Math.hypot(x-srun.start.x,z-srun.start.z)<35);
    const baseMat=new THREE.MeshStandardMaterial({color:'#8d8a82',roughness:1});
    for(const I of ISL){
      if(!ISLX.on(I))continue;
      const th=THEME[I.n]||LUSH,slug=I.n.replace(/\W+/g,'').toLowerCase(),rng=mulberry(hashSeed(code+':isle:'+slug)),f=I.x*.013+I.z*.007;
      // ---- hamlets first (so vegetation keeps clear of them) ----
      const names=th.H,nH=I.R>=250?names.length:Math.min(1,names.length);
      for(let k=0;k<nH;k++){
        const st=Sites.find({tag:'hamlet',key:slug+k,name:I.n,cx:I.x,cz:I.z,rmin:I.R*.15,rmax:I.R*1.15,clear:15,sep:70});if(!st)continue;
        gadd(st.x,st.z,18);hamlet(st,names[k],hashSeed(code+':hamlet:'+slug+k),baseMat,gadd);
      }
      // ---- vegetation: forest patches + meadows + rocks, anywhere on the dome or the extension land ----
      const P={},put=(nm,x,z,s)=>{(P[nm]=P[nm]||[]).push({x,y:H(x,z),z,ry:rng()*6.283,s})};
      const want={t:Math.round(I.R*.8*th.d[0]),b:Math.round(I.R*1.0*th.d[1]),r:Math.round(I.R*.3*th.d[2]),g:Math.round(I.R*1.6*th.d[3])},got={t:0,b:0,r:0,g:0};
      const trees=[];
      for(let i=0;i<9000&&(got.t<want.t||got.b<want.b||got.r<want.r||got.g<want.g);i++){
        const a=rng()*6.283,rc=ISLX.coast(I,a),r=Math.sqrt(rng())*rc*.98,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r,h=H(x,z);
        if(h<-.1||h>22||blocked(x,z))continue;
        const forest=Math.sin(x*.021+f)*Math.cos(z*.018-f)+Math.sin(x*.05-z*.04+f*2)*.5,u=rng();   // >0 forest patch, <0 meadow
        if(u<.5&&got.t<want.t&&h>1&&forest>.05&&!near(x,z,3.2)){const nm=th.T[rng()*th.T.length|0],s=.75+rng()*.55;put(nm,x,z,s);trees.push([nm,x,z,s]);gadd(x,z,1.6);got.t++}
        else if(u<.72&&got.b<want.b&&h>.5&&!near(x,z,1.6)){put(th.B[rng()*th.B.length|0],x,z,.7+rng()*.7);gadd(x,z,.9);got.b++}
        else if(u<.82&&got.r<want.r&&!near(x,z,2.2)){put(th.R[rng()*th.R.length|0],x,z,.6+rng()*1.1);gadd(x,z,1.4);got.r++}
        else if(got.g<want.g&&h>.6&&forest<.35){put(th.G[rng()*th.G.length|0],x,z,.7+rng()*.7);got.g++}
      }
      bake(P);
      for(const [nm,x,z,s] of trees){const w=(AM[nm]&&AM[nm].userData.w)||0;solids.push({x,z,r:Math.min(1.1,Math.max(.35,(TH[nm]||9)*.045*s))})}
    }
    updateHudSafe();
  }
  // ---- baking: every chunk of foliage becomes a few merged static meshes (one draw per material per chunk) instead of one InstancedMesh per plant type per chunk.
  // Two groups with their own chunk size and draw range: BIG (trees, rocks, logs) and SMALL (bushes, grass). Per-vertex shade variation replaces instance colours.
  const PB={},V3=new THREE.Vector3(),Q4=new THREE.Quaternion(),S3=new THREE.Vector3(),Y3=new THREE.Vector3(0,1,0),vcMat=new Map();
  function pbox(nm){let b=PB[nm];if(!b){const m=AM[nm];m.updateMatrixWorld(true);const bx=new THREE.Box3().setFromObject(m);b=PB[nm]={k:TH[nm]/(bx.max.y-bx.min.y),minY:bx.min.y}}return b}
  const GROUP=nm=>/Bush|Grass/.test(nm)?{g:'small',cell:130,lim:280}:{g:'big',cell:220,lim:700};
  function bake(P){
    const cells=new Map();
    for(const nm in P){if(!AM[nm])continue;const G=GROUP(nm);for(const p of P[nm]){const k=G.g+':'+Math.floor(p.x/G.cell)+','+Math.floor(p.z/G.cell);let c=cells.get(k);if(!c)cells.set(k,c={G,pts:[]});c.pts.push([nm,p])}}
    const v=new THREE.Vector3(),n=new THREE.Vector3();
    for(const c of cells.values()){
      const byMat=new Map();let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,y0=1e9,y1=-1e9;
      for(const [nm,p] of c.pts){
        const bb=pbox(nm),m=AM[nm],T=new THREE.Matrix4().compose(V3.set(p.x,p.y-bb.minY*bb.k*p.s,p.z),Q4.setFromAxisAngle(Y3,p.ry),S3.setScalar(bb.k*p.s)),shade=.8+(((p.x*12.9898+p.z*78.233)%1+1)%1)*.36;
        x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y+TH[nm]*p.s);
        m.traverse(o=>{if(!o.isMesh||!o.geometry.attributes.position)return;
          const M=new THREE.Matrix4().multiplyMatrices(T,o.matrixWorld),N=new THREE.Matrix3().getNormalMatrix(M),g=o.geometry,pa=g.attributes.position,na=g.attributes.normal,ua=g.attributes.uv;
          let b=byMat.get(o.material);if(!b)byMat.set(o.material,b={pos:[],nor:[],uv:[],col:[],idx:[],n:0});
          for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(M);b.pos.push(v.x,v.y,v.z);
            if(na){n.fromBufferAttribute(na,i).applyMatrix3(N).normalize();b.nor.push(n.x,n.y,n.z)}else b.nor.push(0,1,0);
            b.uv.push(ua?ua.getX(i):0,ua?ua.getY(i):0);b.col.push(shade,shade,shade)}
          if(g.index){for(let i=0;i<g.index.count;i++)b.idx.push(g.index.getX(i)+b.n)}else for(let i=0;i<pa.count;i++)b.idx.push(i+b.n);
          b.n+=pa.count});
      }
      const rad=Math.hypot((x1-x0)/2,(z1-z0)/2,(y1-y0)/2)+4,cx=(x0+x1)/2,cz=(z0+z1)/2;
      for(const [mat,b] of byMat){
        const geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.Float32BufferAttribute(b.pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.nor,3));
        geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(b.col,3));
        geo.setIndex(b.n>65535?new THREE.Uint32BufferAttribute(b.idx,1):new THREE.Uint16BufferAttribute(b.idx,1));
        geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx,(y0+y1)/2,cz),rad);
        let vm=vcMat.get(mat);if(!vm){vm=mat.clone();vm.vertexColors=true;vcMat.set(mat,vm)}
        const mesh=new THREE.Mesh(geo,vm);mesh.matrixAutoUpdate=false;mesh.frustumCulled=true;mesh.receiveShadow=true;mesh.castShadow=c.G.g==='big';
        scene.add(mesh);VEG.push({m:mesh,x:cx,z:cz,r:rad,lim:c.G.lim,isle:true});
      }
    }
  }
  function updateHudSafe(){try{updateHud()}catch(e){}}
  // a hamlet: 2-3 small wooden houses facing a little plaza with lanterns (+ a stall) on a flat spot; a stone footing hides any slope under each house
  function hamlet(st,name,seed,baseMat,gadd){
    const r=mulberry(seed),n=2+(r()*2|0),R=10+r()*3;
    for(let i=0;i<n;i++){
      const a=st.ry+i*(6.283/n)+.3+r()*.25,hx=st.x+Math.cos(a)*R,hz=st.z+Math.sin(a)*R,w=2,d=r()<.4?3:2;
      if(Math.abs(H(hx,hz)-st.y)>2.2||H(hx,hz)<.6)continue;
      const ry=Math.atan2(-Math.cos(a),-Math.sin(a));
      house(hx,hz,ry,w,d);
      const g=scene.children[scene.children.length-1];let top=-9;
      for(const dx of [-3,0,3])for(const dz of [-3,0,3])top=Math.max(top,H(hx+dx,hz+dz));
      g.position.y=top+.05;
      const fw=w*2.6+.5,fd=d*2.6+.5,bh=Math.max(.5,top-H(hx,hz)+.9),foot=new THREE.Mesh(new THREE.BoxGeometry(fw,bh,fd),baseMat);
      foot.position.set(hx,top-bh/2+.05,hz);foot.rotation.y=ry;foot.receiveShadow=true;scene.add(foot);
      gadd(hx,hz,Math.max(fw,fd)*.6);
    }
    for(let i=0;i<3;i++){const a=st.ry+i*2.09+1,x=st.x+Math.cos(a)*4.6,z=st.z+Math.sin(a)*4.6;if(H(x,z)<.5)continue;place(scene,'lantern',x,H(x,z),z,0,2.2);solids.push({x,z,r:.25})}
    if(r()<.7){const a=st.ry+3.6,x=st.x+Math.cos(a)*6.8,z=st.z+Math.sin(a)*6.8;if(H(x,z)>.5){place(scene,r()<.5?'stall-red':'stall-green',x,H(x,z),z,Math.atan2(-Math.cos(a),-Math.sin(a)),3);solids.push({x,z,r:1.8})}}
    LOCS.push({n:name,x:st.x,z:st.z,r:22});   // a named place to discover (discoveries are a set of names, so appending is safe for saved progress)
  }
  return {build};
})();
