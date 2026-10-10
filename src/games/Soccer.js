// Soccer: football on Stadium Isle (PITCH in data/islands.js): 1v1, or solo practice. Built to grow to 5v5 with AI teammates.
//
//  - The HOST (whoever pressed "Kick off") simulates the ball, possession and the match; the guest renders snapshots (15 Hz) and sends its ACTIONS
//    (pass / shoot / tackle, with an aim direction) and its sprint state. Positions are never sent: the host reads both players' avatars.
//  - Possession (src/games/soccer/Ball.js): FREE -> first touch -> CONTROLLED (held ahead of you, tight when walking, loose when sprinting) -> pass/shot/tackle -> FREE.
//  - Four buttons (src/games/soccer/Hud.js): Shoot (hold = power), Pass (to the teammate you aim at), Tackle (timing + angle, can miss), Sprint (hold).
//  - Pacing goes through PlayerMods (src/core/PlayerMods.js), never S: slower with the ball, faster sprint button, stunned after a missed tackle.
//  - Teams: host = BLUE (attacks the east goal), guest = RED (attacks the west goal). First to 5, or most goals at 3:00 (a tie plays on as a golden goal).
//    Solo practice: any goal counts for you, no clock.
//  - Rules from DESIGN.md: new code never writes `S`; it talks through Net / Systems / Interaction, and tuning lives in data/soccer.js.
// Globals used at runtime: THREE, S, others, myId, H, PITCH, SOCCER, Net, Systems, Interaction, Fx, PlayerMods, banner, chime, scene, WS and Outlaw (optional).
const Soccer=(()=>{
  const C=SOCCER,P=PITCH,BR=C.ball;
  const st={phase:'idle',host:null,solo:false,a:0,b:0,t:C.match.time,pt:0,pw:0,ts:0,golden:false,note:'',owner:'',pSprint:false};
  const ball={x:P.x,y:BR.r,z:P.z,vx:0,vy:0,vz:0,owner:null,ownT:0};                    // y = height of the ball's CENTRE above the pitch surface
  const view={x:P.x,y:BR.r,z:P.z};                                    // what is drawn (guests smooth toward the extrapolated snapshot)
  let snap=null,mesh=null,hud=null,ui=null,bar=null,built=false,charging=null,chargeT=0,sendT=0,lastSnapAt=0,hudKey='',sprintHeld=false,stunUntil=0,cur=[];
  const trk={},rings=[];
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>st.host===myId;
  const partner=()=>[...others.entries()][0];
  const pname=()=>{const p=partner();return (p&&p[1].group.userData&&p[1].group.userData.nm)||'Partner'};
  const surf=()=>P.y;                                                 // pitch surface height (terrain is flattened to it)
  const ctr={x:P.x,z:P.z};
  const myTeam=()=>isHost()?'A':'B';
  const goalX=team=>P.x+(team==='A'?1:-1)*C.hw;                       // the goal a team ATTACKS (A -> east, B -> west)

  const thump=SocSound.thump,horn=SocSound.horn;                       // src/games/soccer/Sound.js

  // ---------- players (positions only; velocities estimated from movement) ----------
  const sprintOn=()=>sprintHeld||(typeof keys!=='undefined'&&!!keys.ShiftLeft);
  function track(id,x,z,dt){
    const t=trk[id]||(trk[id]={x,z,vx:0,vz:0,cd:0,lock:0,stun:0,tcd:0});   // lock: can't take control; stun: slowed after a missed tackle; tcd: tackle cooldown
    if(Math.hypot(x-t.x,z-t.z)>Math.max(1.2,14*dt*2.5)){t.vx=0;t.vz=0}      // moving further than anyone can run in this frame is a teleport / lag spike: don't let it fling a carried ball
    else{const d=Math.max(dt,.001);t.vx+=((x-t.x)/d-t.vx)*Math.min(1,dt*10);t.vz+=((z-t.z)/d-t.vz)*Math.min(1,dt*10)}
    const sp=Math.hypot(t.vx,t.vz);if(sp>14){t.vx*=14/sp;t.vz*=14/sp}     // nobody here runs faster than 14 m/s
    t.x=x;t.z=z;
    t.cd=Math.max(0,t.cd-dt);t.lock=Math.max(0,t.lock-dt);t.stun=Math.max(0,t.stun-dt);t.tcd=Math.max(0,t.tcd-dt);return t}
  function players(dt){                                                    // entities: {id,team,x,z,vx,vz,face,alt,sprinting,t}  (humans now, AI later)
    const out=[],me_=track(myId,S.x,S.z,dt);
    out.push({id:myId,x:S.x,z:S.z,alt:S.y-H(S.x,S.z),vx:me_.vx,vz:me_.vz,face:S.rot,sprinting:sprintOn(),team:myTeam(),t:me_});
    const p=partner();
    if(p&&!st.solo){const g=p[1].group,gp=g.position||{x:0,y:0,z:0},t=track(p[0],gp.x,gp.z,dt),ry=g.rotation&&isFinite(g.rotation.y)?g.rotation.y:Math.atan2(t.vx,t.vz);
      out.push({id:p[0],x:gp.x,z:gp.z,alt:gp.y-H(gp.x,gp.z),vx:t.vx,vz:t.vz,face:ry,sprinting:st.pSprint,team:myTeam()==='A'?'B':'A',t})}
    cur=out;return out}

  // ---------- ball physics (src/games/soccer/Ball.js) ----------
  const phys=dt=>SocBall.phys(ball,dt);
  function applyKick(v){ball.vx=v[0];ball.vy=v[1];ball.vz=v[2];thump(Math.min(1,Math.hypot(v[0],v[2])/C.kick.full))}

  // ---------- match flow (host) ----------
  function resetBall(){ball.x=ctr.x;ball.z=ctr.z;ball.y=BR.r;ball.vx=ball.vy=ball.vz=0;ball.owner=null;ball.ownT=0}
    const holster=()=>{try{if(typeof Outlaw!=='undefined'&&Outlaw.equip)Outlaw.equip(-1)}catch(e){}};
  function startMatch(){
    holster();st.owner='';st.pSprint=false;sprintHeld=false;charging=null;
    st.host=myId;st.solo=!partner();st.a=st.b=0;st.t=C.match.time;st.golden=false;st.ts=Date.now();st.pt=0;st.pw=0;st.phase='kickoff';resetBall();
    Net.emit('soc',{k:'start',solo:st.solo});
    banner(st.solo?'Practice: score as many as you like':'You are BLUE: attack the east (red) goal','⚽ SOCCER');
  }
  function stopMatch(send){st.phase='idle';st.host=null;resetBall();hudKey='';sprintHeld=false;charging=null;if(bar)bar.hide();PlayerMods.clear();if(send)Net.emit('soc',{k:'stop'})}
  function goal(team){
    if(st.solo)st.a++;else if(team==='A')st.a++;else st.b++;
    st.phase='goal';st.pt=C.match.goalPause;horn();
    Fx.burst(ball.x,surf()+2,ball.z,team==='A'?'#4aa3ff':'#ff5a5a',22);
    const msg=st.solo?'GOAL! '+st.a:'GOAL! '+(team==='A'?'Blue':'Red')+'  '+st.a+' – '+st.b;
    banner(msg,'⚽ SOCCER');Net.emit('soc',{k:'goal',team,a:st.a,b:st.b});
  }
  function finish(){
    const w=st.a===st.b?'Draw':st.a>st.b?'Blue wins':'Red wins';
    st.phase='over';st.pt=C.match.overPause;
    const mine=isHost()?st.a-st.b:st.b-st.a,res=st.solo?'Practice over: '+st.a+' goals':(mine>0?'You win! ':mine<0?partnerWins():'Draw ')+st.a+' – '+st.b;
    banner(res,'⚽ FULL TIME');Net.emit('soc',{k:'end',a:st.a,b:st.b,solo:st.solo});
    try{if(typeof WS!=='undefined'&&WS.log&&!st.solo)WS.log('soccer','m'+st.ts,{a:st.a,b:st.b})}catch(e){}
  }
  const partnerWins=()=>pname()+' wins ';

  // who holds the ball: the owner carries it; a loose ball goes to the nearest player who can reach it (first-touch quality decides how cleanly)
  function possession(pl,dt){
    const owner=ball.owner?pl.find(p=>p.id===ball.owner):null;
    if(ball.owner&&!owner)ball.owner=null;
    if(owner){if(SocBall.stillOwned(ball,owner))SocBall.carry(ball,owner,dt);else ball.owner=null;return}
    let best=null,bd=1e9;
    for(const p of pl)if(SocBall.canControl(ball,p)){const d=Math.hypot(ball.x-p.x,ball.z-p.z);if(d<bd){bd=d;best=p}}
    if(best&&SocBall.control(ball,best,C.rng)==='clean')thump(.12);
  }

  function hostStep(dt){
    const pl=players(dt);
    if(st.phase==='kickoff'){
      st.pw+=dt;
      const here=pl.every(p=>Math.hypot(p.x-ctr.x,p.z-ctr.z)<C.match.startRange);
      if(here||st.pw>C.match.kickoffMax){if(st.pt<=0)st.pt=2.2;st.pt-=dt;if(st.pt<=0){st.phase='play';st.pw=0;banner('Kick off!','⚽ SOCCER')}}
      else{st.pt=0;st.note=!st.solo&&pl.length>1?'Waiting for everyone to reach the pitch…':'Head to the pitch!'}
      return}
    if(st.phase==='goal'){phys(dt);st.pt-=dt;
      if(st.pt<=0){if(!st.solo&&(st.a>=C.match.toWin||st.b>=C.match.toWin||(st.golden&&st.a!==st.b)))finish();else{resetBall();st.phase='kickoff';st.pt=1.6;st.pw=C.match.kickoffMax-4}}
      return}
    if(st.phase==='over'){st.pt-=dt;if(st.pt<=0)stopMatch(true);return}
    if(st.phase!=='play')return;
    possession(pl,dt);
    phys(dt);
    if(ball.owner){const o=pl.find(p=>p.id===ball.owner);if(!o||!SocBall.stillOwned(ball,o))ball.owner=null}   // lost it (too far, jumped, left)
    if(!st.solo){st.t=Math.max(0,st.t-dt);if(st.t<=0&&!st.golden){if(st.a!==st.b)finish();else{st.golden=true;banner('Golden goal!','⚽ SOCCER')}}}
    if(st.phase==='play'&&Math.abs(ball.x-P.x)>C.hw+.05){const east=ball.x>P.x;goal(st.solo?'A':east?'A':'B')}
  }

  // ---------- actions: pass / shoot / tackle ----------
  function aimDir(){                                                       // the stick as a unit world direction (same maths as the main loop), or null when it is idle
    if(typeof stickV==='undefined'||typeof keys==='undefined')return null;
    let ix=stickV.x,iy=stickV.y;if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iy-=1;if(keys.KeyS||keys.ArrowDown)iy+=1;
    const len=Math.hypot(ix,iy);if(len<.25)return null;ix/=len;iy/=len;
    const sy=Math.sin(S.yaw),cy=Math.cos(S.yaw);return {x:cy*ix+sy*iy,z:-sy*ix+cy*iy};
  }
  const inPlay=()=>st.phase==='play'||st.phase==='goal';
  // HOST: carry out an action for any player on the field (me, my partner now; AI teammates later). Returns true if it did something.
  function hostAct(id,kind,power,aim){
    if(!inPlay())return false;
    let pl=cur.find(p=>p.id===id);if(!pl&&id===myId){players(.02);pl=cur.find(p=>p.id===id)}
    if(!pl)return false;
    if(id===myId){pl.x=S.x;pl.z=S.z;pl.alt=S.y-H(S.x,S.z);pl.face=S.rot;pl.sprinting=sprintOn()}   // read my own position fresh: the roster is only rebuilt once per frame
    if(kind==='tackle'){
      const o=ball.owner?cur.find(p=>p.id===ball.owner):null;if(!o||o.team===pl.team)return false;
      const r=SocBall.tackle(ball,pl,o,C.rng);
      if(r.hit)thump(.5);
      else if(r.why==='miss'){if(id===myId)stunUntil=now()+C.tackle.stun;else Net.emit('soc',{k:'fx',stun:C.tackle.stun})}   // a missed tackle leaves you off balance
      return r.hit;
    }
    const near=Math.hypot(ball.x-pl.x,ball.z-pl.z)<=C.kick.reach+.3;
    if(!(ball.owner===id||near)||pl.alt>1.8||ball.y>1.8)return false;
    let v;
    if(kind==='pass')v=SocPlay.passVel(pl,cur,power,aim).v;
    else v=SocPlay.shootVel(pl,goalX(st.solo?'A':pl.team),power,aim,C.rng);
    applyKick(v);ball.owner=null;pl.t.lock=C.pass.lock;return true;
  }
  // ANYONE: ask for an action. The host does it; the guest sends it (aim and sprint travel with it) and shows an instant thump.
  function act(kind,power){
    if(!inPlay())return false;
    const aim=aimDir()||{x:Math.sin(S.rot),z:Math.cos(S.rot)};
    if(isHost())return hostAct(myId,kind,power||0,aim);
    const b=view;if(kind!=='tackle'&&st.owner!==myId&&(Math.hypot(b.x-S.x,b.z-S.z)>C.kick.reach+.3||S.y-H(S.x,S.z)>1.8))return false;
    Net.emit('soc',{k:'act',a:kind,p:+(power||0).toFixed(2),x:+aim.x.toFixed(3),z:+aim.z.toFixed(3),sp:sprintOn()?1:0});
    if(kind!=='tackle')thump(power||0);return true;
  }
  const tryKick=power=>act('shoot',power);                                  // legacy entry point (tests, old key binding): a shot
  const kickVector=power=>SocPlay.shootVel({x:S.x,z:S.z,face:S.rot,sprinting:false},goalX(st.solo?'A':myTeam()),power,null,()=>.5);
  // buttons: shoot and pass charge while held (hold = power); tackle fires on press; sprint is a held state that travels to the host
  const CHARGE={shoot:()=>C.kick.charge,pass:()=>C.pass.charge};
  function btnDown(k){
    if(st.phase==='idle')return;
    if(k==='sprint'){setSprint(true);return}
    if(k==='tackle'){act('tackle',0);return}
    if(charging)return;charging=k;chargeT=0;
  }
  function btnUp(k){
    if(k==='sprint'){setSprint(false);return}
    if(charging!==k)return;
    const kind=charging,p=Math.min(1,chargeT/CHARGE[kind]());charging=null;if(bar)bar.hide();
    act(kind,kind==='pass'?Math.max(.15,p):p);
  }
  function setSprint(on){if(sprintHeld===on)return;sprintHeld=on;if(!isHost()&&st.phase!=='idle')Net.emit('soc',{k:'sp',v:on?1:0})}
  const pressKick=()=>btnDown('shoot'),releaseKick=()=>btnUp('shoot');       // test hooks / old names

  // ---------- networking ----------
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'start':holster();st.owner='';st.pSprint=false;sprintHeld=false;charging=null;st.host=from;st.solo=!!d.solo;st.a=st.b=0;st.t=C.match.time;st.golden=false;st.phase='kickoff';snap=null;lastSnapAt=now();
        banner('Match on! You are RED: attack the west (blue) goal. Head to the pitch.','⚽ SOCCER');break;
      case 's':if(isHost())break;st.phase=d.p;st.a=d.a;st.b=d.b;st.t=d.t;st.golden=!!d.g;st.note=d.n||'';snap={x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,vz:d.vz,at:now()};st.owner=d.o||'';lastSnapAt=now();break;
      case 'goal':if(isHost())break;horn();Fx.burst(view.x,surf()+2,view.z,d.team==='A'?'#4aa3ff':'#ff5a5a',22);
        banner(d.team?(d.team==='A'?'Blue':'Red')+' scores  '+d.a+' – '+d.b:'GOAL!','⚽ SOCCER');break;
      case 'end':if(isHost())break;{const mine=d.b-d.a,res=d.solo?'Practice over':(mine>0?'You win! ':mine<0?pname()+' wins ':'Draw ')+d.b+' – '+d.a;banner(res,'⚽ FULL TIME')}break;
      case 'stop':st.phase='idle';st.host=null;hudKey='';sprintHeld=false;charging=null;if(bar)bar.hide();PlayerMods.clear();break;
      case 'kick':{if(!isHost()||(st.phase!=='play'&&st.phase!=='goal'))break;const p=partner();if(!p)break;const gp=p[1].group.position||{x:0,z:0};
        if(Math.hypot(ball.x-gp.x,ball.z-gp.z)<C.kick.reach+1.2&&Array.isArray(d.v)){applyKick(d.v);ball.owner=null}break}              // legacy message from an older client
      case 'act':{if(!isHost())break;const p=partner();if(!p||!['pass','shoot','tackle'].includes(d.a))break;
        st.pSprint=!!d.sp;hostAct(p[0],d.a,Math.max(0,Math.min(1,+d.p||0)),isFinite(d.x)&&isFinite(d.z)?{x:+d.x,z:+d.z}:null);break}
      case 'sp':if(isHost())st.pSprint=!!d.v;break;
      case 'fx':if(!isHost())stunUntil=now()+Math.min(2,+d.stun||0);break;
    }
  }

  // ---------- build: the look is src/games/soccer/Pitch.js, the HUD is src/games/soccer/Hud.js ----------
  function build(){
    if(built)return;built=true;
    const pit=SocPitch.build();mesh=pit.mesh;for(const r of pit.rings)rings.push(r);
    ui=SocHud.build({down:btnDown,up:btnUp});hud=ui.hud;bar=ui.bar;
    Net.on('soc',onNet);Systems.add('soccer',step);
  }

  // ---------- per-frame ----------
  function modsNow(){                                                        // football pacing, through PlayerMods (never S): slower with the ball, a sprint button, stunned after a missed tackle
    const carrying=(isHost()?ball.owner:st.owner)===myId,sp=sprintOn(),PC=C.pace;
    let m=sp?PC.sprint*(carrying?PC.carrySprint:1):PC.base*(carrying?PC.carry:1);
    if(now()<stunUntil)m*=PC.stun;
    return {sprint:sp,speed:m};
  }
  function step(dt){
    if(!built)return;
    const near=Math.hypot(S.x-P.x,S.z-P.z)<230;
    if(mesh)mesh.visible=near;
    if(!near){PlayerMods.clear();return}
    if(st.phase==='idle')PlayerMods.clear();else PlayerMods.set(modsNow());
    if(st.phase!=='idle'){
      if(isHost()){hostStep(dt);sendT-=dt;if(sendT<=0){sendT=Math.max(sendT+1/C.net.rate,-.1);
        Net.emit('soc',{k:'s',x:+ball.x.toFixed(2),y:+ball.y.toFixed(2),z:+ball.z.toFixed(2),vx:+ball.vx.toFixed(2),vy:+ball.vy.toFixed(2),vz:+ball.vz.toFixed(2),a:st.a,b:st.b,t:Math.round(st.t),p:st.phase,g:st.golden?1:0,n:st.note,o:ball.owner||''})}
        view.x=ball.x;view.y=ball.y;view.z=ball.z}
      else if(snap){                                                           // guest: extrapolate the snapshot, ease the drawn ball toward it
        const age=Math.min(.25,now()-snap.at),px=snap.x+snap.vx*age,pz=snap.z+snap.vz*age,py=Math.max(BR.r,snap.y+snap.vy*age+.5*BR.g*age*age),k=1-Math.exp(-18*dt);
        view.x+=(px-view.x)*k;view.y+=(py-view.y)*k;view.z+=(pz-view.z)*k;
        if(st.owner===myId&&st.phase==='play'){                                // my own dribble: draw the ball at my feet now, not 100 ms late
          const t=track(myId,S.x,S.z,dt),d=SocBall.carryDist({ownT:now()},{vx:t.vx,vz:t.vz,sprinting:sprintOn()}),k2=1-Math.exp(-30*dt);
          view.x+=(S.x+Math.sin(S.rot)*d-view.x)*k2;view.z+=(S.z+Math.cos(S.rot)*d-view.z)*k2;view.y=BR.r}
        if(now()-lastSnapAt>8){st.phase='idle';st.host=null;hudKey=''}         // host went away: drop the match
      }
      if(charging){chargeT+=dt;bar.show(charging==='pass'?'Pass power':'Shot power',Math.min(1,chargeT/CHARGE[charging]()))}
    }else{view.x=ctr.x;view.y=BR.r;view.z=ctr.z;snap=null}
    // draw the ball (rolls in the direction it moves)
    if(mesh){const px=mesh.position.x,pz=mesh.position.z;mesh.position.set(view.x,surf()+view.y,view.z);
      const dx=view.x-px,dz=view.z-pz,d=Math.hypot(dx,dz);if(d>1e-4&&d<5)mesh.rotateOnWorldAxis(new THREE.Vector3(dz/d,0,-dx/d),d/BR.r)}
    // team rings, HUD, button
    const active=st.phase!=='idle';
    if(ui)ui.show(active);
    if(active&&!st.solo){const me_=[S.x,S.z,myTeam()],p=partner();
      rings[0].visible=rings[1].visible=true;
      const setR=(r,x,z,team)=>{r.material.color.set(team==='A'?'#4aa3ff':'#ff5a5a');r.position.set(x,H(x,z)+.08,z)};
      setR(rings[0],S.x,S.z,myTeam());if(p){const gp=p[1].group.position||{x:0,z:0};setR(rings[1],gp.x,gp.z,myTeam()==='A'?'B':'A')}else rings[1].visible=false}
    else{for(const r of rings)r.visible=false}
    // scoreboard
    if(hud){let txt='';
      if(!active)txt='';
      else if(st.solo)txt='⚽ Practice · Goals '+st.a;
      else{const you=isHost()?st.a:st.b,her=isHost()?st.b:st.a,m=Math.floor(st.t/60),s=Math.floor(st.t%60);
        txt=(isHost()?'🔵 ':'🔴 ')+'You '+you+' – '+her+' '+pname()+(isHost()?' 🔴':' 🔵')+'  ·  '+(st.golden?'GOLDEN GOAL':m+':'+(s<10?'0':'')+s)}
      if(active&&st.phase==='kickoff'&&st.note)txt+='<br><small style="font-weight:400">'+st.note+'</small>';
      if(txt!==hudKey){hudKey=txt;hud.innerHTML=txt;hud.style.display=txt?'block':'none'}}
  }

  // ---------- interaction: the kick-off pad on the town side of the pitch ----------
  const padX=P.x,padZ=P.z+C.hh+5,nearPad=()=>Math.hypot(S.x-padX,S.z-padZ)<5;
  Interaction.register('soc-start','Kick off (soccer)',()=>built&&st.phase==='idle'&&nearPad(),startMatch);
  Interaction.register('soc-end','End match',()=>built&&st.phase!=='idle'&&nearPad(),()=>stopMatch(true));

  return {build,pos:{x:P.x,z:P.z},padPos:{x:padX,z:padZ},
    _s:st,_ball:ball,_view:view,_phys:phys,_players:players,_host:hostStep,_start:startMatch,_stop:stopMatch,_kick:tryKick,_kickVec:kickVector,_net:onNet,_step:step,_press:pressKick,_release:releaseKick,_setSnap:s=>{snap=s},
    _act:act,_hostAct:hostAct,_down:btnDown,_up:btnUp,_possession:possession,_mods:modsNow,_cur:()=>cur};
})();
