// Keyboard + touch input. bindInput() is called once from startGame(), after S,
// doUse(), smack(), and renderer already exist — same forward-reference pattern as
// the rest of the extracted modules. Behavior is unchanged from before the move;
// this is a straight relocation, not a redesign of how input works.
const keys={};let stickV={x:0,y:0},jumpQ=false;
function bindInput(){
  addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space')jumpQ=true;if(e.code==='KeyE')doUse();if(e.code==='KeyB')S.boost=!S.boost;if(e.code==='KeyF')smack();if(e.code==='KeyQ')togglePan();if(e.code==='KeyG')openEmotes()});
  addEventListener('keyup',e=>keys[e.code]=false);
  const stick=$('stick'),knob=$('knob');let sid=null;
  const setStick=e=>{const r=stick.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);const m=Math.hypot(dx,dy),max=r.width/2;if(m>max){dx*=max/m;dy*=max/m}
    knob.style.left=(44+dx)+'px';knob.style.top=(44+dy)+'px';stickV={x:dx/max,y:dy/max}};
  stick.addEventListener('pointerdown',e=>{sid=e.pointerId;stick.setPointerCapture(sid);setStick(e)});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===sid)setStick(e)});
  const endStick=e=>{if(e.pointerId===sid){sid=null;stickV={x:0,y:0};knob.style.left='44px';knob.style.top='44px'}};
  stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);
  $('jump').addEventListener('pointerdown',e=>{jumpQ=true;e.preventDefault()});
  $('use').addEventListener('pointerdown',e=>{doUse();e.preventDefault()});
  $('boost').addEventListener('pointerdown',e=>{S.boost=!S.boost;$('boost').textContent=S.boost?'BOOST ON':'Boost';$('boost').style.opacity=S.boost?1:.75;e.preventDefault()});
  $('smack').addEventListener('pointerdown',e=>{smack();e.preventDefault()});
  $('panbtn').addEventListener('pointerdown',e=>{togglePan();e.preventDefault()});
  $('emobtn').addEventListener('pointerdown',e=>{openEmotes();e.preventDefault()});
  // look
  let lid=null,lx=0,ly=0;const cv=renderer.domElement;
  cv.addEventListener('pointerdown',e=>{lid=e.pointerId;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(lid)});
  cv.addEventListener('pointermove',e=>{if(e.pointerId!==lid)return;S.yaw-=(e.clientX-lx)*.006;S.pitch=Math.max(.05,Math.min(1.2,S.pitch+(e.clientY-ly)*.005));lx=e.clientX;ly=e.clientY});
  const endLook=e=>{if(e.pointerId===lid)lid=null};cv.addEventListener('pointerup',endLook);cv.addEventListener('pointercancel',endLook);
  $('share').onclick=async()=>{
    const url=location.origin+location.pathname+'?room='+roomCode;
    try{if(navigator.share)await navigator.share({title:'The World',text:'Join me. Code: '+roomCode,url});else{await navigator.clipboard.writeText(url);$('share').textContent='Copied'}}catch(e){}
  };
}
