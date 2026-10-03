// Fx: small shared visual helpers (cached materials, mesh helper, particle bursts) for the systems
// that add things to the world. Runs its own per-frame update through Systems.
const Fx=(()=>{
  const MAT={},BM={},parts=[];let geo=null,on=false;
  const mat=(c,o)=>{const k=c+(o?JSON.stringify(o):'');return MAT[k]||(MAT[k]=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:1,flatShading:true},o||{})))};
  const basic=c=>BM[c]||(BM[c]=new THREE.MeshBasicMaterial({color:c}));
  const M=(g,m,x,y,z)=>{const o=new THREE.Mesh(g,m);o.position.set(x||0,y||0,z||0);o.castShadow=true;return o};
  function burst(x,y,z,color,n){
    if(!on){on=true;Systems.add('fx',step)}
    geo=geo||new THREE.OctahedronGeometry(.12,0);
    for(let i=0;i<(n||14);i++){const m=new THREE.Mesh(geo,basic(color||'#ffe08a')),a=Math.random()*6.283,s=2+Math.random()*3;
      m.position.set(x,y+.8,z);scene.add(m);parts.push({m,vx:Math.cos(a)*s,vy:3+Math.random()*4,vz:Math.sin(a)*s,life:.9})}
  }
  function step(dt){
    for(let i=parts.length-1;i>=0;i--){const f=parts[i];f.life-=dt;f.vy-=14*dt;f.m.position.x+=f.vx*dt;f.m.position.y+=f.vy*dt;f.m.position.z+=f.vz*dt;f.m.rotation.y+=dt*6;
      if(f.life<=0){scene.remove(f.m);parts.splice(i,1)}}
  }
  return {mat,basic,M,burst,count:()=>parts.length,_step:step};
})();
