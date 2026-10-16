// Fishing on the floating island: each pond has a pier (SkyIsland.js). Stand at the end and press Use: cast -> wait -> bite -> (tap Reel in!) -> reel -> catch.
// Poses are the baked KayKit fishing clips (hidden emotes fish_cast / fish_idle / fish_bite / fish_reel / fish_catch), so your partner sees them too via the normal 'em' event;
// a catch is also broadcast ('fc') so they get a banner. Rod is a primitive attached to the right-hand bone (hidden unless a fishing pose is playing).
// Globals read: THREE, scene, S, me, chan, myId, others, banner, Interaction, splash (SeaLife.js), fishInst (SeaLife.js), loadEmotes, EMO, emoStop.
const Fishing=(()=>{
  const ROD_Q=[-0.18679,0,-0.76778,0.61288]; // rod axis in the right-hand bone frame, solved from the fishing poses (tools: see git history)
  const FISH=[
    {n:'Minnow',e:'🐟',w:34,kg:[.05,.2],col:'#b9d6e6',tier:'common',mdl:'Fish3'},
    {n:'Perch',e:'🐟',w:26,kg:[.3,1.1],col:'#8fb86b',tier:'common',mdl:'Fish1'},
    {n:'Trout',e:'🐠',w:18,kg:[.8,2.4],col:'#c98f6b',tier:'common',mdl:'Fish2'},
    {n:'Rainbow Trout',e:'🌈',w:9,kg:[1.5,3.6],col:'#d56fb0',tier:'uncommon',mdl:'Fish2'},
    {n:'Old Boot',e:'👢',w:7,kg:[.3,.8],col:'#5b4636',tier:'junk',mdl:null},
    {n:'Sky Eel',e:'🐍',w:4,kg:[3,8],col:'#6fd0c0',tier:'rare',mdl:'Fish3'},
    {n:'Golden Koi',e:'✨',w:3,kg:[2,6],col:'#ffc83d',tier:'rare',mdl:'Fish1'}];
  const st={state:'none',t:0,wait:0,biteT:0,spot:null,spots:[],target:new THREE.Vector3(),from:new THREE.Vector3(),bob:null,line:null,lpos:null,show:null,pick:null,kg:0,showT:0,rec:{count:0,best:null,species:{}},tip:new THREE.Vector3(),rt:0};
  try{const r=JSON.parse(localStorage.getItem('w4fish')||'null');if(r&&typeof r.count==='number')st.rec=Object.assign(st.rec,r)}catch(e){}
  const save=()=>{try{localStorage.setItem('w4fish',JSON.stringify(st.rec))}catch(e){}};
  const v=new THREE.Vector3();
  // ---------- rod ----------
  function attachRod(u,bones){
    if(!bones.RightHand||u.rod)return;
    const g=new THREE.Group(),wood=new THREE.MeshLambertMaterial({color:'#7a5230',flatShading:true}),cork=new THREE.MeshLambertMaterial({color:'#c9a36a',flatShading:true}),tipM=new THREE.MeshLambertMaterial({color:'#e24a3b',flatShading:true});
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.012,.034,2.5,6),wood);shaft.position.y=1.2;g.add(shaft);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.42,8),cork);grip.position.y=-.17;g.add(grip); // grip stops ~.4 m behind the hand so it does not poke through the chest
    const bead=new THREE.Mesh(new THREE.IcosahedronGeometry(.035,0),tipM);bead.position.y=2.46;g.add(bead);
    const tip=new THREE.Object3D();tip.position.y=2.48;g.add(tip);
    g.scale.setScalar(1/50);g.quaternion.set(...ROD_Q); // the bone is ~50x world scale (Root 100 x model 0.5), same trick as the pan
    g.visible=false;bones.RightHand.add(g);u.rod=g;u.rodTip=tip}
  // ---------- world objects: bobber, line, caught-fish display ----------
  function build(spots){
    st.spots=spots||[];
    const b=new THREE.Group(),ball=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshLambertMaterial({color:'#ffffff'})),cap=new THREE.Mesh(new THREE.SphereGeometry(.205,10,5,0,Math.PI*2,0,Math.PI/2),new THREE.MeshLambertMaterial({color:'#e0382d'})),ant=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.35,5),new THREE.MeshLambertMaterial({color:'#ffcf3a'}));
    ant.position.y=.35;b.add(ball,cap,ant);b.visible=false;scene.add(b);st.bob=b;
    st.lpos=new Float32Array(6);const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(st.lpos,3).setUsage(THREE.DynamicDrawUsage));
    st.line=new THREE.Line(lg,new THREE.LineBasicMaterial({color:'#f4f4f4',transparent:true,opacity:.85}));st.line.frustumCulled=false;st.line.visible=false;scene.add(st.line);
    if(typeof Interaction!=='undefined'){
      Interaction.register('fish-cast','Cast line',()=>(st.state==='none'||st.state==='ready')&&!!nearSpot()&&!S.flying&&S.grounded&&S.state!=='swim',()=>startCast());
      Interaction.register('fish-reel','Reel in!',()=>st.state==='wait'||st.state==='bite',()=>pull())}}
  function nearSpot(){let best=null,bd=2.8;for(const sp of st.spots){const d=Math.hypot(S.x-sp.x,S.z-sp.z);if(d<bd&&Math.abs(S.y-sp.y)<3){bd=d;best=sp}}return best}
  function pose(id){ // play a fishing pose on me (and tell the partner through the normal emote event)
    if(!me)return;me.userData.emoteReq=id;if(typeof chan!=='undefined'&&chan)chan.send({type:'broadcast',event:'em',payload:{from:myId,e:id}})}
  // ---------- flow ----------
  function startCast(){
    if(typeof EMO!=='undefined'&&!EMO.def.fish_cast){loadEmotes().then(startCast).catch(()=>banner("Couldn't load the fishing animations",'🎣'));return}
    const sp=nearSpot();if(!sp)return;st.spot=sp;S.x=sp.x;S.z=sp.z;S.rot=Math.atan2(sp.fx,sp.fz);S.kx=0;S.kz=0;
    const d=3.8+Math.random()*3.6,sd=(Math.random()-.5)*4,nx=-sp.fz,nz=sp.fx;let tx=sp.x+sp.fx*d+nx*sd,tz=sp.z+sp.fz*d+nz*sd;
    const dx=tx-sp.px,dz=tz-sp.pz,dl=Math.hypot(dx,dz),lim=sp.pr-1.6;if(dl>lim){tx=sp.px+dx/dl*lim;tz=sp.pz+dz/dl*lim} // keep the bobber inside the pond
    st.target.set(tx,sp.surf+.04,tz);st.state='cast';st.t=0;me.userData.fishing=true;pose('fish_cast')}
  function pull(){
    if(st.state==='bite'){st.state='reel';st.t=0;st.from.copy(st.bob.position);pose('fish_reel')}
    else if(st.state==='wait'){banner('Too early, the fish got spooked','🎣');splash(st.bob.position.x,st.bob.position.z,1.2,1,st.spot.surf+.02);hideLine();st.state='ready';pose('fish_idle')}}
  function hideLine(){st.bob.visible=false;st.line.visible=false}
  function stop(){st.state='none';hideLine();if(st.show)st.show.visible=false;if(me){me.userData.fishing=false;if(typeof emoStop==='function'&&me.userData.hold&&/^fish_/.test(me.userData.hold.id||''))emoStop(me.userData)}}
  function roll(){let tot=0;for(const f of FISH)tot+=f.w;let r=Math.random()*tot;for(const f of FISH){r-=f.w;if(r<=0)return f}return FISH[0]}
  function landCatch(){
    const f=roll(),kg=+(f.kg[0]+(f.kg[1]-f.kg[0])*Math.pow(Math.random(),1.5)).toFixed(2);st.pick=f;st.kg=kg;hideLine();
    const R=st.rec;R.count++;R.species[f.n]=(R.species[f.n]||0)+1;let rec=false;if(f.tier!=='junk'&&(!R.best||kg>R.best.kg)){R.best={n:f.n,kg};rec=true}save();
    banner(f.e+' '+f.n+'  ·  '+kg.toFixed(2)+' kg'+(rec&&R.count>1?'  ·  new record!':''),f.tier==='rare'?'RARE CATCH!':f.tier==='junk'?'HMM...':'CAUGHT!');
    if(typeof chan!=='undefined'&&chan)chan.send({type:'broadcast',event:'fc',payload:{from:myId,n:f.n,e:f.e,kg,t:f.tier}});
    if(typeof updateHud==='function')updateHud();
    // show the fish held up
    let m=st.show;if(!m){m=st.show=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:'#ffffff',flatShading:true}));m.frustumCulled=false;scene.add(m)}
    const fi=f.mdl&&typeof fishInst!=='undefined'?fishInst[f.mdl]:null,len=Math.min(1.7,.3+kg*.2);
    if(fi){m.geometry=fi.im.geometry;m.scale.setScalar(len)}else{m.geometry=new THREE.BoxGeometry(.4,.55,.22);m.scale.setScalar(1)}
    m.material.color.set(f.col);m.material.emissive.set(f.tier==='rare'?f.col:'#000000');m.material.emissiveIntensity=f.tier==='rare'?.35:0;m.visible=true;st.showT=0;
    st.state='catch';st.t=0;pose('fish_catch')}
  function onCatch(p){ // partner's catch banner
    if(!p||p.from===myId)return;const o=others.get(p.from),nm=(o&&o.group.userData.nm)||'Your partner';banner(nm+' caught '+p.e+' '+p.n+'  ·  '+(+p.kg).toFixed(2)+' kg',p.t==='rare'?'RARE CATCH!':'FISHING')}
  function tick(dt,t){
    if(!st.bob||st.state==='none')return;
    if(!me)return;const sp=st.spot;
    if(Math.hypot(S.x-sp.x,S.z-sp.z)>3.4||S.flying||S.state==='swim'||!S.grounded&&S.y>sp.y+2){stop();return}
    st.t+=dt;const bob=st.bob,surf=sp.surf;
    const tip=me.userData.rodTip;if(tip){tip.updateWorldMatrix(true,false);st.tip.setFromMatrixPosition(tip.matrixWorld)}else st.tip.set(S.x,S.y+1.7,S.z);
    switch(st.state){
      case 'cast':
        if(st.t>=.7&&st.t<1.4){const u=(st.t-.7)/.7;bob.visible=true;bob.position.lerpVectors(st.tip,st.target,u);bob.position.y+=Math.sin(u*Math.PI)*3.2}
        else if(st.t>=1.4){if(!bob.visible||bob.userData.flying){}bob.visible=true;bob.position.copy(st.target);if(!bob.userData.landed){bob.userData.landed=true;splash(st.target.x,st.target.z,1.3,1.1,surf+.02)}}
        if(st.t>=1.86){st.state='wait';st.t=0;st.wait=2.2+Math.random()*4.6;st.rt=0;bob.userData.landed=false;pose('fish_idle')}break;
      case 'wait':
        bob.position.set(st.target.x,surf+.05+Math.sin(t/420)*.035,st.target.z);st.rt+=dt;if(st.rt>1.15){st.rt=0;splash(st.target.x,st.target.z,.55,1.2,surf+.02)}
        if(st.t>=st.wait){st.state='bite';st.t=0;st.biteT=0;pose('fish_bite');banner('Bite! Tap Reel in!','🎣');splash(st.target.x,st.target.z,1.6,1,surf+.02)}break;
      case 'bite':
        st.biteT+=dt;bob.position.set(st.target.x+Math.sin(t/55)*.05,surf-.16+Math.sin(t/90)*.07,st.target.z+Math.cos(t/60)*.05);
        if(((t/140)|0)%2===0&&st.biteT%.45<dt+.001)splash(st.target.x,st.target.z,.9,.7,surf+.02);
        if(st.biteT>1.8){banner('It got away...','🎣');hideLine();st.state='ready';pose('fish_idle')}break;
      case 'reel':{const u=Math.min(1,st.t/1.55),e=u*u*(3-2*u);bob.position.set(st.from.x+(sp.x-st.from.x)*e,surf+.05+Math.sin(u*Math.PI)*.5,st.from.z+(sp.z-st.from.z)*e);
        if(Math.hypot(bob.position.x-sp.x,bob.position.z-sp.z)<2.6||u>=1)bob.position.y=surf+.05+Math.max(0,(1-u))*.4;
        if(st.t>=1.55)landCatch();break}
      case 'catch':
        if(st.show){const m=st.show;st.showT+=dt;const u=Math.min(1,st.showT/.5);m.position.set(S.x+Math.sin(S.rot)*.25,S.y+1.6+u*1.0+Math.sin(t/380)*.06,S.z+Math.cos(S.rot)*.25);m.rotation.set(0,t/700,Math.sin(t/500)*.25);m.visible=st.t<2.7}
        if(st.t>=3.15){if(st.show)st.show.visible=false;st.state='ready';pose('fish_idle')}break;
    }
    // line from the rod tip to the bobber (hidden when there is nothing in the water)
    if(bob.visible&&(st.state==='cast'||st.state==='wait'||st.state==='bite'||st.state==='reel')){const l=st.lpos;l[0]=st.tip.x;l[1]=st.tip.y;l[2]=st.tip.z;l[3]=bob.position.x;l[4]=bob.position.y+.12;l[5]=bob.position.z;st.line.geometry.attributes.position.needsUpdate=true;st.line.visible=true}else st.line.visible=false}
  return {build,tick,attachRod,onCatch,count:()=>st.rec.count,state:st,FISH}
})();
