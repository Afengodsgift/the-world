    if(h<.4||h>2)continue;add('tree_palmTall',x,z,.8+rng()*.4);n++}
  for(let i=0,n=0;i<900&&n<120;i++){const a=rng()*6.283,r=rng()*215,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<.6||h>26||dist(x,z)<40)continue;add('plant_bushLarge',x,z,.7+rng()*.7);n++}
  for(let i=0,n=0;i<900&&n<60;i++){const a=rng()*6.283,r=15+rng()*200,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<-.2||dist(x,z)<40)continue;add(rng()<.5?'stone_largeA':'rock_tallB',x,z,.5+rng()*.9);n++}
  for(const I of ISL){const palm=I.pk<15;
    for(let i=0,n=0;i<1500&&n<Math.round(I.R*.6);i++){const a=rng()*6.283,r=rng()*I.R*.95,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r,h=H(x,z);
      if(h<(palm?.4:1.2)||h>16)continue;add(palm?'tree_palmTall':kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
    for(let i=0,n=0;i<600&&n<24;i++){const a=rng()*6.283,r=rng()*I.R*.9,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;
      if(H(x,z)<-.2)continue;add(rng()<.5?'stone_largeA':'rock_tallB',x,z,.5+rng()*.9);n++}}
  const TH={tree_pineDefaultA:9,tree_pineRoundA:8,tree_oak:7,tree_fat:6.5,tree_palmTall:8,plant_bushLarge:.9,stone_largeA:.9,rock_tallB:2.6};
  for(const nm in P){const f=scatter(nm,TH[nm],P[nm]);if(!f)continue;
    for(const p of P[nm]){
      if(nm.startsWith('tree_'))solids.push({x:p.x,z:p.z,r:f.w*p.s*(nm==='tree_palmTall'?.05:.12)});
      else if(nm.endsWith('A')||nm.startsWith('rock'))solids.push({x:p.x,z:p.z,r:f.w*p.s*.38,h:p.y+TH[nm]*p.s*.85})}}
// town: fountain + golden pillar, lanterns, stalls, cottages facing the plaza
  place(scene,'fountain-round',TOWN.x,1.6,TOWN.z,0,6);solids.push({x:TOWN.x,z:TOWN.z,r:5.4});
  pil=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,3,10),new THREE.MeshStandardMaterial({color:'#ffd27a',emissive:'#000000'}));pil.position.set(TOWN.x,3.4,TOWN.z);scene.add(pil);
  for(let i=0;i<8;i++){const a=i/8*6.283,x=TOWN.x+Math.cos(a)*11,z=TOWN.z+Math.sin(a)*11;place(scene,'lantern',x,H(x,z),z,0,2.2);solids.push({x,z,r:.25})}
  [['stall-red',0.3],['stall-green',2.4],['stall-red',4.5]].forEach(([n,a])=>{const x=TOWN.x+Math.cos(a)*17,z=TOWN.z+Math.sin(a)*17;
    place(scene,n,x,H(x,z),z,Math.atan2(-Math.cos(a),-Math.sin(a))+Math.PI/2*0,3);solids.push({x,z,r:1.8})});
  {const x=TOWN.x-16,z=TOWN.z+15;place(scene,'cart',x,H(x,z),z,.6,2.6);solids.push({x,z,r:1.6})}
  for(let i=0;i<8;i++){const a=i/8*6.283+.2;
    house(TOWN.x+Math.cos(a)*30,TOWN.z+Math.sin(a)*30,Math.atan2(-Math.cos(a),-Math.sin(a)),3,3)}

  // cave mouth on the mountain's south face
  const cx=18,cz=-88,cg=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:'#7a7f8c'}),CS=2.4;
  cg.position.set(cx,H(cx,cz),cz);cg.scale.setScalar(CS);
  for(const px of [-2.4,2.4]){const p=new THREE.Mesh(new THREE.BoxGeometry(1.4,5,1.6),stone);p.position.set(px,1.5,0);cg.add(p);solids.push({x:cx+px*CS,z:cz,r:.7*CS})}
  const lin=new THREE.Mesh(new THREE.BoxGeometry(6.4,1.3,1.8),stone);lin.position.y=4.3;cg.add(lin);
  const dk=new THREE.Mesh(new THREE.BoxGeometry(3.6,4.2,.4),new THREE.MeshBasicMaterial({color:'#05060c'}));dk.position.set(0,1.9,-.6);cg.add(dk);
  solids.push({x:cx,z:cz-CS,r:1.6*CS});scene.add(cg);
  // collectible star shards
  const om=new THREE.MeshStandardMaterial({color:'#ffe08a',emissive:'#ffb020',emissiveIntensity:.9}),pts=[[0,-137],[18,-83]];
  for(let i=0;i<3;i++){const a=rng()*6.283;pts.push([Math.cos(a)*235,Math.sin(a)*235])}
  while(pts.length<40){const a=rng()*6.283,r=12+rng()*195,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);if(h>.5&&h<40&&dist(x,z)>45)pts.push([x,z])}
  for(const I of ISL)for(let i=0;i<8;i++){const a=rng()*6.283,r=rng()*I.R*.6,x=I.x+Math.cos(a)*r,z=I.z+Math.sin(a)*r;if(H(x,z)>.5)pts.push([x,z])}
  for(const [x,z] of pts){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.5),om),y=Math.max(H(x,z),-.8)+1.2;m.position.set(x,y,z);scene.add(m);orbs.push({m,x,z,y,on:true})}
  buildRace();buildHunt();buildSeaLife();buildSkyIsland();buildKartTrack();
}
function buildSkyIsland(){
  const geo=new THREE.PlaneGeometry(SKY.R*2.8,SKY.R*2.8,80,80);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,cols=new Float32Array(pos.count*3),c=new THREE.Color();
  const cGrass1=new THREE.Color('#5fa84a'),cGrass2=new THREE.Color('#8fd46a'),cDirt=new THREE.Color('#9a8b6a'),cRock=new THREE.Color('#8a8074'),cPath=new THREE.Color('#c9b896');
  for(let i=0;i<pos.count;i++){
    const dx=pos.getX(i),dz=pos.getZ(i),d=Math.hypot(dx,dz),y=SKYH(dx,dz);
    pos.setY(i,y-SKY.base);
