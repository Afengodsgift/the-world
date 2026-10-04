// Event: golden rings. Five rings hang in the sky along a gentle curve. Fly through them IN ORDER,
// all within 75 s of the first. The next ring is bright, the others dim. Whoever finishes first
// completes it for both of you (shared 'evdone'); a timeout simply lets you try again until the
// event ends. Detection is purely local and positional, so nothing is networked while flying.
(()=>{
  const N=5,GAP=40,LIMIT=75000,R=6.5;
  let bar=null;
  const ringMat=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false,fog:false});
  Events.define('rings',{
    pos:(ev,st)=>st.c,
    spawn(ev){
      const c=Events.site(ev,{rmin:20,rmax:150,clear:8});if(!c)return null;
      const r=Events.rng(ev,'rings'),heading=r()*6.283,curve=(r()-.5)*.5;
      const g=new THREE.Group();scene.add(g);const rings=[];
      let a=heading,x=c.x,z=c.z;
      for(let i=0;i<N;i++){
        const y=Math.max(H(x,z),0)+20+i*5+Math.sin(i*1.3)*4;
        const m=new THREE.Mesh(new THREE.TorusGeometry(R,.45,10,28),ringMat('#ffd24a',.35));
        m.position.set(x,y,z);m.rotation.y=a;g.add(m);rings.push({m,x,y,z});
        a+=curve;x+=Math.sin(a)*GAP;z+=Math.cos(a)*GAP;
      }
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,60,8,1,true),new THREE.MeshBasicMaterial({color:'#ffd24a',transparent:true,opacity:.25,depthWrite:false,fog:false}));
      beam.position.set(rings[0].x,rings[0].y-20,rings[0].z);g.add(beam);
      return {c:Object.assign({},c,{y:rings[0].y}),g,rings,beam,idx:0,t0:0,done:false};
    },
    tick(ev,st,dt,t,now){
      const doneNow=WS.hasInSet('evdone',ev.id);
      if(doneNow&&!st.done){st.done=true;st.rings.forEach(o=>{o.m.material.color.set('#7dff9a');o.m.material.opacity=.6});st.beam.visible=false;if(bar)bar.hide();if(!st.mine)banner('The golden rings have been completed!','💫 TOGETHER')}
      if(st.done)return;
      st.rings.forEach((o,i)=>{o.m.material.opacity=i<st.idx?.12:i===st.idx?(.75+Math.sin(t/180)*.2):.3;o.m.material.color.set(i<st.idx?'#7dff9a':'#ffd24a')});
      st.beam.visible=st.idx===0&&Math.hypot(S.x-st.c.x,S.z-st.c.z)<400;
      if(st.idx>0){
        const left=LIMIT-(now-st.t0);
        bar=bar||Fx.bar(250);
        if(left<=0){st.idx=0;bar.hide();banner('Too slow! Fly through the first ring again','💫 GOLDEN RINGS');return}
        bar.show('💫 Ring '+(st.idx+1)+'/'+N+' · '+Math.ceil(left/1000)+'s',left/LIMIT);
      }
      const o=st.rings[st.idx];
      if(Math.hypot(S.x-o.x,S.y-o.y,S.z-o.z)<R+.5){
        if(st.idx===0)st.t0=now;
        st.idx++;Fx.burst(o.x,o.y-.8,o.z,'#ffd24a',12);
        if(st.idx>=N)finish(ev,st,now);
      }
    },
    end(ev,st){scene.remove(st.g);if(bar)bar.hide()}
  });
  function finish(ev,st,now){
    st.mine=true;st.done=true;if(bar)bar.hide();
    const secs=((now-st.t0)/1000).toFixed(1);
    st.rings.forEach(o=>{o.m.material.color.set('#7dff9a');o.m.material.opacity=.6});st.beam.visible=false;
    if(WS.addToSet('evdone',ev.id)){
      WS.addToSet('loot',ev.id+':goldleaf');
      WS.log('event',ev.id,{text:'Flew through all the golden rings in '+secs+'s',icon:'💫',x:st.c.x,z:st.c.z});
    }
    banner('All '+N+' rings in '+secs+'s','💫 GOLDEN RINGS COMPLETE');try{chime()}catch(e){}
    Fx.burst(S.x,S.y,S.z,'#ffd24a',30);
  }
})();
