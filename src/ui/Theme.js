// Theme: the small amount of JS behind src/ui/theme.css.
//  1. adopt():  older activity code (race, dash, slalom, shark run, kart, bridge, tag) builds its status line
//     as an unstyled fixed <div>. Rather than edit six copy-pasted blocks in other people's files, any
//     fixed, centred text line parked near the top gets the .act glass-pill class as it appears.
//  2. guard():  glass blur is GPU work on top of a moving 3D scene. If the game keeps running below
//     LOW_FPS for three consecutive 3-second windows (after a 20 s warm-up), <html class="lite"> turns
//     blur off and firms up the fills. Session-only (a hitch must not stick forever).
//     ?glass=full never switches (used by screenshots/tests), ?glass=lite starts in lite mode.
const Theme=(()=>{
  const LOW_FPS=26,WARM_MS=20000,WIN_MS=3000,STRIKES=3;
  const root=document.documentElement;
  let mode='auto';
  try{const q=new URLSearchParams(location.search).get('glass');if(q==='full'||q==='lite')mode=q;
      if(q==='lite'||sessionStorage.getItem('w4glass')==='lite')root.classList.add('lite')}catch(e){}

  function adopt(el){
    if(el.nodeType!==1||el.classList.contains('act'))return;
    const st=el.style;
    if(st.position==='fixed'&&st.textAlign==='center'&&st.left==='0px'&&st.right==='0px'&&/(92|96)px/.test(st.top)&&st.pointerEvents==='none')el.classList.add('act');
  }
  new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)adopt(n)}).observe(document.body,{childList:true});
  document.body.querySelectorAll(':scope > div').forEach(adopt);

  let t0=performance.now(),frames=0,winStart=0,bad=0;
  function frame(t){
    if(mode==='auto'&&!root.classList.contains('lite')){
      frames++;
      if(!winStart)winStart=t;
      if(t-winStart>=WIN_MS){
        const fps=frames*1000/(t-winStart);frames=0;winStart=t;
        if(t-t0>WARM_MS&&document.visibilityState==='visible'){bad=fps<LOW_FPS?bad+1:0;if(bad>=STRIKES)lite(true)}
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function lite(on){root.classList.toggle('lite',!!on);try{if(on)sessionStorage.setItem('w4glass','lite');else sessionStorage.removeItem('w4glass')}catch(e){}}
  return {lite,isLite:()=>root.classList.contains('lite'),adopt};
})();
