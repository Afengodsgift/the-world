  S.iframe=Math.max(0,S.iframe-dt);S.hurt=Math.max(0,S.hurt-dt);$('flash').style.opacity=S.hurt>0?Math.min(.35,S.hurt*.7):0;
  const rr=Math.hypot(S.x,S.z);const RB=3300;if(rr>RB){S.x*=RB/rr;S.z*=RB/rr}
  let gY=H(S.x,S.z);
  {const dxs=S.x-SKY.x,dzs=S.z-SKY.z,dsky=Math.hypot(dxs,dzs);if(dsky<SKY.R*1.4){const sh=SKYH(dxs,dzs);if(S.y>=sh-3)gY=Math.max(gY,sh)}}
  const wat=gY<-.5;if(wat)gY=-1;
  const hi=S.flying&&S.y>gY+14&&Math.hypot(S.x-SKY.x,S.z-SKY.z)>SKY.R+60;
  for(const c of solids){if(hi)break;const ax=S.x-c.x,az=S.z-c.z,dd=Math.hypot(ax,az),R=c.r+.4;
    if(dd<R){if(c.h&&S.y>=c.h-.15)gY=Math.max(gY,c.h);else if(!c.noSide&&dd>1e-4){S.x=c.x+ax/dd*R;S.z=c.z+az/dd*R}}}
  const wasG=S.grounded;
  if(jumpQ){if(wasG&&!S.flying)S.vy=wat?6:9;else{S.flying=!S.flying;if(S.flying&&!S.tipped){S.tipped=1;banner('Drag up to climb · drag down to dive','FLYING')}}}jumpQ=false;
  if(S.flying)S.vy+=((len>.05?Math.max(-20*(bst()?2.4:1),Math.min(14*(bst()?2.4:1),(.4-S.pitch)*40*(bst()?2.4:1))):0)-S.vy)*Math.min(1,dt*6);else S.vy-=25*dt;
  const imp=-S.vy;S.y+=S.vy*dt;if(S.flying)S.y=Math.min(S.y,260);
  const onSky=Math.hypot(S.x-SKY.x,S.z-SKY.z)<SKY.R*1.15;if(S.flying&&onSky&&S.y<gY+2.5&&S.vy<=2){S.flying=false;S.vy=0;}if(S.flying&&S.y<=gY)S.flying=false;
  if(S.y<=gY||(wasG&&S.vy<=0&&S.y-gY<.35)){S.y=gY;S.vy=0;S.grounded=true;if(!wasG&&imp>5)me.userData.land=Math.min(.18,imp*.014)}else S.grounded=false;
  S.state=S.flying?'fly':!S.grounded?(S.vy>0?'jump':'fall'):wat?'swim':len>.05?(sprint?'run':'walk'):'idle';
  me.position.set(S.x,S.y,S.z);me.rotation.y=S.rot;animate(me,dt,S.state);explore(dt,t);
  const k=1-Math.exp(-12*dt);
  for(const o of others.values()){
    const p=o.group.position;p.x+=(o.tx-p.x)*k;p.y+=(o.ty-p.y)*k;p.z+=(o.tz-p.z)*k;
    o.group.rotation.y=lerpAngle(o.group.rotation.y,o.tr,k);animate(o.group,dt,o.st);
  }
  camY+=(S.y-camY)*(1-Math.exp(-6*dt));
  const d=9,cp=Math.cos(S.pitch);
  const cx=S.x+Math.sin(S.yaw)*d*cp,cz=S.z+Math.cos(S.yaw)*d*cp;
  camera.position.set(cx,Math.max(H(cx,cz)+.8,camY+1.6+Math.sin(S.pitch)*d),cz);
  camera.lookAt(S.x,camY+1.4,S.z);
  if(sun){sun.target.position.set(S.x,S.y,S.z);sun.position.copy(sun.userData.sd).multiplyScalar(140).add(sun.target.position);sky.position.copy(camera.position);if(seaTex){seaTex.offset.x+=dt*.0006;seaTex.offset.y+=dt*.0004}
    fpsA=fpsA*.97+dt*.03;if(sun.castShadow&&++fpsN>240&&fpsA>.034){sun.castShadow=false;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true})}}
  S.burst=Math.max(0,(S.burst||0)-dt);if(!S.flying)S.boost=false;
  if(S.flying!==bvis){bvis=S.flying;$('boost').style.display=bvis?'block':'none';if(!bvis){$('boost').textContent='Boost';$('boost').style.opacity=.75}}
  if(PAN_ENABLED&&!S.flying){
    $('smack').style.display='block';
    $('smack').textContent=panEquipped?'Smack':'Equip';
    $('smack').style.background=panEquipped?'#ff7070dd':'#ffd27acc';
    $('smack').style.color=panEquipped?'#4a0606':'#2a1c00';
  }else $('smack').style.display='none';
  const tf=S.flying?(bst()?95:80):65;if(Math.abs(camera.fov-tf)>.1){camera.fov+=(tf-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix()}
  smackTick(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}
