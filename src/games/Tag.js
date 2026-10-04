// Tag: 2-player chase in the world. Step on the green pad in town and tap "Play Tag".
// Net: ONE broadcast event 'tg'. Messages: {k:'start',youIt} {k:'t'} (you were tagged) {k:'e',ms} (final it-time) {k:'end'}.
// Rules: 90s round, whoever spent LESS time as "it" wins. Leaving the arena counts as being "it".
// Globals from index.html: S, chan, others, scene, H, TOWN, banner, chime, me, Interaction, THREE.
const Tag=(()=>{
  const PAD={x:TOWN.x+Math.cos(1.4)*19,z:TOWN.z+Math.sin(1.4)*19};
  const DUR=90000,ARENA=80,TAG_R=3.5;
  let A=null,ring,hud,panel,clock=0;
  const partner=()=>[...others.values()][0];
  const pname=()=>{const o=partner();return (o&&o.group.userData.nm)||'Partner'};
  const send=p=>{if(chan)chan.send({type:'broadcast',event:'tg',payload:p})};
  const near=()=>Math.hypot(S.x-PAD.x,S.z-PAD.z)<5;
  const inArena=(x,z)=>Math.hypot(x-PAD.x,z-PAD.z)<ARENA;

  function ui(){
    if(hud)return;
    hud=document.createElement('div');
    hud.style.cssText='position:fixed;z-index:6;top:var(--topmsg-tag,calc(env(safe-area-inset-top,0px) + 96px));left:0;right:0;text-align:center;font-size:20px;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none;display:none';
    document.body.appendChild(hud);
    panel=document.createElement('div');
    panel.style.cssText='position:fixed;z-index:20;inset:0;display:none;align-items:center;justify-content:center;background:#0009';
    panel.innerHTML='<div style="background:#1a1f3af2;color:#fff;border-radius:18px;padding:22px;width:min(88vw,340px);max-height:90dvh;overflow:auto;text-align:center"><div id="tgbody"></div><button id="tgok" style="margin-top:14px;font:inherit;padding:12px 28px;border-radius:12px;border:0;background:#ff6b8b;color:#fff">OK</button></div>';
    document.body.appendChild(panel);document.getElementById('tgok').onclick=()=>{panel.style.display='none';if(A&&A.over&&A.theirs!==null)A=null};
  }
  const result=h=>{ui();document.getElementById('tgbody').innerHTML=h;panel.style.display='flex'};

  // red cone floating over whoever is "it"
  function mark(group,on){
    if(!group)return;let m=group.userData.itMark;
    if(!m){m=new THREE.Mesh(new THREE.ConeGeometry(.35,.7,12),new THREE.MeshBasicMaterial({color:'#ff2d2d'}));m.rotation.x=Math.PI;m.position.y=3.1;group.add(m);group.userData.itMark=m}
    m.visible=on;m.rotation.y+=.1}

  function start(initiator,youIt){
    ui();panel.style.display='none';
    const it=initiator?!youIt:!!youIt; // initiator's payload says whether the PARTNER is it
    A={it,t0:clock+3000,mine:0,cool:0,over:false,theirs:null};
    banner(it?"You're IT! Catch "+pname()+' 🏃':'RUN! Don’t get tagged 💨','TAG');
  }
  function begin(){
    const p=partner();if(!p){banner('Your partner needs to be in the world 💞','TAG');return}
    const youIt=Math.random()<.5;send({k:'start',youIt});start(true,youIt);
  }
  function stop(){A=null;if(hud)hud.style.display='none';mark(me,false);const p=partner();if(p)mark(p.group,false)}
  function finish(){
    if(!A||!A.over)return;
    if(A.theirs===null){result('<h2>Time!</h2>Waiting for '+pname()+'…');return}
    const m=A.mine,t=A.theirs,w=m<t?'You win! 🎉':m>t?pname()+' wins 😅':'Perfect tie 🤝';
    result('<h2>🏃 Tag results</h2><div style="margin:12px 0;font-size:18px">Time as “it”<br>You: <b>'+(m/1000).toFixed(1)+'s</b><br>'+pname()+': <b>'+(t/1000).toFixed(1)+'s</b></div><b>'+w+'</b><br><small>Less time as “it” wins. Step on the pad to play again.</small>');
    chime();
  }
  function onMsg(p){
    if(!p)return;
    if(p.k==='start')start(false,p.youIt);
    else if(p.k==='end')stop();
    else if(A&&p.k==='t'){A.it=true;A.cool=clock+2500;banner("You're it!",'TAGGED');chime()}
    else if(A&&p.k==='e'){A.theirs=p.ms;finish()}
  }

  function build(){
    const y=H(PAD.x,PAD.z),g=new THREE.Group();g.position.set(PAD.x,y,PAD.z);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.4,.5,32),new THREE.MeshStandardMaterial({color:'#3ddc84',emissive:'#14a85a',emissiveIntensity:.5}));base.position.y=.25;g.add(base);
    ring=new THREE.Mesh(new THREE.TorusGeometry(2.3,.17,10,40),new THREE.MeshBasicMaterial({color:'#ffe66b',fog:false}));ring.rotation.x=Math.PI/2;ring.position.y=1.6;g.add(ring);
    const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');
    x.fillStyle='#14361f';x.fillRect(0,0,512,128);x.fillStyle='#fff';x.font='bold 64px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('🏃 TAG',256,68);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));sign.position.y=4.4;g.add(sign);ring.userData.sign=sign;
    scene.add(g);
  }

  function tick(dt,t){
    clock+=dt*1000;
    if(ring){ring.rotation.z+=dt*1.5;ring.position.y=1.6+Math.sin(t/400)*.15;if(ring.userData.sign)ring.userData.sign.rotation.y+=dt*.6}
    if(!A)return;ui();
    const p=partner();
    if(A.over){mark(me,false);if(p)mark(p.group,false);return}
    mark(me,A.it);if(p)mark(p.group,!A.it);
    if(clock<A.t0){hud.style.display='block';hud.style.fontSize='44px';hud.textContent=Math.ceil((A.t0-clock)/1000);return}
    hud.style.display='block';hud.style.fontSize='20px';
    const left=Math.max(0,DUR-(clock-A.t0)),out=!inArena(S.x,S.z);
    if(A.it||out)A.mine+=dt*1000;                       // being "it" (or hiding outside the arena) costs time
    if(A.it&&p&&clock>A.cool){
      const g=p.group.position;
      if(Math.hypot(S.x-g.x,S.z-g.z)<TAG_R&&Math.abs(S.y-g.y)<4){A.it=false;A.cool=clock+2500;send({k:'t'});banner('Tagged! Run! 💨','TAG');chime()}
    }
    hud.textContent=(out?'⚠️ OUT OF ARENA · ':'')+(A.it?'🔴 YOU’RE IT':'🟢 RUN!')+'  ·  '+Math.ceil(left/1000)+'s  ·  it-time '+(A.mine/1000).toFixed(1)+'s';
    if(left<=0){A.over=true;hud.style.display='none';send({k:'e',ms:Math.round(A.mine)});finish()}
  }

  Interaction.register('tag-start','Play Tag',()=>!A&&near(),begin);
  Interaction.register('tag-end','End Tag',()=>A&&near(),()=>{send({k:'end'});stop()});
  return {build,tick,onMsg,pos:PAD};
})();
