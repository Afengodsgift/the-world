// HudMode: the HUD is hidden by default EVERYWHERE (walking, activities, Outlaw Isle); a ☰ button in the corner shows everything for a few seconds. Flying hides even the ☰.
//   body.hud-fly   you are flying                       -> only joystick, Jump and Boost stay (no ☰: the screen is clear until you land)
//   body.hud-act   an activity is running               -> the generic clutter hides; the activity keeps its OWN timer/score/buttons
//   body.ow-isle   you are on Outlaw Isle (set by Outlaw.js hudMode(); Outlaw also sets body.ow-scope while scoped)
//   body.hud-min   any of the above                     -> the CSS in src/ui/hud-modes.css keys off this one class
//   body.hud-reveal  ☰ was tapped                       -> everything is shown for 7 s
// New activities: add their "running" check to HudMode.extra (an array of functions returning true while the activity is running).
const HudMode=(()=>{
  let fly=false,act=false,isle=false,menu=null,revealT=0;const extra=[];
  const cls=()=>document.body.classList;
  function activity(){
    try{
      if(typeof kart!=='undefined'&&(kart.on||dash.on||slalom.on||race.on||srun.on))return true;   // Kart, Dash, Slalom, flight Race, Shark Run (state objects in index.html)
      if(typeof Soccer!=='undefined'&&Soccer._s&&Soccer._s.phase!=='idle')return true;
      if(typeof Tag!=='undefined'&&Tag.on&&Tag.on())return true;
      if(typeof WardenIsles!=='undefined'&&WardenIsles.inArena&&WardenIsles.inArena())return true;   // Warden Isles arena (NOT WRD.on: that is just the feature switch)
    }catch(e){}
    for(const f of extra){try{if(f())return true}catch(e){}}
    return false;
  }
  function build(){
    menu=document.createElement('button');menu.className='dk dk-menu';menu.textContent='☰';menu.title='Show menu';document.body.appendChild(menu);
    menu.addEventListener('pointerdown',e=>{cls().add('hud-reveal');clearTimeout(revealT);revealT=setTimeout(()=>cls().remove('hud-reveal'),8000);e.preventDefault()});
  }
  function update(){
    const b=cls();if(!b)return;if(!menu)build();
    const f=!!S.flying,a=activity(),i=b.contains('ow-isle');
    if(f!==fly){fly=f;b.toggle('hud-fly',f)}
    if(a!==act){act=a;b.toggle('hud-act',a)}
    if(!isle){isle=true;b.add('hud-min')}   // minimal is the default state now; hud-fly / hud-act / ow-isle only add mode-specific rules
    if(f&&b.contains('hud-reveal')){b.remove('hud-reveal');clearTimeout(revealT)}   // taking off cancels a reveal: flying is always clear
  }
  return {update,extra,_activity:activity};
})();
