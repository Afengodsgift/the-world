    for(let i=0;i<6;i++){
      const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.7+rng()*.9,0),crystalM);
      cr.position.set(ex-Math.cos(a)*(6+i*1.2)+(rng()-.5)*2,top_y-1+rng()*3,ez-Math.sin(a)*(6+i*1.2)+(rng()-.5)*2);
      cr.rotation.set(rng(),rng(),rng());scene.add(cr);
    }
    const pond=new THREE.Mesh(new THREE.CircleGeometry(11,28),new THREE.MeshStandardMaterial({color:'#3a9ad4',roughness:.05,metalness:.3,transparent:true,opacity:.85}));
    pond.rotation.x=-Math.PI/2;pond.position.set(ex-Math.cos(a)*18,top_y+.15,ez-Math.sin(a)*18);scene.add(pond);
  }
  {
    const vx=SKY.x+18,vz=SKY.z-35;
    const vy=SKYH(18,-35);
    for(let i=0;i<3;i++){
      const hx=vx+(i-1)*11,hz=vz+(i===1?4:0);
      place(scene,'wall-wood',hx,vy,hz,0,2.4);
      place(scene,'wall-wood-door',hx,vy,hz+1.2,0,2.4);
      place(scene,'roof-gable',hx,vy+2.6,hz,0,2.6);
    }
    place(scene,'stall-green',vx-14,vy,vz+8,1.2,1.6);
    place(scene,'stall-red',vx+14,vy,vz+6,-.8,1.5);
    place(scene,'lantern',vx,vy+0.1,vz+10,0,1.3);
    place(scene,'lantern',vx-8,vy+0.1,vz-2,0,1.2);
    place(scene,'fountain-round',vx,vy,vz-8,0,1.4);
    const benchM=new THREE.MeshStandardMaterial({color:'#8b6914',roughness:.8});
    for(let i=0;i<4;i++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(2.2,.35,.55),benchM);
      b.position.set(vx+(i%2?6:-6),vy+.25,vz+(i<2?12:-4));b.castShadow=true;scene.add(b);
    }
  }
  {
    const cx=SKY.x-55,cz=SKY.z+70,cy=SKYH(-55,70);
    const logM=new THREE.MeshStandardMaterial({color:'#5c3a1e',roughness:1});
    for(let i=0;i<5;i++){
      const a=i/5*6.283,log=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,2.4,8),logM);
      log.position.set(cx+Math.cos(a)*3.2,cy+.3,cz+Math.sin(a)*3.2);log.rotation.z=Math.PI/2;log.rotation.y=a;log.castShadow=true;scene.add(log);
    }
    const fire=new THREE.Mesh(new THREE.SphereGeometry(.9,10,8),new THREE.MeshStandardMaterial({color:'#ff6a00',emissive:'#ff4500',emissiveIntensity:1.4,transparent:true,opacity:.9}));
    fire.position.set(cx,cy+1.1,cz);scene.add(fire);
    place(scene,'lantern',cx+5,cy,cz-3,0,1.1);
  }
  {
    const sx=SKY.x+5,sz=SKY.z-90,sy=SKYH(5,-90)+1;
    const plat=new THREE.Mesh(new THREE.CylinderGeometry(14,15,1.2,28),new THREE.MeshStandardMaterial({color:'#c8c0b0',roughness:.7}));
    plat.position.set(sx,sy,sz);plat.receiveShadow=true;plat.castShadow=true;scene.add(plat);
    const archM=new THREE.MeshStandardMaterial({color:'#a09888',roughness:.85,flatShading:true});
    for(let i=0;i<4;i++){
      const a=i/4*Math.PI*2;
      const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.6,9,1.6),archM);
      pillar.position.set(sx+Math.cos(a)*9,sy+4.5,sz+Math.sin(a)*9);pillar.castShadow=true;scene.add(pillar);
    }
    const core=new THREE.Mesh(new THREE.OctahedronGeometry(2.8,0),new THREE.MeshStandardMaterial({color:'#ffe8a0',emissive:'#ffb020',emissiveIntensity:1.3,roughness:.15}));
    core.position.set(sx,sy+6,sz);scene.add(core);
    solids.push({x:sx,z:sz,r:12,h:sy+2});
  }
  const kinds=['tree_pineDefaultA','tree_pineRoundA','tree_oak','tree_fat'],P={},TH={tree_pineDefaultA:9,tree_pineRoundA:8,tree_oak:7,tree_fat:6.5,plant_bushLarge:1.4,stone_largeA:2.2,rock_tallB:2.6};
  const addk=(n,x,z,s)=>{(P[n]=P[n]||[]).push({x,y:SKYH(x-SKY.x,z-SKY.z),z,ry:rng()*6.283,s})};
  const clusters=[[-40,-20,12],[30,25,10],[55,-50,8],[-60,40,9],[10,60,7],[-20,-70,11],[70,10,6]];
  for(const [cx,cz,n] of clusters){
    for(let i=0;i<n;i++){
      const a=rng()*6.283,r=3+rng()*14;
      addk(kinds[rng()*4|0],SKY.x+cx+Math.cos(a)*r,SKY.z+cz+Math.sin(a)*r,.75+rng()*.55);
    }
  }
  for(let i=0;i<28;i++){const a=rng()*6.283,r=rng()*SKY.R*.7;addk('plant_bushLarge',SKY.x+Math.cos(a)*r,SKY.z+Math.sin(a)*r,.85+rng()*.7)}
  for(let i=0;i<16;i++){const a=rng()*6.283,r=rng()*SKY.R*.82;addk(rng()<.5?'stone_largeA':'rock_tallB',SKY.x+Math.cos(a)*r,SKY.z+Math.sin(a)*r,.55+rng()*1.1)}
