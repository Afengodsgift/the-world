// Environment: day/night cycle, sky (sun, moon, stars), clouds you can fly up into, weather (clear / cloudy / rain / storm with lightning + thunder).
// Everyone in the room sees the same sky because both the day clock and the weather schedule come from Date.now(). The 🌤️ chip (top right) opens a
// panel to override time / weather on YOUR screen only (handy for looking at night or a storm). Globals read at call time: THREE, scene, camera, S, sun, sky, hemi, amb, seaMesh, H.
const Env=(()=>{
  const CYCLE=720,WSLOT=180,N_CLOUD=150,CW=3000,N_RAIN=1100,TAU=Math.PI*2,AZ0=Math.atan2(.32,.5);
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},lerp=(a,b,t)=>a+(b-a)*t;
  const col=h=>new THREE.Color(h);
  const P={horDay:col('#cfe3f2'),horNight:col('#0b1329'),horTw:col('#ff9a62'),zenDay:col('#336bbd'),zenNight:col('#050a1c'),zenTw:col('#4d4d8c'),gndDay:col('#99b8cc'),gndNight:col('#070c18'),
    hsDay:col('#bcd7ff'),hsNight:col('#2a3d73'),hgDay:col('#7d7355'),hgNight:col('#14141c'),sunDay:col('#fff0d2'),sunTw:col('#ff9150'),moon:col('#9fb6ff'),
    seaDay:col('#2f6f9a'),seaNight:col('#0b2238'),cloudDay:col('#ffffff'),cloudTw:col('#ffc9a0'),cloudNight:col('#46507a'),cloudStorm:col('#59616f'),fogGrey:col('#8e99a6'),fogStorm:col('#4a525e')};
  const E={u:.4,h:1,dayF:1,tw:0,wx:{cloud:.12,rain:0,storm:0},tgt:{cloud:.12,rain:0,storm:0},ovT:null,ovW:null,sound:true,inCloud:0,flash:0,label:'',ready:false};
  let cloudMesh=null,clouds=[],rain=null,rainPos=null,rainVel=null,bolt=null,chip=null,panel=null,offX=0,offZ=0,nextFlash=6,boltT=0,fireflies=null;
  const tmpC=new THREE.Color(),tmpC2=new THREE.Color(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_e=new THREE.Euler();
  // ---------- weather schedule (same for everyone): a new weather every WSLOT seconds, hashed from the slot number ----------
  function h01(n){n=Math.imul(n^61,1664525)+1013904223|0;n^=n>>>15;n=Math.imul(n,2246822519)|0;n^=n>>>13;n=Math.imul(n,3266489917)|0;n^=n>>>16;return (n>>>0)/4294967296}
  const WX={clear:{cloud:.12,rain:0,storm:0,e:'☀️',n:'Clear'},cloudy:{cloud:.72,rain:0,storm:0,e:'☁️',n:'Cloudy'},rain:{cloud:.92,rain:.85,storm:0,e:'🌧️',n:'Rain'},storm:{cloud:1,rain:1,storm:1,e:'⛈️',n:'Storm'}};
  function weatherAt(ms){const r=h01(Math.floor(ms/1000/WSLOT));return r<.42?WX.clear:r<.66?WX.cloudy:r<.88?WX.rain:WX.storm}
  // ---------- sky palette for a time of day u in [0,1): 0 = midnight, .25 = sunrise, .5 = noon, .75 = sunset ----------
  function skyAt(u){
    const h=Math.sin((u-.25)*TAU),el=h*65*Math.PI/180,az=AZ0+(u-.5)*TAU,ce=Math.cos(el);
    const sunDir=new THREE.Vector3(ce*Math.cos(az),Math.sin(el),ce*Math.sin(az)),moonDir=sunDir.clone().multiplyScalar(-1);
    const dayF=sm(-.08,.3,h),tw=Math.max(0,1-Math.abs(h-.02)/.3);
    return {h,sunDir,moonDir,dayF,tw};
  }
  // ---------- builders ----------
  function makeSky(sd){
    return new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
      uniforms:{sd:{value:sd.clone()},md:{value:new THREE.Vector3(0,-1,0)},hor:{value:col('#cfe3f2')},zen:{value:col('#336bbd')},gnd:{value:col('#99b8cc')},sunc:{value:col('#fff0d2')},stars:{value:0},over:{value:0},flash:{value:0},tm:{value:0}},
      vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vd;uniform vec3 sd,md,hor,zen,gnd,sunc;uniform float stars,over,flash,tm;'
        +'float hh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}'
        +'void main(){vec3 d=normalize(vd);float h=clamp(d.y,0.,1.);vec3 c=mix(hor,zen,pow(h,.5));'
        +'float s=max(dot(d,sd),0.);c+=sunc*(pow(s,700.)*2.5+pow(s,10.)*.22)*(1.-over*.85);'
        +'float m=max(dot(d,md),0.);c+=vec3(.85,.9,1.)*(smoothstep(.9995,.9997,m)*1.5+pow(m,70.)*.14)*(1.-over*.8)*step(-.05,md.y);'
        +'if(d.y>0.&&stars>.01){vec3 g=floor(d*260.);float r=hh(g);float k=.6+.4*sin(tm*3.+r*40.);c+=vec3(.9,.95,1.)*step(.9965,r)*k*stars*smoothstep(0.,.15,d.y);}'
        +'float l=dot(c,vec3(.3,.59,.11));c=mix(c,vec3(l)*.78,over*.8);c+=vec3(flash*.9);'
        +'if(d.y<0.)c=mix(hor,gnd,clamp(-d.y*4.,0.,1.));gl_FragColor=vec4(c,1.);}'});
  }
  function cloudGeo(){ // 5 low-poly puffs merged into one cloud
    const puffs=[[0,0,0,1],[.95,-.1,.15,.8],[-.9,-.12,-.1,.78],[.3,.28,-.3,.7],[-.25,.2,.45,.62]],pos=[];
    for(const [x,y,z,r] of puffs){const g=new THREE.IcosahedronGeometry(r,0),a=g.attributes.position;for(let i=0;i<a.count;i++)pos.push(a.getX(i)+x,a.getY(i)*.62+y,a.getZ(i)+z)}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();return geo}
  function build(){
    const rr=()=>Math.random();let seed=1234567;const r2=()=>(seed=(seed*16807)%2147483647)/2147483647; // fixed layout, same for everyone
    cloudMesh=new THREE.InstancedMesh(cloudGeo(),new THREE.MeshLambertMaterial({color:'#ffffff',flatShading:true}),N_CLOUD);cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cloudMesh.frustumCulled=false;scene.add(cloudMesh);
    for(let i=0;i<N_CLOUD;i++){const high=r2()<.16;clouds.push({bx:(r2()-.5)*CW,bz:(r2()-.5)*CW,by:high?620+r2()*110:310+r2()*180,w:(high?120:80)+r2()*150,hgt:30+r2()*35,yaw:r2()*TAU,th:r2()*.85,vis:0,rx:0,ry:0})}
    // rain: line segments in a box around the camera
    rainPos=new Float32Array(N_RAIN*6);rainVel=new Float32Array(N_RAIN*3);
    for(let i=0;i<N_RAIN;i++){rainVel[i*3]=0;rainVel[i*3+1]=-1;rainVel[i*3+2]=0;rainPos[i*6]=(Math.random()-.5)*46;rainPos[i*6+1]=Math.random()*26-8;rainPos[i*6+2]=(Math.random()-.5)*46}
    const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(rainPos,3).setUsage(THREE.DynamicDrawUsage));rg.setDrawRange(0,0);
    rain=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:'#c9d6e8',transparent:true,opacity:.5,fog:false,depthWrite:false}));rain.frustumCulled=false;rain.visible=false;scene.add(rain);
    // lightning bolt: 16 tapered segments, re-rolled per strike
    bolt=new THREE.Group();const bg=new THREE.CylinderGeometry(1,.6,1,5,1);bg.translate(0,.5,0);bg.rotateX(Math.PI/2);
    const bm=new THREE.MeshBasicMaterial({color:'#f2f6ff',fog:false});for(let i=0;i<16;i++)bolt.add(new THREE.Mesh(bg,bm));bolt.visible=false;scene.add(bolt);
    // fireflies at night: a few glowing dots drifting near the player
    {const n=70,pa=new Float32Array(n*3);for(let i=0;i<n;i++){pa[i*3]=(Math.random()-.5)*60;pa[i*3+1]=.5+Math.random()*5;pa[i*3+2]=(Math.random()-.5)*60}
     const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.BufferAttribute(pa,3));fireflies=new THREE.Points(fg,new THREE.PointsMaterial({color:'#e8ff7a',size:.35,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));fireflies.frustumCulled=false;scene.add(fireflies);fireflies.userData.base=pa}
    buildUI();E.ready=true;
    try{E.sound=localStorage.getItem('w4wxsound')!=='0'}catch(e){}
  }
  // ---------- audio: one lazily-created context (browsers need a tap first): soft rain hiss + thunder rumbles ----------
  let AC=null,rainG=null,noiseBuf=null;
  function audio(){
    if(AC||!E.sound)return AC;
    try{AC=new(window.AudioContext||window.webkitAudioContext)();const len=AC.sampleRate*2;noiseBuf=AC.createBuffer(1,len,AC.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      const src=AC.createBufferSource();src.buffer=noiseBuf;src.loop=true;const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=7000;rainG=AC.createGain();rainG.gain.value=0;
      src.connect(hp);hp.connect(lp);lp.connect(rainG);rainG.connect(AC.destination);src.start()}catch(e){AC=null}
    return AC}
  function thunder(delay,vol){const a=audio();if(!a||!E.sound)return;try{const t0=a.currentTime+delay,src=a.createBufferSource();src.buffer=noiseBuf;const lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(260,t0);lp.frequency.exponentialRampToValueAtTime(70,t0+2.6);
      const g=a.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+.08);g.gain.exponentialRampToValueAtTime(.001,t0+2.8);src.connect(lp);lp.connect(g);g.connect(a.destination);src.start(t0,Math.random(),3)}catch(e){}}
  // ---------- UI ----------
  function buildUI(){
    const Ee=(t,css,html)=>{const e=document.createElement(t);e.style.cssText=css||'';if(html)e.innerHTML=html;return e};
    chip=Ee('button','position:fixed;z-index:6;right:var(--wx-r,12px);top:var(--wx-t,calc(env(safe-area-inset-top,0px) + 120px));width:auto;height:var(--T,36px);border-radius:18px;border:0;background:#ffffffd9;font-size:15px;padding:0 12px;white-space:nowrap;font-variant-numeric:tabular-nums','☀️ 12:00');
    panel=Ee('div','position:fixed;z-index:12;left:0;right:0;bottom:0;max-height:var(--sheet-h,60vh);overflow-y:auto;display:none;padding:12px var(--sheet-px,12px) calc(env(safe-area-inset-bottom,0px) + 16px);background:#0d1330f2;border-radius:18px 18px 0 0;color:#fff;box-shadow:0 -6px 30px #0008;font-size:15px');
    document.body.appendChild(chip);document.body.appendChild(panel);
    const pill=(txt,on,fn)=>{const b=Ee('button','border:0;border-radius:14px;padding:9px 12px;margin:0 8px 8px 0;font:inherit;color:#fff;background:'+(on?'#3b82f6':'#ffffff1f'),txt);b.onclick=fn;return b};
    const render=()=>{panel.innerHTML='';
      const head=Ee('div','display:flex;justify-content:space-between;align-items:center;margin:0 4px 4px','<b>Sky &amp; weather</b>');const x=Ee('button','border:0;border-radius:14px;padding:4px 12px;font-size:18px;color:#fff;background:#ffffff33','✕');x.onclick=()=>{panel.style.display='none'};head.appendChild(x);panel.appendChild(head);
      const sec=(t)=>panel.appendChild(Ee('div','margin:10px 4px 6px;font-size:13px;opacity:.7;letter-spacing:.08em;text-transform:uppercase',t));
      sec('Time of day');let row=Ee('div','');
      for(const [t,v] of [['Auto',null],['🌅 Dawn',.26],['☀️ Noon',.5],['🌇 Dusk',.74],['🌙 Midnight',0]])row.appendChild(pill(t,E.ovT===v,()=>{E.ovT=v;render()}));panel.appendChild(row);
      sec('Weather');row=Ee('div','');
      for(const [t,v] of [['Auto',null],['☀️ Clear','clear'],['☁️ Cloudy','cloudy'],['🌧️ Rain','rain'],['⛈️ Storm','storm']])row.appendChild(pill(t,E.ovW===v,()=>{E.ovW=v;render()}));panel.appendChild(row);
      sec('Sound');row=Ee('div','');row.appendChild(pill(E.sound?'🔊 Rain & thunder on':'🔇 Rain & thunder off',E.sound,()=>{E.sound=!E.sound;try{localStorage.setItem('w4wxsound',E.sound?'1':'0')}catch(e){}if(!E.sound&&rainG)rainG.gain.value=0;render()}));panel.appendChild(row);
      panel.appendChild(Ee('div','margin:8px 4px 0;font-size:12px;opacity:.6','Auto is shared: everyone in your room sees the same time and weather. Overrides only change your own screen.'))};
    chip.addEventListener('pointerdown',e=>{e.preventDefault();audio();if(panel.style.display==='block'){panel.style.display='none'}else{render();panel.style.display='block'}});
    addEventListener('pointerdown',()=>{audio();if(AC&&AC.state==='suspended')AC.resume()},{once:true});
  }
  // ---------- per-frame ----------
  function tick(dt,t){
    if(!E.ready)return;
    const now=Date.now(),u=E.ovT!=null?E.ovT:((now/1000)%CYCLE)/CYCLE;E.u=u;
    // weather: ease towards the scheduled (or overridden) target
    const w=E.ovW?WX[E.ovW]:weatherAt(now);E.tgt=w;const k=Math.min(1,dt/(E.ovW?3:22));
    for(const key of ['cloud','rain','storm'])E.wx[key]+=(w[key]-E.wx[key])*k;
    const wx=E.wx,ov=Math.min(1,sm(.3,1,wx.cloud)+wx.storm*.15);
    const sk=skyAt(u),h=sk.h,dayF=sk.dayF,tw=sk.tw;E.h=h;E.dayF=dayF;E.tw=tw;
    // colours
    const hor=tmpC.copy(P.horNight).lerp(P.horDay,dayF).lerp(P.horTw,tw*.75*(1-ov*.6));
    const zen=tmpC2.copy(P.zenNight).lerp(P.zenDay,dayF).lerp(P.zenTw,tw*.35*(1-ov*.6));
    const su=sky.material.uniforms;su.hor.value.copy(hor);su.zen.value.copy(zen);su.gnd.value.copy(P.gndNight).lerp(P.gndDay,dayF);
    su.sunc.value.copy(P.sunDay).lerp(P.sunTw,Math.min(1,tw*1.2));su.md.value.copy(sk.moonDir);su.sd.value.copy(sk.sunDir);
    su.stars.value=(1-sm(-.2,.05,h))*(1-ov*.9);su.over.value=ov*(.55+.45*dayF);su.tm.value=t/1000;
    // lightning
    E.flash=Math.max(0,E.flash-dt*3.2);
    if(wx.storm>.5){nextFlash-=dt;if(nextFlash<=0){nextFlash=5+Math.random()*10;strike()}}
    if(boltT>0){boltT-=dt;bolt.visible=boltT>0&&((boltT*60|0)%3!==0);if(boltT<=0)bolt.visible=false}
    su.flash.value=E.flash;
    // lights
    const sunW=1.35*sm(-.08,.2,h)*(1-.55*ov),moonW=.42*(1-sm(-.1,.12,h))*(1-.45*ov); // sun and moon overlap around the horizon so sunrise/sunset never dip to black
    const ld=sun.userData.sd;ld.set(0,0,0).addScaledVector(sk.sunDir,sunW).addScaledVector(sk.moonDir,moonW);if(ld.lengthSq()<1e-6)ld.copy(sk.sunDir);ld.normalize();if(ld.y<.24){ld.y=.24;ld.normalize()}
    sun.intensity=sunW+moonW;sun.color.copy(P.sunDay).lerp(P.sunTw,Math.min(1,tw*1.2)).lerp(P.moon,moonW/Math.max(.001,sunW+moonW));
    hemi.color.copy(P.hsNight).lerp(P.hsDay,dayF);hemi.groundColor.copy(P.hgNight).lerp(P.hgDay,dayF);hemi.intensity=(.38+.37*dayF)*(1-.18*ov)+E.flash*.6;
    amb.intensity=.12+(1-dayF)*.06+E.flash*1.4;
    renderer.toneMappingExposure=lerp(1.05,.95,dayF);
    // fog + background follow the horizon colour, greyed and tightened by weather; inside a cloud everything turns white and close
    const grey=Math.min(1,wx.cloud*.55+wx.rain*.25+wx.storm*.2);
    const fogC=tmpC.clone();fogC.copy(hor).lerp(tmpC2.copy(P.fogGrey).multiplyScalar(.35+.65*dayF),grey*.8).lerp(tmpC2.copy(P.fogStorm).multiplyScalar(.3+.7*dayF),wx.storm*.5);
    let near=lerp(150,60,Math.min(1,wx.rain*.6+wx.storm*.4)),far=lerp(1700,lerp(900,420,wx.storm),Math.min(1,wx.rain+wx.cloud*.15));
    updateClouds(dt,sk,ov);
    const inC=E.inCloud;if(inC>.01){fogC.lerp(tmpC2.copy(P.cloudDay).multiplyScalar(.25+.75*dayF),Math.min(1,inC*.9));near=lerp(near,2,inC);far=lerp(far,85,inC)}
    scene.fog.color.copy(fogC);scene.fog.near=near;scene.fog.far=far;scene.background.copy(fogC);
    seaMesh.material.color.copy(P.seaNight).lerp(P.seaDay,dayF);
    // rain
    updateRain(dt,wx);
    // fireflies
    if(fireflies){const a=Math.max(0,1-dayF*1.6)*(1-wx.rain)*(S.y<8?1:0);fireflies.material.opacity=a*.85;fireflies.visible=a>.02;
      if(fireflies.visible){fireflies.position.set(S.x,Math.max(0,H(S.x,S.z)),S.z);const pa=fireflies.geometry.attributes.position.array,b=fireflies.userData.base;for(let i=0;i<pa.length;i+=3){pa[i]=b[i]+Math.sin(t/900+i)*2;pa[i+1]=b[i+1]+Math.sin(t/700+i*1.7)*.8;pa[i+2]=b[i+2]+Math.cos(t/1100+i)*2}fireflies.geometry.attributes.position.needsUpdate=true}}
    // audio
    if(rainG&&AC&&E.sound)rainG.gain.value+=((wx.rain*.05*(S.y>500?.3:1))-rainG.gain.value)*Math.min(1,dt*2);
    // chip text
    const hh=Math.floor(u*24),mm=Math.floor((u*24-hh)*60),icon=wx.storm>.6?'⛈️':wx.rain>.4?'🌧️':wx.cloud>.5?'☁️':h<-.1?'🌙':tw>.5?(u<.5?'🌅':'🌇'):wx.cloud>.3?'🌤️':'☀️';
    const txt=icon+' '+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+(S.y>250?' · ↑'+Math.round(S.y)+'m':'');if(txt!==E.label){E.label=txt;chip.textContent=txt}
  }
  function strike(){
    E.flash=1;setTimeout(()=>{E.flash=Math.max(E.flash,.7)},140);
    const a=S.rot+(Math.random()-.5)*1.6,d=300+Math.random()*350,x=S.x+Math.sin(a)*d,z=S.z+Math.cos(a)*d,gy=Math.max(0,H(x,z));
    let px=x,py=520,pz=z;const n=bolt.children.length;
    bolt.children.forEach((m,i)=>{const ny=py-(520-gy)/n,nx=px+(Math.random()-.5)*50,nz=pz+(Math.random()-.5)*50;m.position.set(px,py,pz);m.lookAt(nx,ny,nz);const len=Math.hypot(nx-px,ny-py,nz-pz),r=2.4*(1-i/n)+.7;m.scale.set(r,r,len);px=nx;py=ny;pz=nz});
    bolt.visible=true;boltT=.3;thunder(.4+d/340,.55)}
  function updateClouds(dt,sk,ov){
    const wx=E.wx,wind=5+wx.cloud*4+wx.storm*14;offX+=dt*wind*.8;offZ+=dt*wind*.35;
    let inside=0;const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z,cover=wx.cloud;
    for(let i=0;i<clouds.length;i++){const c=clouds[i];
      let rx=((c.bx+offX-S.x)%CW+CW*1.5)%CW-CW/2,rz=((c.bz+offZ-S.z)%CW+CW*1.5)%CW-CW/2;
      const clr=Math.abs(c.by-SKY.base)<150?sm(SKY.R+90,SKY.R+190,Math.hypot(S.x+rx-SKY.x,S.z+rz-SKY.z)):1, // keep a clearing in the clouds around the floating island
        vis=sm(c.th,c.th+.18,cover)*(.55+.45*cover)*clr,sc=c.w*(.65+.5*cover)*vis,hs=c.hgt*(.7+.6*cover)*vis;c.vis=vis;
      _p.set(S.x+rx,c.by,S.z+rz);_e.set(0,c.yaw,0);_q.setFromEuler(_e);_s.set(Math.max(sc,.001),Math.max(hs,.001),Math.max(sc*.8,.001));_m.compose(_p,_q,_s);cloudMesh.setMatrixAt(i,_m);
      if(vis>.05){const dx=(cx-_p.x)/(sc*.95),dy=(cy-_p.y)/(hs*1.25),dz=(cz-_p.z)/(sc*.8*.95),q=Math.sqrt(dx*dx+dy*dy+dz*dz);if(q<1)inside=Math.max(inside,1-q)}}
    cloudMesh.instanceMatrix.needsUpdate=true;
    E.inCloud+=(Math.min(1,inside*2.2)-E.inCloud)*Math.min(1,dt*3);
    const m=cloudMesh.material;m.color.copy(P.cloudNight).lerp(P.cloudDay,sk.dayF).lerp(P.cloudTw,sk.tw*.8).lerp(P.cloudStorm,Math.min(1,wx.rain*.35+wx.storm*.6));
    m.emissive.copy(m.color).multiplyScalar(.12+.2*E.flash)}
  function updateRain(dt,wx){
    const dens=Math.min(1,wx.rain),on=dens>.04;rain.visible=on;if(!on)return;
    rain.geometry.setDrawRange(0,Math.floor(N_RAIN*dens)*2);rain.material.opacity=.28+.3*dens;rain.material.color.copy(tmpC.set('#7e8fb0')).lerp(tmpC2.set('#d8e4f4'),E.dayF);
    const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z,wind=(3+wx.storm*9),vy=-(26+wx.storm*10),n=Math.floor(N_RAIN*dens);
    rain.position.set(0,0,0);
    for(let i=0;i<n;i++){const o=i*6;
      let x=rainPos[o+3],y=rainPos[o+4],z=rainPos[o+5];
      if(rainVel[i*3+1]===-1){x=cx+(Math.random()-.5)*46;y=cy+Math.random()*24-6;z=cz+(Math.random()-.5)*46;rainVel[i*3+1]=-2}
      x+=wind*.5*dt;y+=vy*dt;z+=wind*.2*dt;
      if(y<cy-12||Math.abs(x-cx)>24||Math.abs(z-cz)>24){x=cx+(Math.random()-.5)*46;y=cy+8+Math.random()*14;z=cz+(Math.random()-.5)*46}
      rainPos[o]=x;rainPos[o+1]=y;rainPos[o+2]=z;rainPos[o+3]=x;rainPos[o+4]=y;rainPos[o+5]=z;
      rainPos[o]=x-wind*.5*.035;rainPos[o+1]=y-vy*.035;rainPos[o+2]=z-wind*.2*.035}
    rain.geometry.attributes.position.needsUpdate=true}
  return {build,tick,makeSky,state:E,WX,skyAt,weatherAt,strike}
})();
