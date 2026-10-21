// RallyWorld: draws a Track into the scene (browser only). Road ribbons with a painted-asphalt texture, concrete skirts under raised sections (bridges,
// ramps), gate arches, glowing sky rings, boost pads, sliding-crusher hammers, a landing marker. Everything is generated from the Track data, so a new
// route needs no new art. Geometry is tiny (a ~2 km route is ~15k triangles in ~12 draw calls); materials are shared; nothing is rebuilt per frame except
// the hammer heads and the "next gate" highlight. THREE r147 globals. build() once; update(raceT, nextGate) every frame.
const RallyWorld=(()=>{
  const cv=(w,h,fn)=>{const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t};
  function roadTexture(){
    return cv(128,256,(g,w,h)=>{
      g.fillStyle='#3a3f4b';g.fillRect(0,0,w,h);
      for(let i=0;i<900;i++){g.fillStyle=`rgba(${120+Math.random()*60|0},${125+Math.random()*60|0},${135+Math.random()*60|0},${Math.random()*.09})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2)}
      g.fillStyle='#e9edf5';g.fillRect(7,0,6,h);g.fillRect(w-13,0,6,h);                         // edge lines
      g.fillStyle='#ffd24a';for(let y=0;y<h;y+=128)g.fillRect(w/2-2.5,y,5,64);               // dashed centre line
      g.fillStyle='rgba(255,255,255,.05)';g.fillRect(0,0,w,3);
    });
  }
  function padTexture(col){
    return cv(64,128,(g,w,h)=>{
      g.clearRect(0,0,w,h);g.fillStyle='rgba(10,30,20,.55)';g.fillRect(0,0,w,h);
      g.strokeStyle=col;g.lineWidth=9;g.lineCap='round';g.lineJoin='round';
      for(let k=0;k<3;k++){const y=100-k*38;g.beginPath();g.moveTo(10,y);g.lineTo(w/2,y-26);g.lineTo(w-10,y);g.stroke()}
      g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=3;g.strokeRect(2,2,w-4,h-4);
    });
  }
  function bannerTexture(text,bg,fg,checker){
    return cv(512,96,(g,w,h)=>{
      if(checker){const s=16;for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){g.fillStyle=((x+y)/s)%2?'#111':'#fff';g.fillRect(x,y,s,s)}g.fillStyle='rgba(0,0,0,.62)';g.fillRect(w/2-150,12,300,h-24)}
      else{g.fillStyle=bg;g.fillRect(0,0,w,h);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(0,0,w,6)}
      g.fillStyle=fg;g.font='800 54px system-ui,Segoe UI,Roboto,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2+3);
    });
  }
  function stripeTexture(){
    return cv(64,64,(g,w,h)=>{g.fillStyle='#ffcf2e';g.fillRect(0,0,w,h);g.fillStyle='#1b1b1b';for(let i=-2;i<6;i++){g.beginPath();g.moveTo(i*16,0);g.lineTo(i*16+8,0);g.lineTo(i*16+8+h,h);g.lineTo(i*16+h,h);g.fill()}});
  }

  function build(T,scene,H){
    const root=new THREE.Group();root.name='rally-world';
    const M={road:new THREE.MeshLambertMaterial({map:roadTexture()}),skirt:new THREE.MeshLambertMaterial({color:0x808592,side:THREE.DoubleSide}),
      post:new THREE.MeshLambertMaterial({color:0xdfe6f5}),dark:new THREE.MeshLambertMaterial({color:0x252a36}),
      pad:new THREE.MeshBasicMaterial({map:padTexture('#6dffb0'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
      stripe:new THREE.MeshLambertMaterial({map:stripeTexture()})};
    M.road.map.wrapT=THREE.RepeatWrapping;
    // ---- road ribbons + skirts ----
    for(const r of T.roads){
      const m=r.m,pos=new Float32Array(m*2*3),uv=new Float32Array(m*2*2),idx=[];
      for(let i=0;i<m;i++){
        const nx=-r.TZ[i],nz=r.TX[i],hw=r.W[i]/2,y=r.Y[i]+.03;
        pos.set([r.X[i]-nx*hw,y,r.Z[i]-nz*hw,r.X[i]+nx*hw,y,r.Z[i]+nz*hw],i*6);
        uv.set([0,r.S[i]/16,1,r.S[i]/16],i*4);
        if(i<m-1){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      // winding: (left_i, right_i, left_i+1) with left=P-l*hw, l=(-tz,0,tx) gives a +Y normal for every road direction
      const mesh=new THREE.Mesh(g,M.road);mesh.receiveShadow=false;root.add(mesh);
      // skirts: wherever the deck is well above the terrain, a concrete wall down to the ground on both sides (+ end caps)
      const sp=[],si=[];const side=(sgn)=>{
        let prev=-1;
        for(let i=0;i<m;i++){
          const nx=-r.TZ[i]*sgn,nz=r.TX[i]*sgn,hw=r.W[i]/2,ex=r.X[i]+nx*hw,ez=r.Z[i]+nz*hw,top=r.Y[i]+.03,bot=Math.min(H(ex,ez)-.6,top-.4);
          const raised=top-H(ex,ez)>.35;
          const k=sp.length/3;sp.push(ex,top,ez,ex,bot,ez);
          if(raised&&prev>=0&&prev.raised){const a=prev.k;si.push(a,a+1,k,a+1,k+1,k)}
          prev={k,raised};
        }};
      side(1);side(-1);
      for(const [i,dir] of [[0,0],[m-1,1]]){const nx=-r.TZ[i],nz=r.TX[i],hw=r.W[i]/2,top=r.Y[i]+.03;
        const hl=H(r.X[i]-nx*hw,r.Z[i]-nz*hw),hr=H(r.X[i]+nx*hw,r.Z[i]+nz*hw);
        if(top-Math.min(hl,hr)>.35){const k=sp.length/3;sp.push(r.X[i]-nx*hw,top,r.Z[i]-nz*hw,r.X[i]+nx*hw,top,r.Z[i]+nz*hw,r.X[i]-nx*hw,Math.min(hl,hr)-.6,r.Z[i]-nz*hw,r.X[i]+nx*hw,Math.min(hl,hr)-.6,r.Z[i]+nz*hw);si.push(k,k+1,k+2,k+1,k+3,k+2)}}
      if(si.length){const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(sp),3));sg.setIndex(si);sg.computeVertexNormals();const sm=new THREE.Mesh(sg,M.skirt);root.add(sm)}
    }
    // ---- gates: ground arches and sky rings ----
    const arches=[],rings=[];
    const archFor=(g)=>{
      const rd=T.roads[g.road],half=(rd.W[Math.min(rd.m-1,Math.round(g.s/rd.len*(rd.m-1)))]||16)/2+1.6;
      const grp=new THREE.Group(),col=g.k==='lip'?0xff8a2a:g.k==='finish'?0xffffff:g.k==='start'?0x5eeaa5:g.k==='touchdown'?0x6fd3ff:0x8fb8ff;
      const mat=new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.35});
      for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.9,7,.9),mat);p.position.set(s*half,3.5,0);grp.add(p)}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(half*2+.9,1.1,1.1),mat);beam.position.y=7.2;grp.add(beam);
      const label=g.k==='start'?'START':g.k==='finish'?'FINISH':g.k==='lip'?'LAUNCH':g.k==='touchdown'?'TOUCHDOWN':'CHECKPOINT';
      const tex=bannerTexture(label,g.k==='lip'?'#c2551a':g.k==='touchdown'?'#1b6f96':'#233a73','#fff',g.k==='finish');
      const ban=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(half*2,14),Math.min(half*2,14)*96/512),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));ban.position.y=5.9;grp.add(ban);
      const ban2=ban.clone();ban2.rotation.y=Math.PI;ban2.position.z=-.04;grp.add(ban2);   // readable from both sides: cars approach from behind the arch's forward axis
      grp.position.set(g.x,g.y,g.z);grp.rotation.y=Math.atan2(g.nx,g.nz);grp.userData={mat,gate:g};root.add(grp);return grp;
    };
    const ringFor=(g)=>{
      const mat=new THREE.MeshBasicMaterial({color:0x6fe3ff,transparent:true,opacity:.8,depthWrite:false,fog:false});   // normal blending: additive washes out to white against the bright sky
      const mesh=new THREE.Mesh(new THREE.TorusGeometry(g.r,1.7,10,40),mat);
      mesh.position.set(g.x,g.y,g.z);mesh.rotation.y=Math.atan2(g.nx,g.nz);mesh.userData={mat,gate:g};root.add(mesh);return mesh;
    };
    for(const g of T.gates){(g.type==='ground'?arches:rings)[g.i]=g.type==='ground'?archFor(g):ringFor(g)}
    // ---- boost pads ----
    for(const p of T.pads){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(p.hw*2,p.hl*2),M.pad);mesh.rotation.x=-Math.PI/2;
      mesh.rotation.order='YXZ';mesh.rotation.y=Math.atan2(p.tx,p.tz);mesh.position.set(p.x+(-p.tz)*p.lat,p.y+.09,p.z+p.tx*p.lat);root.add(mesh)}
    // ---- hammers: a gantry across the road with a striped crusher head that slides side to side ----
    const heads=[];
    for(const h of T.hazards){
      const rd=T.roads[h.road],half=(h.amp+3.6);const hd=Math.atan2(h.tx,h.tz);
      const gant=new THREE.Group();gant.position.set(h.x,h.y,h.z);gant.rotation.y=hd;
      for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(1,6.2,1),M.dark);p.position.set(s*half,3.1,0);gant.add(p)}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(half*2+1,.9,1.2),M.dark);beam.position.y=6.2;gant.add(beam);root.add(gant);
      const head=new THREE.Mesh(new THREE.BoxGeometry(h.r*2,3.4,h.r*2),M.stripe);root.add(head);
      const rod=new THREE.Mesh(new THREE.BoxGeometry(.5,3,.5),M.dark);root.add(rod);
      heads.push({h,head,rod});
    }
    // ---- landing markers: a glowing disc on each touchdown gate ----
    const discs=[];
    for(const g of T.gates)if(g.k==='touchdown'){const d=new THREE.Mesh(new THREE.RingGeometry(10,14,40),new THREE.MeshBasicMaterial({color:0x6fe3ff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      d.rotation.x=-Math.PI/2;d.position.set(g.x,g.y+.12,g.z);root.add(d);discs.push(d)}
    scene.add(root);
    let lastNext=-1;
    const _h={};
    return {root,
      // raceT: seconds on the hammers' clock; next: index of the next gate (highlighted), t: wall seconds for pulses
      update(raceT,next,t){
        for(const e of heads){T.hazardPos(e.h,raceT,_h);e.head.position.set(_h.x,_h.y+1.9,_h.z);e.head.rotation.y=Math.atan2(e.h.tx,e.h.tz);e.rod.position.set(_h.x,_h.y+5.1,_h.z)}
        const pulse=.6+.4*Math.sin(t*6);
        for(let i=0;i<T.gates.length;i++){const o=arches[i]||rings[i];if(!o)continue;const isNext=i===next,u=o.userData;
          if(u.mat.emissiveIntensity!==undefined)u.mat.emissiveIntensity=isNext?.4+.6*pulse:.18;
          else{u.mat.opacity=isNext?.55+.45*pulse:i<next?.12:.38;u.mat.color.setHex(isNext?0xffd24a:i<next?0x4a6a7a:0x6fe3ff);o.scale.setScalar(isNext?1+.03*Math.sin(t*8):1)}}
        for(const d of discs){d.material.opacity=.35+.25*Math.sin(t*3)}
      },
      dispose(){scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose()})}};
  }
  return {build};
})();
