// SocHud: the football HUD: scoreboard, kick button, keyboard shortcut and the power bar. build({press,release}) returns {hud,kickBtn,bar}.
// Layout positions come from index.html (landscape variables) and theme.css; this file only creates the elements.
// Globals: Fx.
const SocHud=(()=>{
  function build(handlers){
    let hud=null,kickBtn=null,bar=null;
    // HUD + kick button
    // fallback look + position (theme.css / the landscape block in index.html override these: they use `html #id` / `body #id`)
    const css=document.createElement('style');css.textContent='#sochud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 112px);padding:6px 14px;border-radius:14px;background:#000a;color:#fff;font:600 17px sans-serif;text-align:center;display:none;pointer-events:none;white-space:nowrap}'
      +'#sockick{position:fixed;z-index:5;right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 280px);width:72px;height:72px;border-radius:50%;border:0;background:#3ddc84cc;font-size:28px;display:none;touch-action:none;padding:0}'
      +'@media (orientation:landscape) and (pointer:coarse){#sochud{top:calc(var(--st,0px) + 92px)}}';(document.head||document.body).appendChild(css);
    hud=document.createElement('div');hud.id='sochud';document.body.appendChild(hud);
    kickBtn=document.createElement('button');kickBtn.id='sockick';kickBtn.textContent='🦶';document.body.appendChild(kickBtn);
    kickBtn.addEventListener('pointerdown',e=>{handlers.press();e.preventDefault()});for(const ev of ['pointerup','pointercancel'])kickBtn.addEventListener(ev,()=>handlers.release());
    addEventListener('keydown',e=>{if(e.code==='KeyK'&&!e.repeat)handlers.press()});addEventListener('keyup',e=>{if(e.code==='KeyK')handlers.release()});
    bar=Fx.bar(410);bar.hide();
    return {hud,kickBtn,bar};
  }
  return {build};
})();
