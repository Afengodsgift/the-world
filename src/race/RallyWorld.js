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

  const RW={kit:null,pending:[]};
  function loadKit(url){return fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(k=>{RW.kit=k;for(const f of RW.pending.splice(0))try{f(k)}catch(e){console.error('RallyWorld kit',e)}return k})}
  function build(T,scene,H){
    const _f={};
    const root=new THREE.Group();root.name='rally-world';
    const M={road:new THREE.MeshLambertMaterial({map:roadTexture()}),skirt:new THREE.MeshLambertMaterial({color:0x808592,side:THREE.DoubleSide}),
      post:new THREE.MeshLambertMaterial({color:0xdfe6f5}),dark:new THREE.MeshLambertMaterial({color:0x252a36}),
      pad:new THREE.MeshBasicMaterial({map:padTexture('#6dffb0'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
      stripe:new THREE.MeshLambertMaterial({map:stripeTexture()})};
    M.dirt=new THREE.MeshLambertMaterial({map:M.road.map,color:0xd8a468});   // shortcuts are dirt: you can see the cut from the main road
    M.reef=new THREE.MeshLambertMaterial({map:M.road.map,color:0x7fd8e8,emissive:0x0a4a63});   // the underwater tunnel: cool, glowing teal asphalt
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
      const mesh=new THREE.Mesh(g,r.sub?M.reef:r.alt?M.dirt:M.road);mesh.receiveShadow=false;root.add(mesh);
      if(r.sub){   // lanterns: a cyan light on each edge every ~14 m (one instanced mesh), so the tunnel reads as a lit passage under the waves
        const n=Math.floor(r.m/7)*2,im=new THREE.InstancedMesh(new THREE.SphereGeometry(.55,8,6),new THREE.MeshBasicMaterial({color:0x7ff6ff}),n),mm=new THREE.Matrix4();let k=0;
        for(let i=3;i<r.m-3&&k<n-1;i+=7)for(const sg of [-1,1]){const hw=r.W[i]/2+.4;mm.makeTranslation(r.X[i]+sg*-r.TZ[i]*hw,r.Y[i]+.9,r.Z[i]+sg*r.TX[i]*hw);im.setMatrixAt(k++,mm)}
        im.count=k;im.frustumCulled=false;root.add(im)}
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
    // ---- shortcut signs: an orange gantry over the main road where a cut leaves it; gold bonus rings off the racing line ----
    for(const f of (T.forks||[])){
      const grp=new THREE.Group(),half=f.w/2+1.5,mat=new THREE.MeshLambertMaterial({color:0xff8a1f});
      for(const sg of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.9,7,.9),mat);p.position.set(sg*half,3.5,0);grp.add(p)}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(half*2+.9,1.1,1.1),mat);beam.position.y=7.2;grp.add(beam);
      const tex=bannerTexture('↘ '+f.name,'#b4530c','#fff',false),bw=Math.min(half*2,15);
      const ban=new THREE.Mesh(new THREE.PlaneGeometry(bw,bw*96/512),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));ban.position.y=5.9;grp.add(ban);
      const y=T.at?(T.at(f.main,f.s,_f),_f.y):0;
      grp.position.set(f.x,y,f.z);grp.rotation.y=Math.atan2(f.tx,f.tz);root.add(grp);
    }
    const bonusRings=(T.bonus||[]).map(b=>{
      const mat=new THREE.MeshBasicMaterial({color:0xffd24a,transparent:true,opacity:.9,depthWrite:false,fog:false});
      const m=new THREE.Mesh(new THREE.TorusGeometry(b.r,1.3,8,32),mat);m.position.set(b.x,b.y,b.z);m.rotation.y=Math.atan2(b.nx,b.nz);root.add(m);return m});
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

    // ---- trackside dressing from the Modular Race Kart kit (assets/rally/kit.json, baked by tools/bake_rally_kit.js): finish/start banners, curve warning signs,
    // hay bales on the outside of tight bends, rails along raised decks, rocks beside the road. Purely visual; added once the kit has loaded. ----
    let dressed=false;
    function dress(K){
      if(dressed||!K)return;dressed=true;
      const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),geos={},want={};
      const geo=k=>geos[k]||(geos[k]=(()=>{const q=K[k];if(!q)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(q.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(q.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(q.c,3));return g})());
      const put=(k,x,y,z,th,sx,sy,sz)=>{(want[k]||(want[k]=[])).push([x,y,z,th,sx,sy==null?sx:sy,sz==null?sx:sz])};
      const pj={};let seed=12345;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
      // start / finish banners across the road
      for(const g of T.gates){if(g.k!=='finish'&&g.k!=='start')continue;const p=T.project(g.x,g.z,pj,-1),W=T.roads[p.road].W[pj.i]||16,th=Math.atan2(-g.nz,g.nx),sc=Math.min(7,(W+3)/3.1),lat=.5*sc;
        put('finish',g.x-Math.sin(th)*lat,g.y,g.z-Math.cos(th)*lat,th,sc)}
      for(const r of T.roads){
        const m=r.m;let lastBend=-1e9,lastRock=-1e9,rails=0;
        for(let i=6;i<m-6;i++){
          const nx=-r.TZ[i],nz=r.TX[i],W=r.W[i],th=Math.atan2(-r.TZ[i],r.TX[i]);
          // tight bends: turn of the tangent across ~±8 samples
          const a=Math.atan2(r.TX[i-6]*r.TZ[i+6]-r.TZ[i-6]*r.TX[i+6],r.TX[i-6]*r.TX[i+6]+r.TZ[i-6]*r.TZ[i+6]),span=r.S[i+6]-r.S[i-6];
          if(Math.abs(a)>.5&&span<60&&r.S[i]-lastBend>55&&r.S[i]>40&&!r.alt){
            lastBend=r.S[i];const outer=a>0?-1:1;   // a>0 turns one way; the outside of the bend is the other side
            for(const k of [-1,0,1]){const j=Math.min(m-1,Math.max(0,i+k*3)),ox=-r.TZ[j]*outer,oz=r.TX[j]*outer,d=W/2+2.2;put('bale',r.X[j]+ox*d,r.Y[j],r.Z[j]+oz*d,Math.atan2(-r.TZ[j],r.TX[j])+(rnd()-.5)*.4,2.6)}
            const b=Math.max(0,i-Math.round(38/Math.max(1,r.S[i]/i))),bx=-r.TZ[b],bz=r.TX[b];   // a warning sign ~38 m before the bend, on the right-hand verge
            put(Math.abs(a)>1.9?'sign180':Math.abs(a)>.9?'sign90':'signS',r.X[b]-bx*(r.W[b]/2+2.2),r.Y[b],r.Z[b]-bz*(r.W[b]/2+2.2),Math.atan2(-r.TZ[b],r.TX[b]),3.4)
          }
          // rails along every guarded edge (where the ground drops away: these are the solid walls of Track's guard)
          if(i%4===0&&rails<900&&r.GP){const e=W/2+.45;
            if(r.GP[i]){put('rail',r.X[i]+nx*e,r.Y[i]+.05,r.Z[i]+nz*e,th,5.2,2.2,2.2);rails++}
            if(r.GM[i]){put('rail',r.X[i]-nx*e,r.Y[i]+.05,r.Z[i]-nz*e,th,5.2,2.2,2.2);rails++}}
          // rocks beside the road, on land only
          if(r.S[i]-lastRock>38&&rnd()<.55){lastRock=r.S[i];const sd=rnd()<.5?-1:1,d=W/2+9+rnd()*10,x=r.X[i]+nx*sd*d,z=r.Z[i]+nz*sd*d;
            if(H(x,z)>.8&&r.Y[i]-H(x,z)<2)put(rnd()<.5?'rock':'rock2',x,H(x,z)-.2,z,rnd()*6.28,2+rnd()*3)}
        }
      }
      const dm=new THREE.Object3D();
      for(const k of Object.keys(want)){const g=geo(k);if(!g)continue;const L=want[k],im=new THREE.InstancedMesh(g,mat,L.length);im.frustumCulled=false;
        L.forEach((q,n)=>{dm.position.set(q[0],q[1],q[2]);dm.rotation.set(0,q[3],0);dm.scale.set(q[4],q[5],q[6]);dm.updateMatrix();im.setMatrixAt(n,dm.matrix)});root.add(im)}
      return Object.keys(want).map(k=>k+':'+want[k].length).join(' ');
    }
    if(RW.kit)dress(RW.kit);else RW.pending.push(dress);
    let lastNext=-1;
    const _h={};
    return {root,dress,
      // raceT: seconds on the hammers' clock; next: index of the next gate (highlighted), t: wall seconds for pulses
      update(raceT,next,t,bz,cx,cz){
        for(let i=0;i<bonusRings.length;i++){const m=bonusRings[i],got=bz&&bz.indexOf(i)>=0;m.material.opacity=got?.1:.7+.3*Math.sin(t*5+i);m.scale.setScalar(got?1:1+.05*Math.sin(t*4+i))}
        for(const e of heads){T.hazardPos(e.h,raceT,_h);e.head.position.set(_h.x,_h.y+1.9,_h.z);e.head.rotation.y=Math.atan2(e.h.tx,e.h.tz);e.rod.position.set(_h.x,_h.y+5.1,_h.z)}
        const pulse=.6+.4*Math.sin(t*6);
        for(let i=0;i<T.gates.length;i++){const o=arches[i]||rings[i];if(!o)continue;const isNext=i===next,u=o.userData;if(cx!==undefined){const g=u.gate,far=Math.hypot(g.x-cx,g.z-cz)>650&&!isNext;if(o.visible===far)o.visible=!far;if(far)continue}   // distant gates are not drawn: fewer draw calls
          
          if(u.mat.emissiveIntensity!==undefined)u.mat.emissiveIntensity=isNext?.4+.6*pulse:.18;
          else{u.mat.opacity=isNext?.55+.45*pulse:i<next?.12:.38;u.mat.color.setHex(isNext?0xffd24a:i<next?0x4a6a7a:0x6fe3ff);o.scale.setScalar(isNext?1+.03*Math.sin(t*8):1)}}
        for(const d of discs){d.material.opacity=.35+.25*Math.sin(t*3)}
      },
      dispose(){scene.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose()})}};
  }
  return {build,loadKit,get kit(){return RW.kit}};
})();
