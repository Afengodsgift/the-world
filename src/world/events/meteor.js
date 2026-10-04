// Event: meteor shower. Streaks fall over ~1 minute and land around one spot; each leaves a crater
// (permanent evidence, rebuilt from the schedule on later sessions) and a glowing fragment you can
// pick up (shared: when one of you takes it, it is gone for both). Telegraph = the streaks plus a
// faint beam over every fragment. Pure data-driven off the event seed: no positions are networked.
(()=>{
  const N=6,FALL=2200;
  const mat=Fx.mat;
  function plan(ev){ // identical on every client
    const c=Events.site(ev,{rmin:30,rmax:170,clear:14});if(!c)return null;
    const r=Events.rng(ev,'meteor'),imp=[];
    for(let i=0;i<N;i++){
      let x=0,z=0,ok=false;
      for(let k=0;k<8&&!ok;k++){const a=r()*6.283,d=14+r()*52;x=c.x+Math.cos(a)*d;z=c.z+Math.sin(a)*d;ok=H(x,z)>.3}
      if(!ok){x=c.x;z=c.z}
      imp.push({i,id:ev.id+':'+i,x,z,y:H(x,z),t:ev.start+12000+i*8000+Math.floor(r()*2500),state:0});
    }
    return {c,imp};
  }
  function crater(x,y,z){
    const g=new THREE.Group();g.position.set(x,y+.04,z);
    const hole=new THREE.Mesh(new THREE.CircleGeometry(1.5,16),new THREE.MeshBasicMaterial({color:'#17110c'}));hole.rotation.x=-Math.PI/2;g.add(hole);
    const rim=new THREE.Mesh(new THREE.RingGeometry(1.5,2.5,16),mat('#4a3a2c'));rim.rotation.x=-Math.PI/2;rim.position.y=-.01;g.add(rim);
    for(let i=0;i<5;i++){const a=i*1.3,c2=Fx.M(new THREE.DodecahedronGeometry(.25,0),mat('#3b3027'),Math.cos(a)*2.3,.12,Math.sin(a)*2.3);g.add(c2)}
    Events.permanent().add(g);return g;
  }
  Events.define('meteor',{
    pos:(ev,st)=>st.c,
    spawn(ev){
      const P=plan(ev);if(!P)return null;
      const group=new THREE.Group();scene.add(group);
      return {c:P.c,imp:P.imp,group,streaks:[]};
    },
    tick(ev,st,dt,t,now){
      for(const m of st.imp){
        if(m.state===0&&now>=m.t-FALL){
          m.state=1;
          if(now<m.t){ // a streak coming down (skipped for late joiners: they just see the aftermath)
            const g=new THREE.Group(),core=new THREE.Mesh(new THREE.SphereGeometry(.9,10,8),new THREE.MeshBasicMaterial({color:'#ffd9a0'})),
              tail=new THREE.Mesh(new THREE.ConeGeometry(.7,12,8),new THREE.MeshBasicMaterial({color:'#ff8a3c',transparent:true,opacity:.6,fog:false}));
            tail.position.y=6.5;g.add(core,tail);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(110,240,50).normalize()); // tail points back up the fall line
            scene.add(g);m.streak=g;
          }
        }
        if(m.streak){ // fall along a fixed slanted line, tail pointing back up it
          const k=Math.min(1,(now-(m.t-FALL))/FALL),sx=m.x+110,sy=m.y+240,sz=m.z+50;
          m.streak.position.set(sx+(m.x-sx)*k,sy+(m.y+.5-sy)*k,sz+(m.z-sz)*k);
        }
        if(m.state===1&&now>=m.t){
          m.state=2;if(m.streak){scene.remove(m.streak);m.streak=null;Fx.burst(m.x,m.y,m.z,'#ffb347',22)}
          m.crater=crater(m.x,m.y,m.z);
          const f=new THREE.Group();f.position.set(m.x,m.y,m.z);
          const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.45,0),new THREE.MeshStandardMaterial({color:'#ffb347',emissive:'#ff8a1c',emissiveIntensity:1.6,roughness:.3}));gem.position.y=.9;f.add(gem);
          const beam=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,14,6,1,true),new THREE.MeshBasicMaterial({color:'#ffcf7a',transparent:true,opacity:.35,depthWrite:false,fog:false}));beam.position.y=7;f.add(beam);
          st.group.add(f);m.frag=f;m.gem=gem;m.beam=beam;
        }
        if(m.frag){
          const taken=WS.hasInSet('frag',m.id);
          m.frag.visible=!taken;
          if(!taken){
            m.gem.rotation.y+=dt*2;m.gem.position.y=.9+Math.sin(t/300+m.i)*.12;
            m.beam.visible=Math.hypot(S.x-m.x,S.z-m.z)<260;
            if(Math.hypot(S.x-m.x,S.z-m.z)<2.2&&Math.abs(S.y-m.y)<4)collect(ev,st,m);
          }
        }
      }
    },
    end(ev,st){
      for(const m of st.imp)if(m.streak)scene.remove(m.streak);
      scene.remove(st.group);                       // fragments vanish; craters stay in Events.permanent()
    },
    aftermath(ev){const P=plan(ev);if(!P)return;for(const m of P.imp)crater(m.x,m.y,m.z)}
  });
  function collect(ev,st,m){
    if(!WS.addToSet('frag',m.id))return;
    WS.addToSet('loot',m.id+':fragment');
    WS.log('event',ev.id,{text:'Caught a fallen star on '+st.c.name,icon:'☄️',x:m.x,z:m.z});   // one journal line per shower
    Fx.burst(m.x,m.y,m.z,'#ffb347',16);banner('A fragment of a fallen star','☄️ COLLECTED');try{chime()}catch(e){}
  }
})();
