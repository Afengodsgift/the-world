// Bowsprit: the pointy stick at the front of the galleon is walkable (Decks.plank, data/ship.js `sprit`). Stand at its tip and you can "farm aura":
// a gold aura column + rising sparkles around you, facing the horizon, and an aura counter that ticks up while you hold the pose. Move to stop.
// Globals at runtime: THREE, scene, S, me, Ship, Fleet, SHIP, Interaction, Systems.
const Bowsprit=(()=>{
  const C=SHIP;let on=false,total=0,grp=null,col=null,pts=null,chip=null,t=0,tick=0,built=false;
  const NP=36,PV=new Float32Array(NP);
  // is the player standing on the tip of the sprit of the player ship?
  function atTip(){
    if(typeof S==='undefined'||!S._dk||S._dk.id!=='ship'||S.flying)return false;
    const K=C.cls[C.player]||{},sp=K.sprit;if(!sp)return false;
    return S._dk.z>=sp.tip&&Math.abs(S._dk.x)<sp.hw+.3}
  function start(){if(!atTip())return;on=true;t=0}
  function stop(){on=false}
  function mkTex(){const c=document.createElement('canvas');c.width=4;c.height=128;const g=c.getContext('2d'),gr=g.createLinearGradient(0,128,0,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.25,'rgba(255,255,255,.55)');gr.addColorStop(.7,'rgba(255,255,255,.18)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,4,128);const tx=new THREE.CanvasTexture(c);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;return tx}
  function dot(){const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),r=g.createRadialGradient(16,16,1,16,16,15);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);return new THREE.CanvasTexture(c)}
  function buildFx(){
    grp=new THREE.Group();grp.visible=false;
    col=new THREE.Mesh(new THREE.CylinderGeometry(.95,1.25,3.6,24,1,true),new THREE.MeshBasicMaterial({map:mkTex(),color:'#ffd66b',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));
    col.position.y=1.7;col.renderOrder=4;grp.add(col);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NP*3),3));
    for(let i=0;i<NP;i++)PV[i]=Math.random();
    pts=new THREE.Points(g,new THREE.PointsMaterial({map:dot(),size:.22,sizeAttenuation:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:'#bff3ff',fog:false}));pts.frustumCulled=false;pts.renderOrder=4;grp.add(pts);
    scene.add(grp)}
  function step(dt){
    if(!built)return;
    if(on&&(Math.hypot(S.gvx||0,S.gvz||0)>.8||!atTip()||S.flying||(typeof Fleet!=='undefined'&&Fleet._me.down>0)))on=false;
    if(!grp&&on&&typeof THREE!=='undefined'&&typeof scene!=='undefined')try{buildFx()}catch(e){}
    if(grp){grp.visible=on;
      if(on){t+=dt;grp.position.set(S.x,S.y,S.z);const pulse=.75+.25*Math.sin(t*3);col.material.opacity=Math.min(1,t*1.2)*pulse;col.material.map.offset.y-=dt*.7;col.scale.setScalar(1+.06*Math.sin(t*2.2));
        col.material.color.setHSL(.12+.08*Math.sin(t*.9),.95,.6);
        const a=pts.geometry.attributes.position.array;for(let i=0;i<NP;i++){PV[i]=(PV[i]+dt*(.18+(i%5)*.05))%1;const ang=i*2.4+t*.9,r=.55+.55*Math.sin(i*1.7)*.5+.3;a[i*3]=Math.cos(ang)*r;a[i*3+1]=PV[i]*3.4;a[i*3+2]=Math.sin(ang)*r}
        pts.geometry.attributes.position.needsUpdate=true;
        S.rot=Ship.vessel().pose.h;try{me.rotation.y=S.rot}catch(e){}                       // face the horizon
        tick+=dt;if(tick>=1){tick=0;total+=1+Math.floor(t/10);refresh()}}}
    if(chip&&on!==chip._s){chip._s=on;chip.style.display=on?'block':'none'}}
  function refresh(){if(chip)chip.textContent='✨ Aura +'+total}
  function build(){
    if(built)return;built=true;
    try{chip=document.createElement('div');chip.id='aurachip';chip.style.cssText='position:fixed;z-index:8;left:50%;top:18%;transform:translateX(-50%);padding:6px 16px;border-radius:20px;background:#2b1b4acc;color:#ffd66b;font:800 18px sans-serif;border:2px solid #ffd66b88;display:none;pointer-events:none;text-shadow:0 0 8px #ffb300';document.body.appendChild(chip);refresh()}catch(e){}
    Systems.add('bowsprit',step);
    Interaction.register('bowsprit-aura','Farm aura 😎',()=>built&&!on&&atTip()&&!Ship.locked(),start)}
  return {build,atTip,start,stop,on:()=>on,total:()=>total,_step:step};
})();
