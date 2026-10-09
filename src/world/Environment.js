// Environment: day/night cycle, sky (sun, moon, stars), clouds you can fly up into, weather (clear / cloudy / rain / storm with lightning + thunder).
// Everyone in the room sees the same sky because both the day clock and the weather schedule come from Date.now(). The 🌤️ chip (top right) opens a
// panel to override time / weather on YOUR screen only (handy for looking at night or a storm). Globals read at call time: THREE, scene, camera, S, sun, sky, hemi, amb, seaMesh, H.
const Env=(()=>{
  const NOSPACE={alt:0,above:0,weather:1,thin:0,dark:0,stars:0,space:0,quiet:0},cloudSun=new THREE.Color(),CYCLE=720,WSLOT=180,N_CLOUD=150,CW=3000,N_RAIN=1100,TAU=Math.PI*2,AZ0=Math.atan2(.32,.5);
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},lerp=(a,b,t)=>a+(b-a)*t;
  const col=h=>new THREE.Color(h);
  const P={deepHor:col('#3b78d8'),deepZen:col('#0b2160'),upperHor:col('#8a62d6'),spaceHor:col('#02040b'),spaceZen:col('#000103'),horDay:col('#cfe3f2'),horNight:col('#0b1329'),horTw:col('#ff9a62'),zenDay:col('#336bbd'),zenNight:col('#050a1c'),zenTw:col('#4d4d8c'),gndDay:col('#99b8cc'),gndNight:col('#070c18'),
    hsDay:col('#bcd7ff'),hsNight:col('#2a3d73'),hgDay:col('#7d7355'),hgNight:col('#14141c'),sunDay:col('#fff0d2'),sunTw:col('#ff9150'),moon:col('#9fb6ff'),
    seaDay:col('#2f6f9a'),seaNight:col('#0b2238'),cloudDay:col('#ffffff'),cloudTw:col('#ffc9a0'),cloudNight:col('#46507a'),cloudStorm:col('#59616f'),fogGrey:col('#8e99a6'),fogStorm:col('#4a525e')};
  const E={cloudLod:1,u:.4,h:1,dayF:1,tw:0,wx:{cloud:.12,rain:0,storm:0},tgt:{cloud:.12,rain:0,storm:0},ovT:null,ovW:null,sound:true,inCloud:0,flash:0,wet:0,label:'',ready:false};
  let cloudMeshes=[],cloudMat=null,cloudT=0,clouds=[],rain=null,rainPos=null,rainVel=null,bolt=null,chip=null,panel=null,offX=0,offZ=0,nextFlash=6,nextSheet=9,lastWet=-1,boltT=0,fireflies=null;
  const tmpC=new THREE.Color(),tmpC2=new THREE.Color(),_col=new THREE.Color(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(),_e=new THREE.Euler();
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
      uniforms:{sd:{value:sd.clone()},md:{value:new THREE.Vector3(0,-1,0)},hor:{value:col('#cfe3f2')},zen:{value:col('#336bbd')},gnd:{value:col('#99b8cc')},sunc:{value:col('#fff0d2')},stars:{value:0},over:{value:0},flash:{value:0},tm:{value:0},space:{value:0}},
      vertexShader:'varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vd;uniform vec3 sd,md,hor,zen,gnd,sunc;uniform float stars,over,flash,tm,space;'
        +'float hh(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}'
        +'void main(){vec3 d=normalize(vd);float h=clamp(d.y,0.,1.);vec3 c=mix(hor,zen,pow(h,.5));'
        +'float s=max(dot(d,sd),0.);c+=sunc*(pow(s,700.)*2.5+pow(s,10.)*.22)*(1.-over*.85);'
        +'float m=max(dot(d,md),0.);c+=vec3(.85,.9,1.)*(smoothstep(.9995,.9997,m)*1.5+pow(m,70.)*.14)*(1.-over*.8)*step(-.05,md.y);'
        +'if((d.y>0.||space>.01)&&stars>.01){vec3 g=floor(d*260.);float r=hh(g);float k=.6+.4*sin(tm*3.+r*40.);c+=vec3(.9,.95,1.)*step(1.-.0021*mix(.3,1.,stars),r)*k*stars*(.45+.55*hh(g+7.))*mix(smoothstep(0.,.15,d.y),1.,space);}'
        +'float l=dot(c,vec3(.3,.59,.11));c=mix(c,vec3(l)*.78,over*.8);c+=vec3(flash*.9);'
        +'if(d.y<0.)c=mix(c,mix(hor,gnd,clamp(-d.y*4.,0.,1.)),1.-space);gl_FragColor=vec4(c,1.);}'});
  }
  // Clouds: 3 distinct shapes (so the sky isn't one blob stamped 150 times). Each is 6-7 smooth ellipsoid puffs with a flat base; vertex
  // colours darken the underside so it reads as a volume. Same overall bounds as the old blob (fly-through test relies on them).
  function cloudGeo(v){
    let sd=1000+v*7919;const r=()=>(sd=(sd*16807)%2147483647)/2147483647,puffs=[];
    const k=[4,5,3][v],tall=[1,.8,1.3][v];
    for(let i=0;i<k;i++){const f=k>1?i/(k-1):.5,x=(f-.5)*2.5+(r()-.5)*.3,rad=.95-Math.abs(x)*.2-r()*.08;puffs.push([x,-.08+(r()-.5)*.12,(r()-.5)*.7,rad])}
    const top=2+(v===0?1:0);for(let i=0;i<top;i++){const x=(r()-.5)*1.5;puffs.push([x,.2+r()*.2*tall,(r()-.5)*.5,.52+r()*.2*tall])}
    const pos=[],nor=[],col=[],base=-.3;
    for(const [px,py,pz,rad] of puffs){
      const g=new THREE.IcosahedronGeometry(rad,1),a=g.attributes.position;
      for(let q=0;q<a.count;q++){
        const dx=a.getX(q),dy=a.getY(q)*.7,dz=a.getZ(q);let y=py+dy;
        const n=Math.hypot(dx,dy/.49,dz)||1;nor.push(dx/n,dy/.49/n,dz/n);          // ellipsoid normal -> smooth shading
        if(y<base)y=base;                                                           // flat base
        pos.push(px+dx,y,pz+dz);
        const t=Math.min(1,Math.max(0,(y-base)/.9)),sh=.62+.38*Math.pow(t,.7);col.push(sh,sh,sh*1.02)}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));return geo}
  function build(){
    const rr=()=>Math.random();let seed=1234567;const r2=()=>(seed=(seed*16807)%2147483647)/2147483647; // fixed layout, same for everyone
    cloudMat=new THREE.MeshLambertMaterial({color:'#ffffff',vertexColors:true});
    for(let v=0;v<3;v++){const m=new THREE.InstancedMesh(cloudGeo(v),cloudMat,Math.ceil(N_CLOUD/3));m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;m.setColorAt(0,tmpC.set('#ffffff'));m.count=0;scene.add(m);cloudMeshes.push(m)}
    for(let i=0;i<N_CLOUD;i++){const high=r2()<.16;clouds.push({bx:(r2()-.5)*CW,bz:(r2()-.5)*CW,by:high?620+r2()*110:310+r2()*180,w:(high?100:70)+r2()*130,hgt:38+r2()*52,yaw:r2()*TAU,th:r2()*.85,vis:0,rx:0,ry:0})}
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
  let AC=null,rainG=null,patG=null,noiseBuf=null;
  function audio(){
    if(AC||!E.sound)return AC;
    try{AC=WAudio.get();if(!AC)return null;const len=AC.sampleRate*2;noiseBuf=AC.createBuffer(1,len,AC.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      const src=AC.createBufferSource();src.buffer=noiseBuf;src.loop=true;const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=7000;rainG=AC.createGain();rainG.gain.value=0;
      src.connect(hp);hp.connect(lp);lp.connect(rainG);rainG.connect(WAudio.out());src.start();
      // second layer: mid-band 'patter' (rain on ground and leaves) with an irregular wobble, so rain is not just a flat hiss
      const s2=AC.createBufferSource();s2.buffer=noiseBuf;s2.loop=true;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.frequency.value=720;bp.Q.value=.5;patG=AC.createGain();patG.gain.value=0;
      const am=AC.createGain();am.gain.value=.65;for(const [fr,dp] of [[.37,.25],[1.1,.1]]){const o=AC.createOscillator(),d=AC.createGain();o.frequency.value=fr;d.gain.value=dp;o.connect(d);d.connect(am.gain);o.start()}
      s2.connect(bp);bp.connect(am);am.connect(patG);patG.connect(WAudio.out());s2.start(0,Math.random()*1.5)}catch(e){AC=null}
    return AC}
  function thunder(delay,vol){const a=audio();if(!a||!E.sound)return;try{const t0=a.currentTime+delay,src=a.createBufferSource();src.buffer=noiseBuf;const lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(260,t0);lp.frequency.exponentialRampToValueAtTime(70,t0+2.6);
      const g=a.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+.08);g.gain.exponentialRampToValueAtTime(.001,t0+2.8);src.connect(lp);lp.connect(g);g.connect(WAudio.out());src.start(t0,Math.random(),3);
      const near=Math.max(0,1-delay/2.4);if(near>.05){const cr=a.createBufferSource();cr.buffer=noiseBuf;const hp=a.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;const cg=a.createGain();cg.gain.setValueAtTime(0,t0);cg.gain.linearRampToValueAtTime(vol*.55*near,t0+.01);cg.gain.exponentialRampToValueAtTime(.001,t0+.4);cr.connect(hp);hp.connect(cg);cg.connect(WAudio.out());cr.start(t0,Math.random(),.6)}}catch(e){}}
  // ---------- UI ----------
  function buildUI(){
    const Ee=(t,css,html)=>{const e=document.createElement(t);e.style.cssText=css||'';if(html)e.innerHTML=html;return e};
    chip=Ee('button','','☀️ 12:00');
    panel=Ee('div','display:none');panel.className='sheet';chip.className='dk dk-wx';
    document.body.appendChild(chip);document.body.appendChild(panel);
    const pill=(txt,on,fn)=>{const b=Ee('button','margin:0 8px 8px 0',txt);b.className='chip'+(on?' on':'');b.onclick=fn;return b};
    const render=()=>{panel.innerHTML='';
      const head=Ee('div','display:flex;justify-content:space-between;align-items:center;margin:0 4px 4px','<h3 style="margin:0">Sky &amp; weather</h3>');const x=Ee('button','','✕');x.className='xbtn';x.onclick=()=>{panel.style.display='none'};head.appendChild(x);panel.appendChild(head);
      const sec=(t)=>{const e=Ee('div','',t);e.className='sec';panel.appendChild(e)};
      sec('Time of day');let row=Ee('div','');
      for(const [t,v] of [['Auto',null],['🌅 Dawn',.26],['☀️ Noon',.5],['🌇 Dusk',.74],['🌙 Midnight',0]])row.appendChild(pill(t,E.ovT===v,()=>{E.ovT=v;render()}));panel.appendChild(row);
      sec('Weather');row=Ee('div','');
      for(const [t,v] of [['Auto',null],['☀️ Clear','clear'],['☁️ Cloudy','cloudy'],['🌧️ Rain','rain'],['⛈️ Storm','storm']])row.appendChild(pill(t,E.ovW===v,()=>{E.ovW=v;render()}));panel.appendChild(row);
      sec('Sound');row=Ee('div','');row.appendChild(pill(E.sound?'🔊 Rain & thunder on':'🔇 Rain & thunder off',E.sound,()=>{E.sound=!E.sound;try{localStorage.setItem('w4wxsound',E.sound?'1':'0')}catch(e){}if(!E.sound&&rainG)rainG.gain.value=0;render()}));
      if(typeof Ambience!=='undefined')row.appendChild(pill(Ambience.isOn()?'🌊 World ambience on':'🔇 World ambience off',Ambience.isOn(),()=>{Ambience.setOn(!Ambience.isOn());render()}));panel.appendChild(row);
      {const n=Ee('div','','Auto is shared: everyone in your room sees the same time and weather. Overrides only change your own screen.');n.className='note';panel.appendChild(n)}};
    chip.addEventListener('pointerdown',e=>{e.preventDefault();audio();if(panel.style.display==='block'){panel.style.display='none'}else{render();panel.style.display='block'}});
    addEventListener('pointerdown',()=>{audio();WAudio.resume()},{once:true});
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
    // space: the atmosphere thins out between ~1.1 km and ~3.4 km; above that the sky is black with stars all round, no haze, no weather
    const SF=typeof Space!=='undefined'?Space.f:NOSPACE;   // altitude profile (0..1 factors) from src/space/SpaceManager.js
    // colours
    const hor=tmpC.copy(P.horNight).lerp(P.horDay,dayF).lerp(P.horTw,tw*.75*(1-ov*.6));
    const zen=tmpC2.copy(P.zenNight).lerp(P.zenDay,dayF).lerp(P.zenTw,tw*.35*(1-ov*.6));
    if(SF.deep>0){const dy=.35+.65*dayF;hor.lerp(P.deepHor,SF.deep*.55*dy);zen.lerp(P.deepZen,SF.deep*.9*dy);               // above the clouds the sky is a clean deep blue whatever the weather below
      hor.lerp(P.upperHor,SF.deep*SF.deep*(1-SF.dark)*.5*dy)}                                                          // upper atmosphere: violet haze along the horizon
    if(SF.dark>0){hor.lerp(P.spaceHor,SF.dark*.97);zen.lerp(P.spaceZen,SF.dark)}
    const su=sky.material.uniforms;su.hor.value.copy(hor);su.zen.value.copy(zen);su.gnd.value.copy(P.gndNight).lerp(P.gndDay,dayF).lerp(zen,SF.above*.9).lerp(P.spaceZen,SF.dark);   // beyond the world's rim there is sky/space, not a grey floorsu.space.value=SF.stars;
    su.sunc.value.copy(P.sunDay).lerp(P.sunTw,Math.min(1,tw*1.2));su.md.value.copy(sk.moonDir);su.sd.value.copy(sk.sunDir);
    su.stars.value=Math.max((1-sm(-.2,.05,h))*(1-ov*.9),SF.stars);su.over.value=ov*(.55+.45*dayF)*(1-SF.above);   // overcast is below you once you are above the cloudssu.tm.value=t/1000;
    // lightning
    E.flash=Math.max(0,E.flash-dt*3.2);
    if(wx.storm>.5&&SF.weather>.5){nextFlash-=dt;if(nextFlash<=0){nextFlash=5+Math.random()*10;strike()}}
    if(wx.storm>.35&&SF.weather>.5){nextSheet-=dt;if(nextSheet<=0){nextSheet=6+Math.random()*12;E.flash=Math.max(E.flash,.22+.25*Math.random());thunder(1.5+Math.random()*3.5,.3)}}   // sheet lightning inside the clouds + distant rumble
    // wet ground: darkens + gets a faint sheen while it rains, dries slowly afterwards (terrain materials are registered in index.html)
    E.wet=Math.min(1,Math.max(0,E.wet+(wx.rain*SF.weather>.12?dt/16:-dt/120)));
    if(typeof TERRAIN_MATS!=='undefined'&&Math.abs(E.wet-lastWet)>.003){lastWet=E.wet;const w=E.wet,k=1-.24*w;for(const m of TERRAIN_MATS){m.color.setRGB(k*(1-.04*w),k,k*(1+.03*w));m.roughness=1-.42*w}}
    if(boltT>0){boltT-=dt;bolt.visible=boltT>0&&((boltT*60|0)%3!==0);if(boltT<=0)bolt.visible=false}
    su.flash.value=E.flash;
    // lights
    const stm=wx.storm*SF.weather,sunW=1.35*sm(-.08,.2,h)*(1-.62*ov-.28*stm),moonW=.5*(1-sm(-.1,.12,h))*(1-.45*ov); // sun and moon overlap around the horizon so sunrise/sunset never dip to black
    const ld=sun.userData.sd;ld.set(0,0,0).addScaledVector(sk.sunDir,sunW).addScaledVector(sk.moonDir,moonW);if(ld.lengthSq()<1e-6)ld.copy(sk.sunDir);ld.normalize();if(ld.y<.24){ld.y=.24;ld.normalize()}
    sun.intensity=sunW+moonW;sun.color.copy(P.sunDay).lerp(P.sunTw,Math.min(1,tw*1.2)).lerp(P.moon,moonW/Math.max(.001,sunW+moonW));
    hemi.color.copy(P.hsNight).lerp(P.hsDay,dayF);hemi.groundColor.copy(P.hgNight).lerp(P.hgDay,dayF);hemi.intensity=(.22+.53*dayF)*(1-.25*ov-.3*stm)+E.flash*.6+.5*SF.dark*(.4+.6*dayF);   // up high the sunlit world below fills the shadows, so you stay readable against the dark sky
    amb.intensity=.12-(1-dayF)*.03+E.flash*1.4;
    renderer.toneMappingExposure=lerp(1.05,.95,dayF)*(1-.14*stm);
    // fog + background follow the horizon colour, greyed and tightened by weather; inside a cloud everything turns white and close
    const grey=Math.min(1,wx.cloud*.55+wx.rain*.25+wx.storm*.2)*SF.weather;   // above the weather the haze is the sky's own colour
    const fogC=tmpC.clone();fogC.copy(hor).lerp(tmpC2.copy(P.fogGrey).multiplyScalar(.35+.65*dayF),grey*.8).lerp(tmpC2.copy(P.fogStorm).multiplyScalar(.3+.7*dayF),wx.storm*.5*SF.weather);
    let near=lerp(150,60,Math.min(1,wx.rain*.6+wx.storm*.4)),far=lerp(1700,lerp(900,420,wx.storm),Math.min(1,wx.rain+wx.cloud*.15));
    updateClouds(dt,sk,ov);
    const inC=E.inCloud;if(inC>.01){fogC.lerp(tmpC2.copy(P.cloudDay).multiplyScalar(.25+.75*dayF),Math.min(1,inC*.9));near=lerp(near,2,inC);far=lerp(far,85,inC)}
    if(SF.thin>0){near=lerp(near,6000,SF.thin);far=lerp(far,200000,SF.thin)}   // the air thins out: the world stays visible far below
    if(SF.space>0){near=lerp(near,3e5,SF.space);far=lerp(far,7e5,SF.space)}    // in space there is no haze within 300 km; the real world fades into the dark by 700 km while SpaceEnv's impostor takes over
    // underwater: tight teal fog that darkens with depth (S.under = how submerged the camera is; S.y = depth, surface -1)
    const un=S.under||0;
    if(un>.001){const dep=Math.min(1,Math.max(0,(-1-S.y)/16));tmpC2.set('#1b8c9a').multiplyScalar(.28+.72*dayF).lerp(tmpC.set('#031826'),dep*.7);fogC.lerp(tmpC2,Math.min(1,un*1.1));near=lerp(near,1,un);far=lerp(far,34+40*dayF*(1-dep*.7),un)}
    sun.intensity*=1-.5*un;hemi.intensity*=1-.25*un;                                                    // less light under the surface
    sky.visible=un<.5;                                                                                   // the sky is not visible from under the sea
    seaMesh.material.emissive.set('#2aa3b4').multiplyScalar(un*(.12+.5*dayF));                           // sea surface seen from below glows (it is lit by the sun above)
    scene.fog.color.copy(fogC);scene.fog.near=near;scene.fog.far=far;scene.background.copy(fogC);
    seaMesh.material.color.copy(P.seaNight).lerp(P.seaDay,dayF);
    // rain
    updateRain(dt,SF.weather<1?Object.assign({},wx,{rain:wx.rain*SF.weather,storm:wx.storm*SF.weather}):wx);
    if(un>.3)rain.visible=false;
    // fireflies
    if(fireflies){const a=Math.max(0,1-dayF*1.6)*(1-wx.rain)*(S.y<8?1:0);fireflies.material.opacity=a*.85;fireflies.visible=a>.02;
      if(fireflies.visible){fireflies.position.set(S.x,Math.max(0,H(S.x,S.z)),S.z);const pa=fireflies.geometry.attributes.position.array,b=fireflies.userData.base;for(let i=0;i<pa.length;i+=3){pa[i]=b[i]+Math.sin(t/900+i)*2;pa[i+1]=b[i+1]+Math.sin(t/700+i*1.7)*.8;pa[i+2]=b[i+2]+Math.cos(t/1100+i)*2}fireflies.geometry.attributes.position.needsUpdate=true}}
    // audio
    if(rainG&&AC&&E.sound){const al=(S.y>500?.3:1)*(1-.8*(S.under||0)),k=Math.min(1,dt*2);rainG.gain.value+=((wx.rain*.085*al)-rainG.gain.value)*k;patG.gain.value+=((wx.rain*(.07+.07*wx.storm)*al)-patG.gain.value)*k}
    // chip text
    const hh=Math.floor(u*24),mm=Math.floor((u*24-hh)*60),icon=wx.storm>.6?'⛈️':wx.rain>.4?'🌧️':wx.cloud>.5?'☁️':h<-.1?'🌙':tw>.5?(u<.5?'🌅':'🌇'):wx.cloud>.3?'🌤️':'☀️';
    const txt=icon+' '+String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+(Math.hypot(S.x,S.y,S.z)>150000?' · '+(Math.round(Math.hypot(S.x,S.y,S.z)/1000)).toLocaleString('en-US')+' km from home':S.y>=1000?' · ↑'+(S.y/1000).toFixed(1)+' km':S.y>250?' · ↑'+Math.round(S.y)+'m':'');if(txt!==E.label){E.label=txt;chip.textContent=txt}
  }
  function strike(){
    E.flash=1;setTimeout(()=>{E.flash=Math.max(E.flash,.7)},140);
    const a=S.rot+(Math.random()-.5)*1.6,d=300+Math.random()*350,x=S.x+Math.sin(a)*d,z=S.z+Math.cos(a)*d,gy=Math.max(0,H(x,z));
    let px=x,py=520,pz=z;const n=bolt.children.length;
    bolt.children.forEach((m,i)=>{const ny=py-(520-gy)/n,nx=px+(Math.random()-.5)*50,nz=pz+(Math.random()-.5)*50;m.position.set(px,py,pz);m.lookAt(nx,ny,nz);const len=Math.hypot(nx-px,ny-py,nz-pz),r=2.4*(1-i/n)+.7;m.scale.set(r,r,len);px=nx;py=ny;pz=nz});
    bolt.visible=true;boltT=.3;thunder(.4+d/340,.55)}
  function updateClouds(dt,sk,ov){
    const SF=typeof Space!=='undefined'?Space.f:NOSPACE,wx=E.wx,wind=5+wx.cloud*4+wx.storm*14;offX+=dt*wind*.8;offZ+=dt*wind*.35;
    const sdx=sk.sunDir.x,sdz=sk.sunDir.z,sdl=Math.hypot(sdx,sdz)||1,gl=sk.dayF*(1-sm(.05,.62,sk.h))*(1-ov*.5);   // golden-hour factor + horizontal sun direction: clouds on the sun side glow warm
    let inside=0;const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z,cover=wx.cloud,cnt=[0,0,0];cloudT+=dt;
    for(let i=0;i<clouds.length;i++){const c=clouds[i];
      let rx=((c.bx+offX-S.x)%CW+CW*1.5)%CW-CW/2,rz=((c.bz+offZ-S.z)%CW+CW*1.5)%CW-CW/2;
      const clr=Math.abs(c.by-SKY.base)<150?sm(SKY.R+90,SKY.R+190,Math.hypot(S.x+rx-SKY.x,S.z+rz-SKY.z)):1, // keep a clearing in the clouds around the floating island
        vis=sm(c.th,c.th+.18,cover)*(.55+.45*cover)*clr*(1-SF.above)*(i<N_CLOUD*E.cloudLod?1:0), // cloudLod: island quality tiers drop clouds when the frame rate is low
       sc=c.w*(.65+.5*cover)*vis,hs=c.hgt*(.7+.6*cover)*vis;c.vis=vis;
      _p.set(S.x+rx,c.by+Math.sin(cloudT*.1+i*1.7)*2.5,S.z+rz);
      if(vis>.02){const v=i%3;_e.set(0,c.yaw,0);_q.setFromEuler(_e);_s.set(Math.max(sc,.001),Math.max(hs*(1+.03*Math.sin(cloudT*.07+i)),.001),Math.max(sc*.8,.001));_m.compose(_p,_q,_s);cloudMeshes[v].setMatrixAt(cnt[v],_m);
        // per-cloud tint (no extra draw calls): thick/low clouds greyer underneath, high ones whiter, sun-side ones warm and bright at golden hour
        const rl=Math.hypot(rx,rz)||1,sd=Math.max(0,(rx*sdx+rz*sdz)/(rl*sdl)),glow=Math.pow(sd,3)*gl*vis,b=(c.by>600?1.06:.94-.16*c.th)+.14*glow;
        _col.setRGB(b*(1+.22*glow),b*(1-.06*glow),b*(1-.30*glow));cloudMeshes[v].setColorAt(cnt[v]++,_col)}
      if(vis>.05){const dx=(cx-_p.x)/(sc*.95),dy=(cy-_p.y)/(hs*1.25),dz=(cz-_p.z)/(sc*.8*.95),q=Math.sqrt(dx*dx+dy*dy+dz*dz);if(q<1)inside=Math.max(inside,1-q)}}
    for(let v=0;v<3;v++){cloudMeshes[v].count=cnt[v];cloudMeshes[v].instanceMatrix.needsUpdate=true;if(cloudMeshes[v].instanceColor)cloudMeshes[v].instanceColor.needsUpdate=true}
    E.inCloud+=(Math.min(1,inside*2.2)-E.inCloud)*Math.min(1,dt*3);
    cloudMat.emissive.setRGB(.5,.58,.8).multiplyScalar(Math.min(1,E.flash)*.55);   // lightning flashes light up the clouds from inside
    const m=cloudMat;m.color.copy(P.cloudNight).lerp(P.cloudDay,sk.dayF).lerp(P.cloudTw,sk.tw*.8).lerp(P.cloudStorm,Math.min(1,wx.rain*.35+wx.storm*.6));
    if(SF.above>0)m.color.lerp(cloudSun.set('#ffffff').multiplyScalar(.5+.5*sk.dayF),SF.above*.75);   // seen from above they are lit by the sun, not grey with weather
    m.emissive.copy(m.color).multiplyScalar(.12+.2*E.flash+.08*SF.above)}
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
  return {build,tick,makeSky,state:E,WX,skyAt,weatherAt,strike,cloudGeo,get cloudMat(){return cloudMat}}
})();
