// World map: 🗺️ button (or M key). Drag to pan, pinch/wheel to zoom, tap a place for Track / Travel.
// "Track" puts a waypoint arrow in the 3D view (reuses markToEl). Globals: S, others, LOCS, ISL, SKY, KT, OUT, TOWN, K, H, disc, hunt, markToEl, banner, Tag, RING, srun, BOARD, WP, slalom, dash.
const WorldMap=(()=>{
  let ov,cv,ctx,card,chips,btn,wmk,isOpen=false,sel=null,wp=null,raf=0;
  const view={cx:0,cz:0,s:.1},ptr=new Map();let pinch0=0,moved=0,W=0,Hh=0;
  const R0=()=>77*K;                               // main island radius (K is defined later in index.html, so read it lazily)
  const PORTAL={x:TOWN.x+Math.cos(5.7)*19,z:TOWN.z+Math.sin(5.7)*19};

  const places=()=>{
    const isl=new Set(ISL.map(i=>i.n).concat(['The Floating Island']));
    const l=LOCS.map(L=>({n:L.n,x:L.x,z:L.z,y:L.y,r:L.r,big:isl.has(L.n)}));
    l.push({n:'Tag Arena',x:Tag.pos.x,z:Tag.pos.z,r:5,icon:'🏃'},{n:'Gunsmith',x:OUT.x+12,z:OUT.z+23,r:5,icon:'🔫'},{n:'Outlaw Portal',x:PORTAL.x,z:PORTAL.z,r:5,icon:'🌀'},{n:'Bonk Ring',x:RING.x,z:RING.z,r:RING.R,icon:'🍳'},{n:'Treasure Hunt',x:BOARD.x,z:BOARD.z,r:5,icon:'🧰'},{n:'Sky Race',x:WP[0][0],z:WP[0][1],r:7,icon:'✈️'},{n:'Sky Slalom',x:slalom.start.x,z:slalom.start.z,y:slalom.start.y,r:5,icon:'🎯'});
    if(dash.start)l.push({n:'Obstacle Dash',x:dash.start.x,z:dash.start.z,r:5,icon:'🧗'});
    if(srun.start)l.push({n:'Shark Run',x:srun.start.x,z:srun.start.z,r:5,icon:'🦈'});
    if(typeof Verbs!=='undefined')try{l.push(...Verbs.places())}catch(e){} // discovered camps (systems add only what you have found)
    if(typeof Vaults!=='undefined')try{l.push(...Vaults.places())}catch(e){}
    if(typeof Events!=='undefined')try{l.push(...Events.places())}catch(e){} // a live event shows up once you have noticed it
    return l};
  const icon=p=>p.icon||(p.n==='Farm'?'🐄':p.n==='Outlaw Isle'?'🤠':p.n==='The Floating Island'?'☁️':p.n==='The Race Track'?'🏁':p.big?'🏝️':'📍');
  const dist=p=>Math.hypot(S.x-p.x,S.z-p.z);
  const fmt=d=>d<1000?Math.round(d/ (d<100?1:10))*(d<100?1:10)+' m':(d/1000).toFixed(1)+' km';
  const sx=x=>(x-view.cx)*view.s+W/2,sy=z=>(z-view.cz)*view.s+Hh/2;

  function fit(){
    let a=1e9,b=-1e9,c=1e9,d=-1e9;
    for(const p of places()){const r=p.big?p.r/.7:p.r;a=Math.min(a,p.x-r);b=Math.max(b,p.x+r);c=Math.min(c,p.z-r);d=Math.max(d,p.z+r)}
    view.cx=(a+b)/2;view.cz=(c+d)/2;view.s=Math.min(W/(b-a),(Hh-150)/(d-c))*.92}
  function centerOn(p,zoom){view.cx=p.x;view.cz=p.z;if(zoom)view.s=Math.max(view.s,zoom)}

  // ---------- drawing ----------
  function draw(){
    if(!isOpen)return;
    ctx.clearRect(0,0,W,Hh);
    const g=ctx.createLinearGradient(0,0,0,Hh);g.addColorStop(0,'#1d5a80');g.addColorStop(1,'#154560');ctx.fillStyle=g;ctx.fillRect(0,0,W,Hh);
    // 500 m grid
    ctx.strokeStyle='#ffffff14';ctx.lineWidth=1;ctx.beginPath();
    for(let x=Math.ceil((view.cx-W/2/view.s)/500)*500;x<view.cx+W/2/view.s;x+=500){ctx.moveTo(sx(x),0);ctx.lineTo(sx(x),Hh)}
    for(let z=Math.ceil((view.cz-Hh/2/view.s)/500)*500;z<view.cz+Hh/2/view.s;z+=500){ctx.moveTo(0,sy(z));ctx.lineTo(W,sy(z))}ctx.stroke();
    const disc2=(x,z,r,col,beach)=>{ctx.beginPath();ctx.arc(sx(x),sy(z),Math.max(2,r*view.s*(beach?1.12:1)),0,6.283);ctx.fillStyle=col;ctx.fill()};
    disc2(0,0,R0(),'#f0dca0',1);disc2(0,0,R0(),'#79b86a');                       // main island
    for(const I of ISL){disc2(I.x,I.z,I.R*.82,'#f0dca0',1);disc2(I.x,I.z,I.R*.82,I.n==='Outlaw Isle'?'#d9a24a':I.c+'cc')}
    ctx.save();ctx.globalAlpha=.9;disc2(SKY.x,SKY.z,SKY.R,'#ffffffcc');ctx.restore();   // floating island
    ctx.strokeStyle='#ffe066';ctx.lineWidth=2;ctx.strokeRect(sx(KT.x-KT.hw),sy(KT.z-KT.hh),KT.hw*2*view.s,KT.hh*2*view.s); // race track
    if(typeof hunt!=='undefined'&&hunt.on){ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('🧰',sx(hunt.x),sy(hunt.z))}
    // places
    ctx.textAlign='center';ctx.textBaseline='middle';
    const ps=places(),zoomed=view.s>.28;
    for(const p of ps){
      const x=sx(p.x),y=sy(p.z);if(x<-40||x>W+40||y<-40||y>Hh+40)continue;
      const found=disc.has(p.n),hot=p.n==='Outlaw Isle',s=p===sel;
      if(s||hot){ctx.beginPath();ctx.arc(x,y,s?20:17+Math.sin(Date.now()/250)*3,0,6.283);ctx.strokeStyle=s?'#fff':'#ff5a3d';ctx.lineWidth=3;ctx.stroke()}
      ctx.font=(p.big?'22px':'16px')+' sans-serif';ctx.globalAlpha=found||p.icon?1:.75;ctx.fillText(icon(p),x,y);ctx.globalAlpha=1;
      if(p.big||zoomed||s){ctx.font='bold 12px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#000b';ctx.fillStyle='#fff';
        const label=p.n+(found?' ✓':'');ctx.strokeText(label,x,y+(p.big?20:15));ctx.fillText(label,x,y+(p.big?20:15))}
    }
    // waypoint line
    if(wp){ctx.setLineDash([6,6]);ctx.strokeStyle='#ffd24a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx(S.x),sy(S.z));ctx.lineTo(sx(wp.x),sy(wp.z));ctx.stroke();ctx.setLineDash([])}
    // partner
    const o=others.size?others.values().next().value:null;
    if(o){const p=o.group.position;ctx.font='20px sans-serif';ctx.fillText('💗',sx(p.x),sy(p.z));ctx.font='bold 11px sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#000b';ctx.fillStyle='#ffc0d8';const nm=o.group.userData.nm||'Partner';ctx.strokeText(nm,sx(p.x),sy(p.z)+16);ctx.fillText(nm,sx(p.x),sy(p.z)+16)}
    // me: arrow facing S.rot
    ctx.save();ctx.translate(sx(S.x),sy(S.z));ctx.rotate(Math.PI-S.rot);ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(8,8);ctx.lineTo(0,4);ctx.lineTo(-8,8);ctx.closePath();
    ctx.fillStyle='#3df59a';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    raf=requestAnimationFrame(draw);
  }

  // ---------- UI ----------
  const E=(t,css,html)=>{const e=document.createElement(t);e.style.cssText=css||'';if(html)e.innerHTML=html;return e};
  function build(){
    if(ov)return;
    btn=E('button','position:fixed;z-index:6;right:var(--map-r,12px);top:var(--map-t,calc(env(safe-area-inset-top,0px) + 66px));width:var(--T,46px);height:var(--T,46px);border-radius:50%;border:0;background:#ffffffd9;font-size:var(--tf,24px);padding:0','🗺️');
    btn.onclick=toggle;document.body.appendChild(btn);
    ov=E('div','position:fixed;inset:0;z-index:30;display:none;touch-action:none;background:#154560');
    cv=E('canvas','position:absolute;inset:0;width:100%;height:100%;touch-action:none');ov.appendChild(cv);ctx=cv.getContext('2d');
    chips=E('div','position:absolute;left:0;right:56px;top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;gap:6px;overflow-x:auto;padding:4px 8px;-webkit-overflow-scrolling:touch');ov.appendChild(chips);
    const x=E('button','position:absolute;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);width:40px;height:40px;border-radius:50%;border:0;background:#fffe;font-size:20px;padding:0','✕');x.onclick=toggle;ov.appendChild(x);
    const zb=(t,b,f)=>{const e=E('button','position:absolute;right:12px;bottom:'+b+';width:44px;height:44px;border-radius:12px;border:0;background:#fffe;font-size:22px;padding:0',t);e.onclick=f;ov.appendChild(e)};
    zb('＋','calc(env(safe-area-inset-bottom,0px) + 150px)',()=>view.s*=1.5);zb('－','calc(env(safe-area-inset-bottom,0px) + 100px)',()=>view.s/=1.5);
    zb('◎','calc(env(safe-area-inset-bottom,0px) + 50px)',()=>centerOn({x:S.x,z:S.z},.3));
    card=E('div','position:absolute;left:10px;right:70px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);background:#1a1f3af2;color:#fff;border-radius:14px;padding:12px;font:15px sans-serif;display:none');ov.appendChild(card);
    document.body.appendChild(ov);
    // gestures: drag pans, pinch zooms, a short tap selects
    cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;pinch0=0});
    cv.addEventListener('pointermove',e=>{
      const p=ptr.get(e.pointerId);if(!p)return;
      if(ptr.size===2){const [a,b]=[...ptr.values()],d0=Math.hypot(a.x-b.x,a.y-b.y);p.x=e.clientX;p.y=e.clientY;const d1=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0)view.s=Math.max(.02,Math.min(3,view.s*d1/pinch0));pinch0=d1;moved=99;return}
      const dx=e.clientX-p.x,dy=e.clientY-p.y;moved+=Math.abs(dx)+Math.abs(dy);view.cx-=dx/view.s;view.cz-=dy/view.s;p.x=e.clientX;p.y=e.clientY});
    const up=e=>{const was=ptr.size===1&&moved<8;ptr.delete(e.pointerId);if(was)tap(e.clientX,e.clientY)};
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',e=>ptr.delete(e.pointerId));
    cv.addEventListener('wheel',e=>{e.preventDefault();view.s=Math.max(.02,Math.min(3,view.s*(e.deltaY<0?1.2:1/1.2)))},{passive:false});
    addEventListener('keydown',e=>{if(e.code==='KeyM'&&e.target.tagName!=='INPUT')toggle()});
    addEventListener('resize',size);
  }
  function size(){if(!cv)return;const r=window.devicePixelRatio||1;W=innerWidth;Hh=innerHeight;cv.width=W*r;cv.height=Hh*r;ctx.setTransform(r,0,0,r,0,0)}
  function tap(x,y){
    let best=null,bd=34;
    for(const p of places()){const d=Math.hypot(sx(p.x)-x,sy(p.z)-y);if(d<bd){bd=d;best=p}}
    select(best)}
  function select(p){
    sel=p;if(!p){card.style.display='none';return}
    const found=disc.has(p.n),tracking=wp&&wp.n===p.n,canGo=true;
    card.innerHTML='<b style="font-size:17px">'+icon(p)+' '+p.n+'</b> <small style="opacity:.7">'+(found||p.icon?(found?'discovered ✓':''):'not discovered yet')+'</small><br>'
      +'<span style="opacity:.85">'+fmt(dist(p))+' away'+(p.n==='The Floating Island'?' · up in the clouds':'')+'</span><div style="display:flex;gap:8px;margin-top:10px">'
      +'<button id="wmTrack" style="flex:1;padding:10px;border-radius:10px;border:0;background:'+(tracking?'#6b7280':'#ffd24a')+';font:inherit">'+(tracking?'Stop tracking':'📍 Track')+'</button>'
      +(canGo?'<button id="wmGo" style="flex:1;padding:10px;border-radius:10px;border:0;background:#3df59a;font:inherit">🚀 Travel</button>':'')+'</div>';
    card.style.display='block';
    card.querySelector('#wmTrack').onclick=()=>{wp=tracking?null:p;if(wp)banner('Tracking '+p.n+' · follow the arrow','MAP');select(p)};
    const go=card.querySelector('#wmGo');if(go)go.onclick=()=>travel(p)}
  function travel(p){
    const x=p.x,z=p.z+(p.n==='Outlaw Isle'?14:0);
    S.x=x;S.z=z;S.y=Math.max(H(x,z),p.y||-9)+1;S.vy=0;S.kx=0;S.kz=0;banner(p.n,'TRAVELLED');toggle()}
  function fillChips(){
    chips.innerHTML='';
    for(const p of places().filter(p=>p.big||p.icon||p.n==='Town Square'||p.n==='Farm')){
      const c=E('button','flex:none;border:0;border-radius:16px;padding:7px 12px;background:'+(p.n==='Outlaw Isle'?'#ff5a3d':'#ffffffe0')+';color:'+(p.n==='Outlaw Isle'?'#fff':'#111')+';font:13px sans-serif',icon(p)+' '+p.n);
      c.onclick=()=>{centerOn(p,.25);select(p)};chips.appendChild(c)}}
  function toggle(){
    build();isOpen=!isOpen;ov.style.display=isOpen?'block':'none';
    if(isOpen){size();fit();fillChips();select(wp);cancelAnimationFrame(raf);draw()}else cancelAnimationFrame(raf)}

  // ---------- in-world waypoint arrow ----------
  function tick(){
    build();
    if(!wp){if(wmk)wmk.style.display='none';return}
    if(!wmk){wmk=E('div','position:fixed;z-index:5;transform:translate(-50%,-50%);color:#ffd24a;text-align:center;font-size:28px;line-height:1;text-shadow:0 0 8px #000,0 2px 6px #000;pointer-events:none;display:none','<div>📍</div><small style="display:block;font:bold 14px sans-serif"></small>');document.body.appendChild(wmk)}
    const d=dist(wp);if(d<25){banner('You arrived at '+wp.n+'!','MAP');wp=null;wmk.style.display='none';return}
    markToEl(wmk,wp.x,Math.max(H(wp.x,wp.z),wp.y||0)+8,wp.z,wp.n+' · '+fmt(d));
  }
  return {tick,toggle};
})();
