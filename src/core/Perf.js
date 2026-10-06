// Perf: measurement + the two cheapest big wins for phones.
//  1. Adaptive resolution, as a LAST RESORT: only when the game is really slow (<~28 fps) we try one step down and measure. If the frame
//     time doesn't improve by >=15% the game is CPU/vertex-bound, not fill-bound, so we put the resolution back and stop trying (blurry for no gain is worse).
//  2. Shadow snapping: the sun's shadow camera follows the player. Snapping it to whole shadow-map texels (in light space) stops the
//     shadow edges from shimmering/crawling while you walk.
//  3. ?perf=1 overlay: fps, frame ms, draw calls, triangles, pixel ratio. Use it to compare phases.
// Globals used at runtime: THREE (none directly), renderer passed to init().
const Perf=(()=>{
  const q=location.search.match(/[?&]dpr=([\d.]+)/),lv=location.search.match(/[?&]perf=(\d)/);
  const st={r:null,cap:2,min:1.5,dpr:2,ema:16.7,n:0,t0:performance.now(),slowT:0,probe:null,locked:false,lastChange:0,ov:null,ovT:0,lvl:lv?+lv[1]:0,fixed:q?parseFloat(q[1]):0,census:''};
  function init(r){st.r=r;st.cap=Math.min(window.devicePixelRatio||1,2);st.dpr=st.fixed?Math.min(st.fixed,st.cap):st.cap;r.setPixelRatio(st.dpr);if(st.lvl)overlay()}
  function setDpr(v){v=Math.max(st.min,Math.min(st.cap,v));if(Math.abs(v-st.dpr)<.01)return false;st.dpr=v;st.r.setPixelRatio(v);return true} // also resizes the canvas
  // ms = raw time since the previous frame
  function frame(ms){
    if(!st.r||!(ms>0)||ms>120)return;                       // ignore tab-switch / loading hitches
    st.n++;st.ema+=(ms-st.ema)*.05;
    const now=performance.now(),warm=now-st.t0>25000&&st.n>600;
    if(warm&&st.ema>38)st.slowT+=ms;else st.slowT=Math.max(0,st.slowT-ms*2);
    if(st.lvl)paint();
    if(st.fixed||st.locked||!warm)return;
    if(st.probe){                                            // measuring a resolution drop
      if(now-st.probe.t>3500){const gain=(st.probe.before-st.ema)/st.probe.before;
        if(gain<.15){setDpr(st.probe.dpr);st.locked=true}    // no real gain: CPU/vertex-bound. Restore quality and stop.
        st.probe=null;st.lastChange=now}
      return}
    if(st.ema>36&&st.dpr>st.min+.01&&now-st.lastChange>4000){st.probe={t:now,before:st.ema,dpr:st.dpr};setDpr(st.dpr-.25)}
  }
  // The old rule disabled shadows if the FIRST 240 frames were slow, which world loading always trips. Now: only after warm-up and ~8 s of sustained slowness.
  function shadowTooSlow(){return st.slowT>8000}
  // Snap the sun + its target to the shadow-map texel grid (in light space) so shadows don't crawl. d = unit vector towards the light.
  function snapSun(sun,x,y,z){
    const d=sun.userData.sd,ts=150/sun.shadow.mapSize.x;      // 150 = shadow camera width
    let rx=d.z,rz=-d.x;const l=Math.hypot(rx,rz)||1;rx/=l;rz/=l; // light-space right = up x d, ry = 0
    const ux=d.y*rz,uy=d.z*rx-d.x*rz,uz=-d.y*rx;                // light-space up = d x right
    const a=x*rx+z*rz,b=x*ux+y*uy+z*uz,da=Math.round(a/ts)*ts-a,db=Math.round(b/ts)*ts-b;
    const tx=x+rx*da+ux*db,ty=y+uy*db,tz=z+rz*da+uz*db;
    sun.target.position.set(tx,ty,tz);sun.position.set(tx+d.x*140,ty+d.y*140,tz+d.z*140);
  }
  function overlay(){
    const e=document.createElement('div');e.style.cssText='position:fixed;z-index:99;left:calc(env(safe-area-inset-left,0px) + 8px);bottom:calc(env(safe-area-inset-bottom,0px) + 8px);padding:4px 8px;border-radius:8px;background:#000a;color:#9f9;font:11px/1.35 monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(e);st.ov=e}
  // ?perf=2 also prints a census of what the scene is made of (why are there N draw calls?)
  function takeCensus(){
    if(typeof scene==='undefined'||!scene)return;let stat=0,inst=0,skin=0,pts=0,hid=0,tris=0;const geo=new Map();
    scene.traverse(o=>{if(o.isInstancedMesh){inst++;return}if(o.isSkinnedMesh){skin++;return}if(o.isPoints||o.isLine){pts++;return}
      if(!o.isMesh)return;let v=o.visible,p=o.parent;while(v&&p){v=p.visible;p=p.parent}if(!v){hid++;return}stat++;
      const g=o.geometry,n=(g.index?g.index.count:g.attributes.position.count)/3,e=geo.get(g.uuid)||{n:0,t:n};e.n++;geo.set(g.uuid,e);tris+=n});
    const top=[...geo.values()].sort((a,b)=>b.n*b.t-a.n*a.t).slice(0,4).map(e=>e.n+'x'+(e.t|0)+'t').join(' ');
    st.census='static '+stat+' ('+(tris/1000|0)+'k tris) inst '+inst+' skin '+skin+' fx '+pts+'\ntop: '+top}
  function paint(){
    const now=performance.now();if(now-st.ovT<500)return;st.ovT=now;const i=st.r.info.render;
    if(st.lvl>1&&(st.n%4===0||!st.census))takeCensus();
    st.ov.textContent=Math.round(1000/st.ema)+' fps  '+st.ema.toFixed(1)+' ms\ncalls '+i.calls+'  tris '+(i.triangles/1000|0)+'k\ndpr '+st.dpr.toFixed(2)+'/'+st.cap.toFixed(2)+(st.locked?' (locked)':'')+'  shadow '+(window.sun&&sun.castShadow?'on':'off')+(st.lvl>1?'\n'+st.census:'')}
  return {init,frame,snapSun,shadowTooSlow,state:st};
})();
