// WARDEN: draws the sim's effects (CombatCore C.fx events 'fx' / 'fxburst' / 'fxend'): travelling shots and ground telegraphs for area bursts, each drawn in the look of ITS element.
// Bounded: a fixed pool (POOL shots + POOL rings), nothing is allocated per effect, and everything is hidden on clear(). The sim owns the truth (who gets hit); this only mirrors it,
// so a projectile moves at the same speed the sim uses (spd m/tick = spd*60 m/s) and disappears on the sim's 'fxend'.
// A ground ring is the TELL for an area move: it fades in over the sim's `delay` ticks (you can read it and leave), flashes on the burst, then fades out.
// Element looks (ST): fire, ember, lightning (jagged forked ribbons + a real sky strike), arrow, holy (pillar of light), sun, water, poison, earth, darksun, shadow, eclipse, steel, blade.
// The style comes from the move (MAP) and, for a few, the caster (e.fk = the foe type id, set by PlayerCombat). e.sty from the move data wins when it names a style.
// Globals used: THREE, scene, H, (optional) WardenVfx.
const WardenFx=(()=>{
  const POOL=6,TICK=1/60,BT=.42,RND=Math.random;
  let G=null,proj=[],ring=[],live={},orbs=[],BG=null;
  // c core, h halo, t tail, d ground disc, r rim, k column, v WardenVfx colour set (0 amber 1 violet 2 blue 3 orange), cr/ch column radius/height factor, nb normal-blend column (smoke/dust), ty shot kind
  const ST={
    fire:     {c:'#fff1b0',h:'#ff7a18',t:'#ff5a10',d:'#ff3a10',r:'#ffc040',k:'#ff6a18',v:3,cr:.8,ch:1},
    ember:    {c:'#ffd9a8',h:'#ff3c10',t:'#b01c08',d:'#a81406',r:'#ff7a28',k:'#ff4010',v:3,cr:.85,ch:1.1},
    lightning:{c:'#ffffff',h:'#5aa8ff',t:'#a8d4ff',d:'#16328c',r:'#c4e8ff',k:'#8cc4ff',v:2,cr:.3,ch:3.2,ty:'bolt',sky:1},
    arrow:    {c:'#ffffff',h:'#ffe8b0',t:'#fff0c8',d:'#806040',r:'#e8d0a0',k:'#e8d0a0',v:0,cr:.5,ch:.6,ty:'arrow'},
    holy:     {c:'#ffffff',h:'#ffe27a',t:'#fff3b8',d:'#e8c040',r:'#fff8dc',k:'#ffe9a0',v:0,cr:.5,ch:2.6,ty:'orb'},
    sun:      {c:'#ffffff',h:'#ffb030',t:'#ff8a10',d:'#ff9a10',r:'#fff0a0',k:'#ffcc50',v:0,cr:.75,ch:2.2},
    water:    {c:'#eafcff',h:'#2ec8e8',t:'#6ae0ff',d:'#0a6a9a',r:'#a8f0ff',k:'#40c0f0',v:2,cr:.85,ch:.9},
    poison:   {c:'#e4ffb4',h:'#7ad020',t:'#4a9a10',d:'#3a7a10',r:'#b8f060',k:'#6ac020',v:0,cr:.8,ch:.9,nb:1},
    earth:    {c:'#d8bc88',h:'#8a6a3a',t:'#6a4a2a',d:'#5a3e22',r:'#c8a060',k:'#8a6a3a',v:0,cr:.7,ch:.6,nb:1},
    darksun:  {c:'#2a0a40',h:'#b060ff',t:'#6a20c0',d:'#2a0a50',r:'#d8a0ff',k:'#8a40e0',v:1,cr:.7,ch:1.4},
    shadow:   {c:'#10101a',h:'#8a50c0',t:'#3a2060',d:'#10101a',r:'#9a60d0',k:'#3a2060',v:1,cr:.8,ch:1.2,nb:1},
    eclipse:  {c:'#000000',h:'#ffd070',t:'#ffb040',d:'#050308',r:'#ffd070',k:'#ffb040',v:0,cr:.9,ch:1.6},
    steel:    {c:'#ffffff',h:'#bcd4ff',t:'#e0ecff',d:'#8aa4d8',r:'#ffffff',k:'#c0d8ff',v:2,cr:.6,ch:1.2},
    blade:    {c:'#ffffff',h:'#bcd4ff',t:'#e0ecff',d:'#8aa4d8',r:'#ffffff',k:'#c0d8ff',v:2,cr:.6,ch:1.2,ty:'blade'}};
  const MAP={orb:'fire',bolt:'arrow',quake:'earth',rain:'lightning',requiem:'ember',lance:'holy',returning:'holy',consecrate:'holy',procession:'holy',groundbreaker:'ember',ashwave:'ember',crossflame:'ember',
    kingsfall:'sun',tidal:'water',spores:'poison',bladestorm:'blade',swordring:'steel',sunvolley:'darksun',snakelash:'shadow',eclipse:'eclipse',sever:'steel',sever2:'steel',severF:'holy'};
  function pick(e){if(e.sty&&ST[e.sty])return e.sty;let s=MAP[e.move]||'fire';if(e.fk==='gdn'){if(s==='holy')s='sun';else if(s==='arrow')s='darksun'}return s}
  // ---- jagged ribbon (lightning): S strands of N segments, each drawn as crossed quads (visible from any angle) in two layers, a wide blue glow and a thin white core. Additive. ----
  function Bolt(S,N){
    const nq=S*N*4,pos=new Float32Array(nq*12),col=new Float32Array(nq*12),idx=new Uint16Array(nq*6);
    for(let q=0;q<nq;q++){const b=q*4;idx.set([b,b+1,b+2,b,b+2,b+3],q*6)}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(new THREE.BufferAttribute(idx,1));
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));m.frustumCulled=false;m.renderOrder=11;m.visible=false;
    const P=[];for(let s=0;s<S;s++){const a=[];for(let i=0;i<=N;i++)a.push({x:0,y:0,z:0});P.push(a)}
    const o={m,pos,g,S,N,P,acc:9,
      tint(hex){const c=new THREE.Color(hex);for(let q=0;q<nq;q++){const core=(q&1)===1;for(let v=0;v<4;v++){const k=(q*4+v)*3;col[k]=core?1:c.r*.55;col[k+1]=core?1:c.g*.55;col[k+2]=core?1:c.b*.55}}g.attributes.color.needsUpdate=true},
      // write strand s from its point list P[s] with half-width w
      put(s,w){const a=P[s],N=o.N;for(let i=0;i<N;i++){const A=a[i],B=a[i+1];let dx=B.x-A.x,dy=B.y-A.y,dz=B.z-A.z;const L=Math.hypot(dx,dy,dz)||1;dx/=L;dy/=L;dz/=L;
        let rx=0,ry=1,rz=0;if(Math.abs(dy)>.9){rx=1;ry=0}
        let ax=dy*rz-dz*ry,ay=dz*rx-dx*rz,az=dx*ry-dy*rx;const al=Math.hypot(ax,ay,az)||1;ax/=al;ay/=al;az/=al;
        const bx=dy*az-dz*ay,by=dz*ax-dx*az,bz=dx*ay-dy*ax;
        for(let k=0;k<4;k++){const wd=(k&1)?w:w*3.4,px=(k<2?ax:bx)*wd,py=(k<2?ay:by)*wd,pz=(k<2?az:bz)*wd,q=((s*N+i)*4+k)*12;
          pos[q]=A.x-px;pos[q+1]=A.y-py;pos[q+2]=A.z-pz;pos[q+3]=A.x+px;pos[q+4]=A.y+py;pos[q+5]=A.z+pz;pos[q+6]=B.x+px;pos[q+7]=B.y+py;pos[q+8]=B.z+pz;pos[q+9]=B.x-px;pos[q+10]=B.y-py;pos[q+11]=B.z-pz}}
        g.attributes.position.needsUpdate=true},
      zero(s){const N=o.N;pos.fill(0,s*N*48,(s+1)*N*48);g.attributes.position.needsUpdate=true}};
    return o}
  // a jittered line a->b into strand s (ends pinned); amp = sideways wander in metres
  function zig(b,s,ax,ay,az,bx,by,bz,amp){const a=b.P[s],N=b.N;for(let i=0;i<=N;i++){const t=i/N,k=Math.sin(Math.PI*t)*amp;const p=a[i];p.x=ax+(bx-ax)*t+(RND()-.5)*2*k;p.y=ay+(by-ay)*t+(RND()-.5)*k*.5;p.z=az+(bz-az)*t+(RND()-.5)*2*k}}
  // a floating sword: blade + crossguard + grip (local +Z is the tip)
  function sword(sc){if(!BG){const bm=new THREE.MeshBasicMaterial({color:'#e6efff',fog:false}),gm=new THREE.MeshBasicMaterial({color:'#ffd77a',fog:false});BG={bm,gm,b:new THREE.BoxGeometry(.13,.04,1.05),g:new THREE.BoxGeometry(.42,.07,.08),h:new THREE.BoxGeometry(.07,.07,.3)}}
    const g=new THREE.Group(),b=new THREE.Mesh(BG.b,BG.bm),c=new THREE.Mesh(BG.g,BG.gm),h=new THREE.Mesh(BG.h,BG.gm);b.position.z=.62;c.position.z=.08;h.position.z=-.1;g.add(b);g.add(c);g.add(h);g.scale.setScalar(sc||1);g.frustumCulled=false;return g}
  function build(){
    if(G)return;G=new THREE.Group();G.name='WardenFx';scene.add(G);
    const sph=new THREE.SphereGeometry(.34,10,8),disc=new THREE.CircleGeometry(1,28),rim=new THREE.RingGeometry(.8,1,36),rim2=new THREE.RingGeometry(.5,.56,32),col=new THREE.CylinderGeometry(1,1,5,24,1,true);
    const cone=new THREE.ConeGeometry(.36,1,8,1,true);cone.rotateX(-Math.PI/2);cone.translate(0,0,-.5);   // base at the shot, apex 1 m behind it
    const head=new THREE.ConeGeometry(.07,.22,6);head.rotateX(Math.PI/2);
    const shaft=new THREE.BoxGeometry(.045,.045,1.15),fl=new THREE.BoxGeometry(.2,.012,.24);
    const mb=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c,transparent:true,depthWrite:false,fog:false},o||{}));
    const add={blending:THREE.AdditiveBlending};
    // two tiny canvas gradients: a soft round glow (shot halos) and a bottom-to-top fade (light columns), so nothing reads as a hard-edged solid
    const cv=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');f(x,w,h);const t=new THREE.CanvasTexture(c);t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;return t};
    const glowT=cv(64,64,(x,w,h)=>{const g=x.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.65)');g.addColorStop(.6,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,w,h)});
    const fadeT=cv(4,64,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.7,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,1)');x.fillStyle=g;x.fillRect(0,0,w,h)});
    for(let i=0;i<POOL;i++){
      const core=new THREE.Mesh(sph,mb('#fff4c0')),halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,color:'#ff3a12',transparent:true,opacity:.9,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false}));halo.scale.setScalar(3);halo.renderOrder=9;core.scale.setScalar(.7);
      const shd=new THREE.Mesh(disc,mb('#ff2a1a',{opacity:.2,depthTest:false}));shd.rotation.x=-Math.PI/2;shd.scale.setScalar(.6);shd.renderOrder=8;
      const tail=new THREE.Mesh(cone,mb('#ff5a10',{opacity:.55,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthTest:false}));tail.renderOrder=9;
      const g=new THREE.Group();g.add(tail);g.add(halo);g.add(core);g.add(shd);const bl=sword(1.5);bl.visible=false;g.add(bl);
      // an arrow: pale shaft, steel head, two crossed red fletches, a thin glowing streak behind
      const ar=new THREE.Group(),as=new THREE.Mesh(shaft,mb('#e6d2a4',{depthTest:false})),ah=new THREE.Mesh(head,mb('#f4f8ff',{depthTest:false})),f1=new THREE.Mesh(fl,mb('#ff5a3a',{depthTest:false})),f2=new THREE.Mesh(fl,mb('#ff5a3a',{depthTest:false})),st=new THREE.Mesh(cone,mb('#fff0c8',add));
      ah.position.z=.66;f1.position.z=f2.position.z=-.5;f2.rotation.z=Math.PI/2;st.position.z=-.5;st.scale.set(.2,.2,3);as.renderOrder=ah.renderOrder=f1.renderOrder=f2.renderOrder=12;st.renderOrder=9;ar.add(st);ar.add(as);ar.add(ah);ar.add(f1);ar.add(f2);ar.visible=false;g.add(ar);
      const lb=Bolt(2,10);g.add(lb.m);
      g.visible=false;g.frustumCulled=false;G.add(g);proj.push({g,core,halo,shd,bl,tail,ar,ars:[as,ah,f1,f2],st,lb,s:'fire',ty:'orb',id:0,x:0,z:0,dx:0,dz:0,v:0,t:0});
      const d=new THREE.Mesh(disc,mb('#ff1e12',{opacity:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})),r=new THREE.Mesh(rim,mb('#ffd24a',{opacity:0,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})),r2=new THREE.Mesh(rim2,mb('#ffd24a',{opacity:0,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
      d.rotation.x=r.rotation.x=r2.rotation.x=-Math.PI/2;const rg=new THREE.Group();const c=new THREE.Mesh(col,mb('#ff4a1a',{opacity:0,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,map:fadeT}));c.position.y=2.5;
      // a storm cloud high over the ring (lightning only): three flat dark puffs
      const cl=new THREE.Group();for(let k=0;k<3;k++){const p=new THREE.Mesh(disc,mb('#141a30',{opacity:0}));p.rotation.x=-Math.PI/2;p.position.set((k-1)*.55,13+k*.12,(k%2?.35:-.3));p.scale.setScalar(.8+.1*k);cl.add(p)}cl.visible=false;
      const sb=Bolt(3,12);rg.add(d);rg.add(r);rg.add(r2);rg.add(c);rg.add(cl);rg.add(sb.m);rg.visible=false;rg.frustumCulled=false;G.add(rg);ring.push({g:rg,d,r,r2,c,cl,sb,s:'fire',id:0,R:1,delay:0,t:0,burst:-1,end:-1,x:0,z:0})}}
  const free=a=>a.find(o=>!o.g.visible);
  const setC=(m,h)=>m.color.set(h);
  function styleProj(p,s){const T=ST[s]||ST.fire,ty=T.ty==='bolt'||T.ty==='arrow'||T.ty==='blade'?T.ty:'orb';p.s=s;p.ty=ty;
    p.core.visible=p.halo.visible=p.tail.visible=p.shd.visible=ty==='orb'||ty==='bolt';p.bl.visible=ty==='blade';p.ar.visible=ty==='arrow';p.lb.m.visible=ty==='bolt';
    if(ty==='orb'||ty==='bolt'){setC(p.core.material,T.c);setC(p.halo.material,T.h);setC(p.tail.material,T.t);setC(p.shd.material,T.d);p.tail.visible=ty==='orb';
      if(s==='darksun'){p.core.material.blending=THREE.NormalBlending;p.halo.material.opacity=1}else{p.core.material.blending=THREE.NormalBlending;p.halo.material.opacity=.9}
      p.tail.scale.set(.6,.6,s==='holy'?4.2:2.4)}
    if(ty==='bolt')p.lb.tint(T.h);
    if(ty==='arrow')setC(p.st.material,T.t)}
  function styleRing(r,s){const T=ST[s]||ST.fire;r.s=s;setC(r.d.material,T.d);setC(r.r.material,T.r);setC(r.r2.material,T.r);setC(r.c.material,T.k);
    r.c.material.blending=T.nb?THREE.NormalBlending:THREE.AdditiveBlending;r.c.material.needsUpdate=true;r.cl.visible=!!T.sky;r.sb.m.visible=false;if(T.sky)r.sb.tint(T.h)}
  function spark(x,z,s,big){if(typeof WardenVfx==='undefined'||!WardenVfx.spawn)return;const T=ST[s]||ST.fire;try{if(big)WardenVfx.burst(x,H(x,z)+.5,z,T.v);else WardenVfx.spawn(x,H(x,z)+1.2,z,T.v,3,1.6,RND()*6.28,26)}catch(e){}}
  function event(e){
    if(!G)return;
    if(e.t==='fx'){const s=pick(e);
      if(e.k==='proj'){const p=free(proj)||proj[0];p.id=e.fid;p.x=e.x;p.z=e.z;p.dx=e.dx;p.dz=e.dz;p.v=(e.spd||.25)/TICK;p.t=0;styleProj(p,s);p.g.visible=true;const ty=p.ty;
        const rot=Math.atan2(e.dx,e.dz);p.bl.rotation.y=rot;p.ar.rotation.y=rot;p.tail.rotation.y=rot;p.lb.acc=9;
        if(ty==='blade'){p.g.scale.setScalar(1);const o=orbs.find(q=>q.id===e.a);if(o){const i=(o.next++)%o.bl.length;o.hid[i]=.9}}
        else if(ty==='arrow'||ty==='bolt')p.g.scale.setScalar(1);else p.g.scale.setScalar(Math.max(1.5,(e.r||.5)/.5*1.5));live[e.fid]=p}
      else{if(e.move==='swordring'){const o=orbs.find(q=>q.id===e.a);if(o)o.burst=.9}const r=free(ring)||ring[0];const T=ST[s]||ST.fire;
        r.id=e.fid;r.R=e.r||2;r.delay=Math.max(1,e.delay||1)*TICK;r.t=0;r.burst=-1;r.end=-1;r.x=e.x;r.z=e.z;styleRing(r,s);r.g.position.set(e.x,H(e.x,e.z)+.12,e.z);r.d.scale.setScalar(r.R);r.r.scale.setScalar(r.R);r.r2.scale.setScalar(r.R);
        r.c.scale.set(r.R*T.cr,T.ch,r.R*T.cr);r.c.position.y=2.5*T.ch;r.c.material.opacity=0;r.cl.children.forEach(m=>m.material.opacity=0);r.cl.scale.setScalar(Math.max(1.4,r.R*1.1));r.sb.acc=9;r.g.visible=true;live[e.fid]=r}}
    else if(e.t==='fxburst'){const r=live[e.fid];if(r&&r.d){r.burst=r.t;const T=ST[r.s]||ST.fire;spark(r.x,r.z,r.s,true);
      if(T.sky){r.sb.m.visible=true;r.sb.m.material.opacity=1;r.sb.acc=9;r.bt=0}}}
    else if(e.t==='fxend'){const o=live[e.fid];if(!o)return;if(o.d){o.end=o.t}else{if(e.why==='hit'||e.why==='wall')spark(e.x,e.z,o.s,false);o.g.visible=false}delete live[e.fid]}}
  function styleOf(fid){const o=live[fid];return o?o.s:null}
  // the Saint's own swords: they float round her, speed up while she casts, spin out when the Sword Ring goes off; one leaves the orbit for every blade she throws
  function orbit(F,n){if(!G||!F||!F.f)return;const o={id:F.id,F,n:n||6,a:0,next:0,burst:0,hid:[],bl:[],g:new THREE.Group()};for(let i=0;i<o.n;i++){const b=sword(1.6);o.g.add(b);o.bl.push(b);o.hid.push(0)}o.g.frustumCulled=false;G.add(o.g);orbs.push(o)}
  function updOrbs(dt){
    for(const o of orbs){const f=o.F.f,alive=f.act!=='dead'&&o.F.awake!==false&&!(o.F.body&&o.F.body.g&&o.F.body.g.visible===false);o.g.visible=alive;if(!alive)continue;
      const cast=f.act==='attack',sp=o.burst>0?9:cast?3.4:1.1;o.a+=sp*dt;if(o.burst>0)o.burst-=dt;
      const R=o.burst>0?2.4+Math.sin((.9-o.burst)/.9*Math.PI)*.8:cast?.95:1.35,gy=H(f.x,f.z)+1.9*(o.F.T.scale/1.5||1);o.g.position.set(f.x,gy,f.z);
      for(let i=0;i<o.n;i++){const a=o.a+i*Math.PI*2/o.n,b=o.bl[i];if(o.hid[i]>0)o.hid[i]-=dt;b.visible=o.hid[i]<=0;b.position.set(Math.cos(a)*R,Math.sin(o.a*1.7+i*1.3)*.18+(i%2?.25:-.1),Math.sin(a)*R);b.rotation.y=Math.atan2(-Math.sin(a),Math.cos(a))}}}
  const FLK=t=>.8+.2*Math.sin(t*47)*Math.sin(t*31);
  function update(dt){
    if(!G)return;updOrbs(dt);
    for(const p of proj){if(!p.g.visible)continue;p.t+=dt;p.x+=p.dx*p.v*dt;p.z+=p.dz*p.v*dt;const gy=H(p.x,p.z);p.g.position.set(p.x,gy+1.3,p.z);p.shd.position.y=-1.15;
      const k=1+.15*Math.sin(p.t*30);
      if(p.ty==='orb'){p.halo.scale.setScalar(3.4*k*(p.s==='fire'||p.s==='ember'?1+.12*Math.sin(p.t*53):1));p.tail.material.opacity=.5*FLK(p.t)}
      else if(p.ty==='bolt'){p.halo.scale.setScalar(3.6*k);p.lb.acc+=dt;
        if(p.lb.acc>.035){p.lb.acc=0;const b=p.lb,dx=-p.dx*3.8,dz=-p.dz*3.8;zig(b,0,0,0,0,dx,0,dz,.34);const m=b.P[0][4],ex=m.x+(RND()-.5)*2.2,ey=m.y+(RND()-.5)*1.8,ez=m.z+(RND()-.5)*2.2;zig(b,1,m.x,m.y,m.z,ex,ey,ez,.22);b.put(0,.045);b.put(1,.03)}
        p.lb.m.material.opacity=.75+.25*RND()}
      if(p.t>6)p.g.visible=false}
    for(const r of ring){if(!r.g.visible)continue;r.t+=dt;const T=ST[r.s]||ST.fire,sky=T.sky;
      if(r.burst<0&&r.end<0){const u=Math.min(1,r.t/r.delay);r.d.material.opacity=.22+.3*u*u;r.r.material.opacity=.6+.4*u*(.6+.4*Math.sin(r.t*18));r.r2.material.opacity=.5*u;r.r2.rotation.z=r.t*1.6;r.c.material.opacity=.12*u;
        if(sky){const co=.5*Math.min(1,r.t/.25)*(.7+.3*u);r.cl.children.forEach(m=>m.material.opacity=co);
          if(u>.62){const b=r.sb;b.m.visible=true;b.m.material.opacity=.14+.5*(u-.62)/.38*RND();b.acc+=dt;if(b.acc>.06){b.acc=0;zig(b,0,(RND()-.5)*.6,13,(RND()-.5)*.6,0,.1,0,1);b.zero(1);b.zero(2);b.put(0,.05)}}}
        else if(T.nb&&r.s!=='earth'){r.c.material.opacity=.2*u}}
      else if(r.end<0){const bt=r.t-r.burst,u=Math.min(1,bt/.2);r.d.material.opacity=.85*(1-u*.3);r.r.material.opacity=1;r.r2.material.opacity=1-u;r.r.scale.setScalar(r.R*(1+.18*u));r.c.material.opacity=(T.nb?.45:.6)*(1-u);r.r2.rotation.z=r.t*3;
        if(sky)strike(r,bt)}
      else{const bt=r.t-r.burst,u=(r.t-r.end)/.3,uu=Math.min(1,u);if(sky&&bt<BT)strike(r,bt);else if(sky)r.sb.m.visible=false;
        if(u>=1&&(!sky||bt>=BT)){r.g.visible=false;r.sb.m.visible=false;continue}
        r.d.material.opacity=.5*(1-uu);r.r.material.opacity=1-uu;r.r2.material.opacity=0;r.c.material.opacity=0;r.cl.children.forEach(m=>m.material.opacity=.5*(1-uu))}}}
  // the sky strike: a forked bolt from the cloud to the centre of the ring, flickering for BT seconds
  function strike(r,bt){const b=r.sb;if(bt>=BT){b.m.visible=false;return}
    b.m.visible=true;b.m.material.opacity=bt<.1?1:Math.max(0,(RND()>.3?1:.4)*(1-(bt-.1)/(BT-.1)));
    r.cl.children.forEach(m=>m.material.opacity=.5*Math.min(1,1-(bt-.1)/.3+.3));
    b.acc+=1/60;if(b.acc>.045){b.acc=0;zig(b,0,(RND()-.5)*1.2,14,(RND()-.5)*1.2,(RND()-.5)*.3,.1,(RND()-.5)*.3,1.4);
      for(let s=1;s<3;s++){const m=b.P[0][s===1?4:7],sx=(RND()<.5?-1:1)*(1.8+RND()*2.2),sz=(RND()-.5)*3.4;zig(b,s,m.x,m.y,m.z,m.x+sx,Math.max(.1,m.y-4-RND()*3),m.z+sz,.5)}
      b.put(0,.11);b.put(1,.06);b.put(2,.06)}}
  function clear(){live={};for(const o of orbs){if(o.g.parent)o.g.parent.remove(o.g)}orbs=[];for(const p of proj){p.g.visible=false}for(const r of ring){r.g.visible=false;r.sb.m.visible=false}}
  return{build,event,update,clear,orbit,styleOf,ST,pick,_t:()=>({proj,ring,live,G})}})();
if(typeof module!=='undefined')module.exports=WardenFx;
