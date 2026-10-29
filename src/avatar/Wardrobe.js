// Wardrobe: the avatar customisation sheet. Landscape layout (live preview left, options right), works with touch. Nothing is purchased; every option is free.
// Wardrobe.open({current, busy, onApply}) - `current` is the player's appearance; `busy()` (optional) says whether the game is in a state where changing clothes is not allowed
// (combat, an Outlaw match...). Apply hands a normalised appearance to onApply; Cancel (or the backdrop / Escape) changes nothing.
// The preview is its own tiny three.js scene + renderer, created on open and fully disposed on close, so it never touches the game scene and costs nothing while closed.
const Wardrobe=(()=>{
  let root=null,css=false,st=null;
  const K=AvatarKit,el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
  const hex=n=>'#'+('000000'+n.toString(16)).slice(-6);
  function style(){
    if(css)return;css=true;const s=document.createElement('style');s.textContent=`
#avw{position:fixed;inset:0;z-index:60;display:none;background:#0a0e1ee6;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;font:14px/1.3 system-ui,sans-serif;touch-action:none}
#avw.on{display:flex}
#avw .pv{flex:0 0 38%;position:relative;min-width:0}
#avw .pv canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
#avw .pv .hint{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);text-align:center;font-size:11px;opacity:.6;pointer-events:none}
#avw .pn{flex:1;display:flex;flex-direction:column;min-width:0;padding:calc(env(safe-area-inset-top,0px) + 10px) calc(env(safe-area-inset-right,0px) + 14px) calc(env(safe-area-inset-bottom,0px) + 10px) 6px}
#avw .sc{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-right:4px}
#avw h3{margin:10px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;font-weight:600}
#avw h3:first-child{margin-top:0}
#avw button{width:auto;font-weight:500;background:#ffffff14;color:#fff}
#avw .row{display:flex;flex-wrap:wrap;gap:8px}
#avw .chip{padding:8px 12px;border-radius:10px;background:#ffffff14;border:1px solid #ffffff33;color:#fff;font-size:13px;min-height:38px}
#avw .chip.sel{background:#ffd27a;color:#1a1f3a;border-color:#ffd27a}
#avw .sw{width:38px;height:38px;min-height:0;border-radius:50%;border:2px solid #ffffff44;padding:0;flex:0 0 38px}
#avw .sw.sel{border-color:#ffd27a;box-shadow:0 0 0 2px #ffd27a88}
#avw .note{font-size:12px;opacity:.65;margin:2px 0}
#avw .bar{display:flex;gap:10px;padding-top:8px}
#avw .bar button{flex:1;width:auto;padding:12px;border-radius:12px;font-size:15px;border:0}
#avw .bar .ap{background:#ffd27a;color:#1a1f3a;font-weight:700}
#avw .bar .ap:disabled{opacity:.45}
#avw .bar .ca{background:#ffffff1f;color:#fff;border:1px solid #ffffff44}
#avw .warn{color:#ffb4a8;font-size:12px;min-height:16px}
@media (orientation:portrait){#avw .pv{flex-basis:30%}}`;
    document.head.appendChild(s)}
  function build(){
    root=el('div');root.id='avw';
    root.innerHTML='<div class="pv"><div class="hint">drag to turn</div></div><div class="pn"><div class="sc"></div><div class="warn"></div><div class="bar"><button class="ca">Cancel</button><button class="ap">Apply</button></div></div>';
    document.body.appendChild(root)}
  // ---------------- preview scene
  function startPreview(){
    const old=root.querySelector('canvas'),cv=document.createElement('canvas');if(old)old.remove();root.querySelector('.pv').prepend(cv);   // a fresh canvas per opening: one whose context was force-lost cannot give out a new one
    const r=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,powerPreference:'low-power'});
    r.outputEncoding=THREE.sRGBEncoding;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.95;r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    const sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(26,1,.1,50);
    sc.add(new THREE.HemisphereLight(0xdfe8ff,0x40362c,1.1));const d=new THREE.DirectionalLight(0xffffff,1.6);d.position.set(2,4,3);sc.add(d);const rim=new THREE.DirectionalLight(0x88aaff,.7);rim.position.set(-3,2,-3);sc.add(rim);
    const g=new THREE.Group();g.userData={rig:{visible:false},pan:1,rod:1};sc.add(g);
    const P={r,sc,cam,g,yaw:.35,t0:performance.now(),raf:0,drag:null};
    const size=()=>{const w=cv.clientWidth||300,h=cv.clientHeight||300;r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();const dist=Math.max(5,4.4/Math.min(1,cam.aspect*1.15));cam.position.set(0,1.1,dist);cam.lookAt(0,.92,0)};
    P.size=size;size();
    const down=e=>{P.drag={x:e.clientX,yaw:P.yaw};cv.setPointerCapture&&cv.setPointerCapture(e.pointerId)},move=e=>{if(P.drag)P.yaw=P.drag.yaw+(e.clientX-P.drag.x)*.012},up=()=>{P.drag=null};
    cv.addEventListener('pointerdown',down);cv.addEventListener('pointermove',move);cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);P.off=()=>{cv.removeEventListener('pointerdown',down);cv.removeEventListener('pointermove',move);cv.removeEventListener('pointerup',up);cv.removeEventListener('pointercancel',up)};
    const loop=()=>{P.raf=requestAnimationFrame(loop);const now=performance.now(),dt=Math.min(.05,(now-P.t0)/1000);P.t0=now;
      const u=g.userData;if(u.mixer){u.mixer.update(dt)}g.rotation.y=P.yaw+(P.drag?0:Math.sin(now/2600)*.12);
      if(cv.clientWidth!==P.w||cv.clientHeight!==P.h){P.w=cv.clientWidth;P.h=cv.clientHeight;size()}
      r.render(sc,cam)};
    loop();return P}
  function idle(P){const u=P.g.userData;if(u.nact&&u.nact.idle&&!u.nact.idle.isRunning()){u.nact.idle.reset().play()}}
  function stopPreview(P){
    cancelAnimationFrame(P.raf);P.off();K.dispose(P.g);P.sc.remove(P.g);
    P.sc.traverse(o=>{if(o.geometry&&!o.userData.avAcc&&!o.isSkinnedMesh)o.geometry.dispose()});
    P.r.dispose();if(P.r.forceContextLoss)P.r.forceContextLoss();P.r.domElement.width=P.r.domElement.height=1;P.r.domElement.remove()}
  // ---------------- controls
  function render(){
    const S=st,c=S.cur,sc=root.querySelector('.sc');sc.innerHTML='';
    const sec=(t)=>sc.appendChild(el('h3','',t));
    sec('Body');let row=sc.appendChild(el('div','row'));
    for(const id of Object.keys(K.CAT)){const b=el('button','chip'+(c.b===id?' sel':''),K.CAT[id].label+' · '+K.CAT[id].name);b.onclick=()=>set({b:id});row.appendChild(b)}
    sec(K.CAT[c.b].headLabel+' colour');row=sc.appendChild(el('div','row'));
    K.HAIR.forEach((h,i)=>{const b=el('button','sw'+(c.hc===i?' sel':''));b.title=h[0];b.setAttribute('aria-label',h[0]);b.style.background=h[1]==null?'conic-gradient(#3b2a22,#7a6a58,#2a2a30,#3b2a22)':hex(h[1]);b.onclick=()=>set({hc:i});row.appendChild(b)});
    sec('Outfit');row=sc.appendChild(el('div','row'));
    for(const L of K.LOOKS){const b=el('button','chip'+(c.o===L.id?' sel':''),L.name);b.onclick=()=>set({o:L.id});row.appendChild(b)}
    const pal=K.palFor(c.o);
    if(pal.length){sec('Clothing colour');row=sc.appendChild(el('div','row'));
      for(const i of pal){const b=el('button','sw'+(c.oc===i?' sel':''));b.title=K.PAL[i][0];b.setAttribute('aria-label',K.PAL[i][0]);b.style.background=hex(K.PAL[i][1]);b.onclick=()=>set({oc:i});row.appendChild(b)}}
    else sc.appendChild(el('p','note','The Signature outfit keeps its own colours. Pick another outfit to choose a colour.'));
    sec('Accessories');row=sc.appendChild(el('div','row'));
    for(const a of K.ACC){const on=!!(c.a&a.bit),b=el('button','chip'+(on?' sel':''),a.name);b.onclick=()=>set({a:on?c.a&~a.bit:c.a|a.bit});row.appendChild(b)}
    sc.appendChild(el('p','note','Cap and Headband are worn one at a time. All options are free.'))}
  function set(p){const S=st;S.cur=K.normalize(Object.assign({},S.cur,p));S.base=S.cur.b;render();K.apply(S.P.g,S.cur).then(()=>{if(st===S)idle(S.P)})}
  function busyNow(){try{return !!(st&&st.opts.busy&&st.opts.busy())}catch(e){return false}}
  function open(opts){
    if(st)return false;style();if(!root)build();
    if(opts.busy&&opts.busy()){if(opts.onBlocked)opts.onBlocked();return false}
    const S=st={opts,cur:K.normalize(opts.current||K.defaults(K.DEFAULT_BASE)),base:null};S.base=S.cur.b;
    root.classList.add('on');S.P=startPreview();
    root.querySelector('.ca').onclick=()=>close();
    root.querySelector('.ap').onclick=()=>{if(busyNow()){root.querySelector('.warn').textContent='Finish what you are doing first - you cannot change clothes right now.';return}
      const a=K.normalize(S.cur);close();try{opts.onApply&&opts.onApply(a)}catch(e){console.warn(e)}};
    S.key=e=>{if(e.key==='Escape')close()};window.addEventListener('keydown',S.key);
    S.watch=setInterval(()=>{const w=root.querySelector('.warn'),ap=root.querySelector('.ap');const b=busyNow();ap.disabled=b;w.textContent=b?'You are in the middle of something - changes can be applied afterwards.':''},500);   // combat can start while the sheet is open
    render();K.apply(S.P.g,S.cur).then(()=>{if(st===S)idle(S.P)});return true}
  function close(){
    const S=st;if(!S)return;st=null;clearInterval(S.watch);window.removeEventListener('keydown',S.key);
    root.classList.remove('on');stopPreview(S.P);root.querySelector('.warn').textContent='';root.querySelector('.ap').disabled=false}
  return {open,close,isOpen:()=>!!st};
})();
