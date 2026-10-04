// Event: wandering visitor. A hooded traveller with a lantern stands somewhere on the islands for ~5
// minutes. Talk to them (Use) and they tell you about a camp or vault you have NOT found yet: it is
// revealed on both your maps and goes in the Journal. One conversation per visit, shared by both.
(()=>{
  const mat=Fx.mat;
  const LINES=[['Psst… you two look like explorers.','I’ve walked these islands a long time.'],
               ['A lantern in the dark finds friends.','Let me tell you a secret before I go.'],
               ['Not many pass this way.','Since you did, here is something worth knowing.']];
  let active=null;                          // the visitor currently standing in the world
  const NEAR=3.6;
  Events.define('visitor',{
    pos:(ev,st)=>st.c,
    spawn(ev){
      const c=Events.site(ev,{rmin:25,rmax:175,clear:6});if(!c)return null;
      const g=new THREE.Group();g.position.set(c.x,c.y,c.z);scene.add(g);
      const robe=Fx.M(new THREE.CylinderGeometry(.28,.75,1.8,10),mat('#2f4a5a'),0,.9,0),hood=Fx.M(new THREE.SphereGeometry(.42,10,8),mat('#2f4a5a'),0,2.0,0);
      const face=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:'#0b1218'}));face.position.set(0,2.0,.3);
      const staff=Fx.M(new THREE.CylinderGeometry(.04,.04,2.6,6),mat('#6b4a2a'),.7,1.3,.1),
            lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:'#ffd27a'}));lamp.position.set(.7,2.7,.1);
      const halo=new THREE.Mesh(new THREE.SphereGeometry(1.0,12,8),new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.22,depthWrite:false}));halo.position.copy(lamp.position);
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,20,6,1,true),new THREE.MeshBasicMaterial({color:'#ffcf7a',transparent:true,opacity:.25,depthWrite:false,fog:false}));beam.position.y=10;
      g.add(robe,hood,face,staff,lamp,halo,beam);
      const st={c,g,lamp,halo,beam,talking:false};active={ev,st};return st;
    },
    tick(ev,st,dt,t,now){
      const d=Math.hypot(S.x-st.c.x,S.z-st.c.z);
      st.beam.visible=d<320&&!WS.hasInSet('evdone',ev.id);
      st.halo.scale.setScalar(1+Math.sin(t/180)*.08);
      if(d<14){const want=Math.atan2(S.x-st.c.x,S.z-st.c.z);st.g.rotation.y+=Math.atan2(Math.sin(want-st.g.rotation.y),Math.cos(want-st.g.rotation.y))*Math.min(1,dt*3)} // turns to face you
      const left=ev.end-now;st.g.scale.setScalar(left<12000?Math.max(.01,left/12000):1);     // fades away at the end
      if(WS.hasInSet('evdone',ev.id)&&!st.told){st.told=true;if(!st.talking)banner('The traveller has already shared their secret','🏮 VISITOR')}
    },
    end(ev,st){scene.remove(st.g);if(active&&active.ev===ev)active=null}
  });
  function talk(){
    Promise.resolve().then(()=>{if(me)me.userData.emote=null});
    if(!active)return;const {ev,st}=active;
    if(WS.hasInSet('evdone',ev.id)||st.talking)return;
    st.talking=true;
    const r=Events.rng(ev,'talk'),L=LINES[Math.floor(r()*LINES.length)];
    const pool=[...(typeof Verbs!=='undefined'?Verbs.unseen().map(x=>({m:Verbs,o:x})):[]),...(typeof Vaults!=='undefined'?Vaults.unseen().map(x=>({m:Vaults,o:x})):[])];
    const tgt=pool.length?pool[Math.floor(r()*pool.length)]:null;
    banner(L[0],'🏮 THE VISITOR');
    setTimeout(()=>{
      st.talking=false;
      if(!WS.addToSet('evdone',ev.id))return;                       // someone else just spoke to them
      let text;
      if(tgt){
        tgt.m.reveal(tgt.o.id,'A wandering visitor told you about '+tgt.o.what+' on '+tgt.o.name);
        text='A wandering visitor told you about '+tgt.o.what+' on '+tgt.o.name;
        banner(L[1]+' There is '+tgt.o.what+' on '+tgt.o.name+'. I marked it on your map.','🏮 SECRET SHARED');
      }else{
        WS.addToSet('loot',ev.id+':charm');text='A wandering visitor gave you a wanderer’s charm';
        banner('You already know every secret I do. Take this charm.','🏮 A GIFT');
      }
      WS.log('event',ev.id,{text,icon:'🏮',x:st.c.x,z:st.c.z});try{chime()}catch(e){}
      Fx.burst(st.c.x,st.c.y,st.c.z,'#ffd27a',18);
    },2600);
  }
  Interaction.register('ev:talk','💬 Talk',()=>{
    if(!active||!S.grounded||S.flying)return false;
    const {ev,st}=active;return !st.talking&&!WS.hasInSet('evdone',ev.id)&&Math.hypot(S.x-st.c.x,S.z-st.c.z)<NEAR;
  },talk);
})();
