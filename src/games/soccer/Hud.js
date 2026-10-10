// SocHud: the football HUD: scoreboard, the four action buttons (Shoot, Pass, Tackle, Sprint), keyboard shortcuts and the power bar.
//   build({down(kind),up(kind)}) -> {hud, btn:{shoot,pass,tackle,sprint}, bar, show(on)}.   Keys: K shoot, J pass, L tackle, Shift sprint (the game's own key).
// Landscape phones: positions use index.html's layout variables (--R0 --B0 --J --F --B --g) so they sit in the same thumb cluster as Jump;
// the fallback below is for desktop/portrait. Looks (glass) come from theme.css. Globals: Fx.
const SocHud=(()=>{
  const BTN=[['shoot','Shoot'],['pass','Pass'],['tackle','Tackle'],['sprint','Sprint']];
  function build(h){
    const css=document.createElement('style');
    css.textContent='#sochud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 112px);padding:6px 14px;border-radius:14px;background:#000a;color:#fff;font:600 17px sans-serif;text-align:center;display:none;pointer-events:none;white-space:nowrap}'
      +'body.soccer-on #owgun,body.soccer-on #owrl,body.soccer-on #owfire,body.soccer-on #owview{display:none!important}'   // guns are holstered in a match and their buttons share these screen slots
      +'.socb{position:fixed;z-index:5;display:none;touch-action:none;padding:0;width:70px;height:70px;border-radius:50%;font:700 12px/1 sans-serif;letter-spacing:.02em}'
      +'#socshoot{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px)}#socpass{right:100px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px)}'
      +'#soctackle{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 232px)}#socsprint{right:100px;bottom:calc(env(safe-area-inset-bottom,0px) + 60px)}'
      +'@media (orientation:landscape) and (pointer:coarse){#sochud{top:calc(var(--st,0px) + 92px)}'
      +'body #socshoot{right:var(--R0);bottom:calc(var(--B0) + var(--J) + var(--g));width:var(--F);height:var(--F)}'
      +'body #socpass{right:calc(var(--R0) + var(--F) + var(--g));bottom:calc(var(--B0) + var(--J) + var(--g));width:var(--F);height:var(--F)}'
      +'body #soctackle{right:var(--R0);bottom:calc(var(--B0) + var(--J) + var(--F) + 2*var(--g));width:var(--F);height:var(--F)}'
      +'body #socsprint{right:calc(var(--R0) + var(--J) + var(--g));bottom:var(--B0);width:var(--B);height:var(--B)}}';
    (document.head||document.body).appendChild(css);
    const hud=document.createElement('div');hud.id='sochud';document.body.appendChild(hud);
    const btn={};
    for(const [k,label] of BTN){
      const b=document.createElement('button');b.id='soc'+k;b.className='socb';b.textContent=label;document.body.appendChild(b);btn[k]=b;
      b.addEventListener('pointerdown',e=>{h.down(k);e.preventDefault()});
      for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>h.up(k));
    }
    const KEYS={KeyK:'shoot',KeyJ:'pass',KeyL:'tackle'};
    addEventListener('keydown',e=>{const k=KEYS[e.code];if(k&&!e.repeat&&e.target.tagName!=='INPUT')h.down(k)});
    addEventListener('keyup',e=>{const k=KEYS[e.code];if(k)h.up(k)});
    const bar=Fx.bar(410);bar.hide();
    return {hud,btn,bar,show(on){for(const k in btn)btn[k].style.display=on?'block':'none';if(document.body.classList)document.body.classList.toggle('soccer-on',!!on)}};
  }
  return {build};
})();
