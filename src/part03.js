  o.scale.set(sx,sy===undefined?sx:sy,sz===undefined?sx:sz);o.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true}});par.add(o);return o;
}
function house(hx,hz,ry,w,d){
  const g=new THREE.Group(),S=2.6;
  for(let i=0;i<w;i++)for(let j=0;j<d;j++){
    const cx=(i-(w-1)/2)*S,cz=(j-(d-1)/2)*S,sides=[];
    if(i===w-1)sides.push([1,0]);if(i===0)sides.push([-1,0]);if(j===d-1)sides.push([0,1]);if(j===0)sides.push([0,-1]);
    for(const [dx,dz] of sides){
      const n=(dz===1&&i===(w>>1))?'wall-wood-door':((i+j+dx+dz)&1?'wall-wood-window-small':'wall-wood');
      place(g,n,cx,0,cz,Math.atan2(-dz,dx),S);
    }
  }
  for(let i=0;i<w;i++){const cx=(i-(w-1)/2)*S,end=i===0||i===w-1;
    place(g,end?'roof-gable-end':'roof-gable',cx,S,0,i===w-1?Math.PI:0,S,S,S*d)}
  g.position.set(hx,H(hx,hz)+.05,hz);g.rotation.y=ry;scene.add(g);solids.push({x:hx,z:hz,r:S*Math.max(w,d)*.5*1.15});
}
function buildWorld(code){
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#cfe3f2');
  scene.fog=new THREE.Fog('#cfe3f2',150,1700);
  scene.add(new THREE.HemisphereLight('#bcd7ff','#7d7355',.75));scene.add(new THREE.AmbientLight('#ffffff',.12));
  const sd=new THREE.Vector3(.5,.62,.32).normalize();
  sun=new THREE.DirectionalLight('#fff0d2',1.35);sun.userData.sd=sd;sun.position.copy(sd).multiplyScalar(140);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);const sc=sun.shadow.camera;sc.left=-75;sc.right=75;sc.top=75;sc.bottom=-75;sc.near=10;sc.far=320;sun.shadow.bias=-.0004;sun.shadow.normalBias=.6;
  scene.add(sun);scene.add(sun.target);
  sky=new THREE.Mesh(new THREE.SphereGeometry(2800,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,uniforms:{sd:{value:sd}},
    vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vd;uniform vec3 sd;void main(){vec3 d=normalize(vd);float h=clamp(d.y,0.,1.);vec3 hor=vec3(.81,.89,.95),zen=vec3(.2,.42,.74);vec3 c=mix(hor,zen,pow(h,.5));float s=max(dot(d,sd),0.);c+=vec3(1.,.86,.62)*(pow(s,700.)*2.5+pow(s,10.)*.22);if(d.y<0.)c=mix(hor,vec3(.6,.72,.8),clamp(-d.y*4.,0.,1.));gl_FragColor=vec4(c,1.);}'}));
  sky.renderOrder=-1;scene.add(sky);
  terrain(0,0,600,200);
  for(const I of ISL){terrain(I.x,I.z,I.R*2.6,Math.min(120,Math.round(I.R*2.6/6)));
    const bm=new THREE.Mesh(new THREE.CylinderGeometry(2,2,140,8,1,true),new THREE.MeshBasicMaterial({color:I.c,transparent:true,opacity:.4,fog:false,side:THREE.DoubleSide}));
    bm.position.set(I.x,H(I.x,I.z)+70,I.z);scene.add(bm)}
  const sea=new THREE.Mesh(new THREE.CircleGeometry(6000,48),new THREE.MeshStandardMaterial({color:'#2f6f9a',roughness:.12,metalness:.15,transparent:true,opacity:.82}));
  {const cv=document.createElement('canvas');cv.width=cv.height=256;const cx2=cv.getContext('2d'),im2=cx2.createImageData?cx2.createImageData(256,256):null;
   if(im2){for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=x/256*6.2832,b=y/256*6.2832,v=128+40*Math.sin(a*3+Math.sin(b*2))+30*Math.sin(b*5+a)+20*Math.sin(a*8-b*6);const i=(y*256+x)*4;im2.data[i]=im2.data[i+1]=im2.data[i+2]=v;im2.data[i+3]=255}cx2.putImageData(im2,0,0)}
   seaTex=new THREE.CanvasTexture(cv);seaTex.wrapS=seaTex.wrapT=THREE.RepeatWrapping;seaTex.repeat.set(500,500);sea.material.bumpMap=seaTex;sea.material.bumpScale=.35}
  sea.rotation.x=-Math.PI/2;sea.position.y=-.3;scene.add(sea);
  rng=mulberry(hashSeed(code));
  if(AM.plant_bushLarge)AM.plant_bushLarge.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.side=THREE.DoubleSide;o.material.emissive=new THREE.Color('#2a6a30')}});
  const dist=(x,z)=>Math.hypot(x-TOWN.x,z-TOWN.z),P={};
  const add=(n,x,z,s)=>{(P[n]=P[n]||[]).push({x,y:H(x,z),z,ry:rng()*6.283,s})};
  // forest (west), scattered trees, beach palms, bushes, rocks
  const kinds=['tree_pineDefaultA','tree_pineRoundA','tree_oak','tree_fat'];
  for(let i=0,n=0;i<1500&&n<300;i++){const a=rng()*6.283,r=rng()*80,x=-110+Math.cos(a)*r,z=40+Math.sin(a)*r,h=H(x,z);
    if(h<.8||h>18||dist(x,z)<50)continue;add(kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
  for(let i=0,n=0;i<900&&n<70;i++){const a=rng()*6.283,r=rng()*210,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
    if(h<.8||h>22||dist(x,z)<50)continue;add(kinds[rng()*4|0],x,z,.8+rng()*.5);n++}
  for(let i=0,n=0;i<900&&n<45;i++){const a=rng()*6.283,r=170+rng()*50,x=Math.cos(a)*r,z=Math.sin(a)*r,h=H(x,z);
