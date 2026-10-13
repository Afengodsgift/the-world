// SocHud: the football HUD. During a match the screen shows ONLY what football needs:
//   top-left   a compact scoreboard pill (never in the middle of the play)      top-right  a small Leave button (tap twice)
//   top-centre a transient note ("Waiting for...", "Kick off!"), only while it matters
//   bottom     the stick, Jump and the four buttons (Shoot, Pass, Tackle, Sprint) in the usual thumb cluster
// Everything else (status pills, time/journal/map/invite, emote, shop, pan, gun buttons) is hidden by `body.soccer-on` for the length of the match.
//   build({down(kind),up(kind),leave()}) -> {board(html), note(text), show(on), btn:{...}, bar, hud}
// Layout uses index.html's variables where they exist (--st --sl --sr --R0 --B0 --J --F --B --g); looks fall back to theme.css tokens. Globals: Fx.
const SocHud=(()=>{
  const BTN=[['shoot','Shoot'],['pass','Pass'],['tackle','Tackle'],['sprint','Sprint']];
  const GLASS='background:var(--w-g,rgba(18,24,50,.55));-webkit-backdrop-filter:var(--w-blur,blur(12px));backdrop-filter:var(--w-blur,blur(12px));border:1px solid var(--w-edge,rgba(255,255,255,.24));box-shadow:var(--w-lift,0 6px 20px rgba(4,8,28,.28));color:#fff;';
  function build(h){
    const css=document.createElement('style');
    css.textContent=
      // everything that is not football goes away for the length of the match
      'body.soccer-on #hud,body.soccer-on .dk,body.soccer-on #emobtn,body.soccer-on #panbtn,body.soccer-on #owshop,body.soccer-on #owgun,body.soccer-on #owrl,body.soccer-on #owfire,body.soccer-on #owview{display:none!important}'
      +'#sochud{position:fixed;z-index:6;left:calc(var(--sl,0px) + 12px);top:calc(var(--st,env(safe-area-inset-top,0px)) + 10px);display:none;align-items:center;gap:10px;height:36px;padding:0 15px;border-radius:999px;'+GLASS+'font:600 14px/1 var(--w-ui,sans-serif);pointer-events:none;white-space:nowrap;font-variant-numeric:tabular-nums}'
      +'#sochud .tm{display:inline-flex;align-items:center;gap:6px}#sochud .dot{width:10px;height:10px;border-radius:50%;display:inline-block}'
      +'#sochud .sc{font-size:19px;font-weight:800;letter-spacing:.03em}#sochud .clk{opacity:.75;font-weight:600;font-size:13px}'
      +'#socnote{position:fixed;z-index:6;left:50%;top:calc(var(--st,env(safe-area-inset-top,0px)) + 56px);transform:translateX(-50%);display:none;padding:9px 20px;border-radius:18px;'+GLASS+'font:italic 400 19px/1.2 var(--w-serif,Georgia,serif);pointer-events:none;text-align:center;max-width:70vw}'
      +'#socleave{position:fixed;z-index:6;right:calc(var(--sr,0px) + 12px);top:calc(var(--st,env(safe-area-inset-top,0px)) + 10px);display:none;width:auto;height:36px;min-width:36px;padding:0 13px;border-radius:999px;'+GLASS+'font:600 13px/1 var(--w-ui,sans-serif);-webkit-tap-highlight-color:transparent}'
      +'#socleave.ask{background:rgba(255,90,90,.62);border-color:rgba(255,200,200,.7)}'
      +'.socb{position:fixed;z-index:5;display:none;touch-action:none;padding:0;width:70px;height:70px;border-radius:50%;font:700 12px/1 sans-serif;letter-spacing:.02em}'
      +'#socshoot{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px)}#socpass{right:100px;bottom:calc(env(safe-area-inset-bottom,0px) + 150px)}'
      +'#soctackle{right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 232px)}#socsprint{right:100px;bottom:calc(env(safe-area-inset-bottom,0px) + 60px)}'
      +'@media (orientation:landscape) and (pointer:coarse){'
      +'body #socshoot{right:var(--R0);bottom:calc(var(--B0) + var(--J) + var(--g));width:var(--F);height:var(--F)}'
      +'body #socpass{right:calc(var(--R0) + var(--F) + var(--g));bottom:calc(var(--B0) + var(--J) + var(--g));width:var(--F);height:var(--F)}'
      +'body #soctackle{right:var(--R0);bottom:calc(var(--B0) + var(--J) + var(--F) + 2*var(--g));width:var(--F);height:var(--F)}'
      +'body #socsprint{right:calc(var(--R0) + var(--J) + var(--g));bottom:var(--B0);width:var(--B);height:var(--B)}}';
    (document.head||document.body).appendChild(css);
    const mk=(tag,id)=>{const e=document.createElement(tag);e.id=id;document.body.appendChild(e);return e};
    const hud=mk('div','sochud'),noteEl=mk('div','socnote'),leave=mk('button','socleave');
    leave.textContent='✕';let askT=0;
    leave.addEventListener('pointerdown',e=>{e.preventDefault();
      if(leave.classList&&leave.classList.contains('ask')){clearTimeout(askT);leave.classList.remove('ask');leave.textContent='✕';h.leave()}
      else{if(leave.classList)leave.classList.add('ask');leave.textContent='Leave match?';clearTimeout(askT);askT=setTimeout(()=>{if(leave.classList)leave.classList.remove('ask');leave.textContent='✕'},2500)}});
    const btn={};
    for(const [k,label] of BTN){
      const b=mk('button','soc'+k);b.className='socb';b.textContent=label;btn[k]=b;
      b.addEventListener('pointerdown',e=>{h.down(k);e.preventDefault()});
      for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>h.up(k));
    }
    const KEYS={KeyK:'shoot',KeyJ:'pass',KeyL:'tackle'};
    addEventListener('keydown',e=>{const k=KEYS[e.code];if(k&&!e.repeat&&e.target.tagName!=='INPUT')h.down(k)});
    addEventListener('keyup',e=>{const k=KEYS[e.code];if(k)h.up(k)});
    const bar=Fx.bar(410);bar.hide();
    return {hud,noteEl,btn,bar,leaveBtn:leave,
      board(html){hud.innerHTML=html||'';hud.style.display=html?'flex':'none'},
      note(text){noteEl.textContent=text||'';noteEl.style.display=text?'block':'none'},
      show(on){for(const k in btn)btn[k].style.display=on?'block':'none';leave.style.display=on?'block':'none';if(document.body.classList)document.body.classList.toggle('soccer-on',!!on)}};
  }
  return {build};
})();
