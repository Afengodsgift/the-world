// Perf: measurement + the two cheapest big wins for phones.
//  1. Adaptive resolution: the single biggest GPU cost in landscape on a hi-dpi phone is the pixel count. We watch the frame time and
//     step the renderer's pixel ratio down when the device can't hold ~45 fps, and back up (carefully, no flip-flopping) when there is headroom.
//  2. Shadow snapping: the sun's shadow camera follows the player. Snapping it to whole shadow-map texels (in light space) stops the
//     shadow edges from shimmering/crawling while you walk.
//  3. ?perf=1 overlay: fps, frame ms, draw calls, triangles, pixel ratio. Use it to compare phases.
// Globals used at runtime: THREE (none directly), renderer passed to init().
const Perf=(()=>{
  const st={r:null,cap:2,min:.8,dpr:2,ema:16.7,n:0,hold:0,ceil:99,ceilUntil:0,lastChange:0,ov:null,ovT:0,on:/[?&]perf=1/.test(location.search),fixed:/[?&]dpr=/.test(location.search)};
  const q=location.search.match(/[?&]dpr=([\d.]+)/);if(q)st.fixed=parseFloat(q[1]);
  function init(r){
    st.r=r;st.cap=Math.min(window.devicePixelRatio||1,2);st.dpr=st.fixed?Math.min(st.fixed,st.cap):st.cap;r.setPixelRatio(st.dpr);
    if(st.on)overlay();
  }
  function setDpr(v){v=Math.max(st.min,Math.min(st.cap,v));if(Math.abs(v-st.dpr)<.01)return;st.dpr=v;st.r.setPixelRatio(v)} // setPixelRatio also resizes the canvas
  // ms = raw time since the previous frame
  function frame(ms){
    if(!st.r||!(ms>0)||ms>120)return;                       // ignore tab-switch / loading hitches
    st.n++;st.ema+=(ms-st.ema)*.05;
    if(st.on)paint(ms);
    if(st.fixed||st.n<150)return;                            // let the world settle first
    const now=performance.now();
    if(st.ema>23&&st.dpr>st.min+.01&&now-st.lastChange>2500){ // can't hold ~45 fps: drop resolution one step
      st.ceil=st.dpr;st.ceilUntil=now+60000;st.lastChange=now;setDpr(st.dpr-.25);st.ema=18}
    else if(st.ema<17.4&&st.dpr<st.cap-.01&&now-st.lastChange>12000&&(st.dpr+.25<st.ceil||now>st.ceilUntil)){ // comfortably at vsync for 12 s: try one step up
      st.lastChange=now;setDpr(st.dpr+.25);st.ema=17}
  }
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
  function paint(ms){
    const now=performance.now();if(now-st.ovT<500)return;st.ovT=now;const i=st.r.info.render;
    st.ov.textContent=Math.round(1000/st.ema)+' fps  '+st.ema.toFixed(1)+' ms\ncalls '+i.calls+'  tris '+(i.triangles/1000|0)+'k\ndpr '+st.dpr.toFixed(2)+'/'+st.cap.toFixed(2)+'  shadow '+(window.sun&&sun.castShadow?'on':'off')}
  return {init,frame,snapSun,state:st};
})();
