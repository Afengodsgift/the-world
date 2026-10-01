    const pathN=Math.exp(-((dx*dx+(dz-30)**2)/900));
    const pond=Math.exp(-((dx*dx+(dz+20)**2)/180));
    c.copy(cGrass1).lerp(cGrass2,Math.sin(dx*.28+dz*.19)*.5+.5);
    c.lerp(cDirt,sstep(SKY.R*.92,SKY.R*1.15,d)*.7);
    c.lerp(cPath,pathN*.55);
    c.lerp(new THREE.Color('#4a8fc8'),pond*.85);
    cols.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));geo.computeVertexNormals();
  const top=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));
  top.position.set(SKY.x,SKY.base,SKY.z);top.receiveShadow=true;scene.add(top);

  const rockM=new THREE.MeshStandardMaterial({color:'#6e655c',roughness:1,flatShading:true});
  const under=new THREE.Group();
  const core=[[SKY.R*.88,22,0,0],[SKY.R*.65,38,SKY.R*.1,SKY.R*.06],[SKY.R*.62,34,-SKY.R*.14,SKY.R*.04],[SKY.R*.42,48,SKY.R*.04,-SKY.R*.08],[SKY.R*.4,44,-SKY.R*.07,SKY.R*.11]];
  let yy=8;
  for(const [r,h,ox,oz] of core){
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,8+(rng()*3|0)),rockM);
    m.position.set(ox,yy-h*.5,oz);m.rotation.y=rng()*6.283;m.scale.set(1+rng()*.25,1,1+rng()*.25);under.add(m);yy-=h*.58;
  }
  for(let i=0;i<32;i++){
    const a=rng()*6.283,r=SKY.R*(.12+rng()*.72);
    const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(2.5+rng()*11,0),rockM);
    rk.position.set(Math.cos(a)*r,-8-rng()*110,Math.sin(a)*r);
    rk.rotation.set(rng()*3,rng()*3,rng()*3);rk.scale.set(1,.55+rng()*.7,1);under.add(rk);
  }
  for(let i=0;i<12;i++){
    const a=rng()*6.283,r=SKY.R*(.08+rng()*.5),len=50+rng()*80,rad=1.8+rng()*3.2;
    const m=new THREE.Mesh(new THREE.ConeGeometry(rad,len,5),rockM);
    m.position.set(Math.cos(a)*r,-25-rng()*35-len*.35,Math.sin(a)*r);
    m.rotation.set((rng()-.5)*.55,rng()*6.283,(rng()-.5)*.55);under.add(m);
  }
  const crystalM=new THREE.MeshStandardMaterial({color:'#a8e8ff',emissive:'#40c0ff',emissiveIntensity:1.1,roughness:.2});
  for(let i=0;i<9;i++){
    const a=rng()*6.283,r=SKY.R*(.15+rng()*.4);
    const cr=new THREE.Mesh(new THREE.OctahedronGeometry(1.2+rng()*1.8,0),crystalM);
    cr.position.set(Math.cos(a)*r,-15-rng()*40,Math.sin(a)*r);
    cr.rotation.set(rng(),rng(),rng());under.add(cr);
  }
  under.position.set(SKY.x,SKY.base-2,SKY.z);under.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(under);

  for(let i=0;i<11;i++){
    const a=i/11*6.283+rng()*.25,r=SKY.R*(.9+rng()*.18);
    const x=SKY.x+Math.cos(a)*r,z=SKY.z+Math.sin(a)*r,base=SKYH(x-SKY.x,z-SKY.z),h=12+rng()*26;
    const m=new THREE.Mesh(new THREE.ConeGeometry(3.5+rng()*4,h,6),rockM);
    m.position.set(x,base+h*.28,z);m.rotation.set((rng()-.5)*.25,rng()*6.283,(rng()-.5)*.25);m.castShadow=true;scene.add(m);
    solids.push({x,z,r:3.5});
  }

  {
    const a=2.35,ex=SKY.x+Math.cos(a)*SKY.R*.88,ez=SKY.z+Math.sin(a)*SKY.R*.88,top_y=SKYH(ex-SKY.x,ez-SKY.z);
    const wf=new THREE.Mesh(new THREE.PlaneGeometry(18,140),new THREE.MeshStandardMaterial({color:'#c8f0ff',roughness:.12,metalness:.15,transparent:true,opacity:.72,side:THREE.DoubleSide}));
    wf.position.set(ex+Math.cos(a)*7,top_y-68,ez+Math.sin(a)*7);wf.rotation.y=a+Math.PI/2;scene.add(wf);
    for(let k=0;k<3;k++){
      const w2=new THREE.Mesh(new THREE.PlaneGeometry(6+rng()*5,90+rng()*40),new THREE.MeshStandardMaterial({color:'#b0e8ff',roughness:.2,transparent:true,opacity:.45,side:THREE.DoubleSide}));
      w2.position.set(ex+Math.cos(a)*(5+k*2)+(rng()-.5)*4,top_y-50-rng()*20,ez+Math.sin(a)*(5+k*2)+(rng()-.5)*4);
      w2.rotation.y=a+Math.PI/2+(rng()-.5)*.2;scene.add(w2);
    }
    const mist=new THREE.Mesh(new THREE.CircleGeometry(22,24),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.38}));
    mist.rotation.x=-Math.PI/2;mist.position.set(ex+Math.cos(a)*8,top_y-130,ez+Math.sin(a)*8);scene.add(mist);
    const caveM=new THREE.MeshStandardMaterial({color:'#2a2520',roughness:1});
    const cave=new THREE.Mesh(new THREE.CylinderGeometry(5.5,6.5,9,12,1,true),caveM);
    cave.position.set(ex-Math.cos(a)*4,top_y-3,ez-Math.sin(a)*4);cave.rotation.z=Math.PI/2;cave.rotation.y=a;scene.add(cave);
