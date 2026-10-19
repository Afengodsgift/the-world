// LockOn: pick an enemy and the camera + your attacks follow it (cutlass auto-aims, guns fire where the camera looks).
//  - Sources register themselves: LockOn.source(name, ()=>[{id,x,y,z,hp,max,cap?,melee?(dmg,zone)}]) (pirates in Crew.js, sea monster tentacles in Monster.js, ...).
//  - Toggle with the 🎯 button / T: locks the best target (close + near the middle of the screen). Tap again to unlock; 🔁 / Y cycles to the next one.
//  - While locked the camera yaw eases to look at the target (drag to look around is overridden: unlock to look freely); the lock drops when the target dies (auto-picks the next
//    one close by), gets out of range, or you take the helm / a cannon.
// Pure helpers (score, pick) are exported for tests/lockon.sim.js. Globals at runtime: S, camera, THREE, Systems, Ship (optional).
const LockOn=(()=>{
  const RANGE=34,DROP=46,srcs=new Map();
  let tid=null,cands=[],refT=0,btn=null,cyc=null,ret=null,built=false,showBtn=false,tgt=null;
  const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // lower = better: near, and close to where the camera already looks (fwd = bearing the camera looks along)
  function score(c,px,pz,fwd){const dx=c.x-px,dz=c.z-pz,d=Math.hypot(dx,dz),off=Math.abs(wrapA(Math.atan2(dx,dz)-fwd));return d*(1+off*.9)+(c.cap?-3:0)}
  function pick(list,px,pz,fwd,skipId){let best=null,bs=1e9;for(const c of list){if(c.id===skipId)continue;const s=score(c,px,pz,fwd);if(s<bs){bs=s;best=c}}return best}
  function gather(){
    const out=[];if(typeof S==='undefined')return out;
    for(const f of srcs.values()){let a;try{a=f()}catch(e){a=null}if(!a)continue;for(const c of a){if(!c||c.hp<=0)continue;const d=Math.hypot(c.x-S.x,c.z-S.z);if(d<=(tid===c.id?DROP:RANGE)&&Math.abs((c.y||0)-S.y)<9)out.push(c)}}
    return out}
  const camFwd=()=>{if(typeof S==='undefined')return 0;return wrapA(S.yaw+Math.PI)};   // the camera looks along (-sin yaw, -cos yaw)
  function toggle(){
    if(tid!==null){tid=null;tgt=null;return false}
    cands=gather();const c=pick(cands,S.x,S.z,camFwd());if(!c)return false;tid=c.id;tgt=c;return true}
  function cycle(){
    if(tid===null)return toggle();cands=gather();const c=pick(cands,S.x,S.z,camFwd(),tid);if(c){tid=c.id;tgt=c}return !!c}
  function find(){for(const c of cands)if(c.id===tid)return c;return null}
  function step(dt){
    if(!built||typeof S==='undefined')return;
    refT-=dt;
    const seated=typeof Ship!=='undefined'&&Ship.locked&&Ship.locked();
    if(seated&&tid!==null){tid=null;tgt=null}
    if(tid!==null||refT<=0){cands=gather();refT=.25}
    if(tid!==null){
      let c=find();
      if(!c){c=pick(cands,S.x,S.z,camFwd());tid=c?c.id:null}                  // target died / left: next closest, else unlock
      tgt=c||null;
      if(c){const want=wrapA(Math.atan2(c.x-S.x,c.z-S.z)+Math.PI),k=Math.min(1,dt*6.5);S.yaw+=wrapA(want-S.yaw)*k;
        if(Math.hypot(S.gvx||0,S.gvz||0)<.6&&!S.flying&&S.grounded){const b=Math.atan2(c.x-S.x,c.z-S.z);S.rot+=wrapA(b-S.rot)*Math.min(1,dt*9);try{me.rotation.y=S.rot}catch(e){}}}   // stand and face them
    }else tgt=null;
    const show=!seated&&cands.length>0;if(btn&&show!==showBtn){showBtn=show;btn.style.display=show?'flex':'none';if(cyc)cyc.style.display=show?'flex':'none'}
    if(btn){btn.style.background=tid!==null?'#c43a3add':'#33333399';btn.textContent=tid!==null?'🔓':'🎯'}
    if(cyc)cyc.style.visibility=tid!==null&&cands.length>1?'visible':'hidden';
    reticle()}
  const _v=typeof THREE!=='undefined'?new THREE.Vector3():null;
  function reticle(){
    if(!ret)return;const c=tgt;if(!c||tid===null||typeof camera==='undefined'||!camera.matrixWorldInverse||!camera.projectionMatrix){if(ret._s){ret._s=0;ret.style.display='none'}return}
    _v.set(c.x,(c.y||0)+(c.lift||.4),c.z).project(camera);
    if(_v.z>1||_v.z<-1||Math.abs(_v.x)>1.1||Math.abs(_v.y)>1.1){if(ret._s){ret._s=0;ret.style.display='none'}return}
    ret._s=1;ret.style.display='block';ret.style.left=((_v.x+1)/2*innerWidth)+'px';ret.style.top=((1-_v.y)/2*innerHeight)+'px';
    ret.firstChild.style.width=Math.max(8,Math.min(100,(c.max?c.hp/c.max:1)*100))+'%'}
  function build(){
    if(built)return;built=true;
    try{const css=document.createElement('style');css.textContent='#lockbtn,#lockcyc{position:fixed;z-index:7;display:none;align-items:center;justify-content:center;border-radius:50%;color:#fff;font:700 24px sans-serif;border:2px solid #fff8;touch-action:none;user-select:none}#lockbtn{right:calc(env(safe-area-inset-right,0px) + 22px);bottom:calc(env(safe-area-inset-bottom,0px) + 176px);width:54px;height:54px}#lockcyc{right:calc(env(safe-area-inset-right,0px) + 84px);bottom:calc(env(safe-area-inset-bottom,0px) + 182px);width:42px;height:42px;font-size:19px;background:#33333399}#lockret{position:fixed;z-index:6;display:none;width:54px;height:54px;margin:-27px 0 0 -27px;border:3px solid #ff4040;border-radius:50%;pointer-events:none;box-shadow:0 0 10px #ff4040aa,inset 0 0 8px #ff404066}#lockret i{position:absolute;left:0;bottom:-12px;height:5px;background:#ff4040;border-radius:3px;display:block}';(document.head||document.body).appendChild(css);
      btn=document.createElement('div');btn.id='lockbtn';btn.textContent='🎯';document.body.appendChild(btn);btn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggle()});
      cyc=document.createElement('div');cyc.id='lockcyc';cyc.textContent='🔁';document.body.appendChild(cyc);cyc.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();cycle()});
      ret=document.createElement('div');ret.id='lockret';ret.appendChild(document.createElement('i'));document.body.appendChild(ret);
      addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='KeyT')toggle();else if(e.code==='KeyY'&&tid!==null)cycle()})}catch(e){}
    Systems.add('lockon',step)}
  return {build,source:(n,f)=>srcs.set(n,f),toggle,cycle,target:()=>tgt,active:()=>tid!==null,clear:()=>{tid=null;tgt=null},score,pick,_step:step,_gather:gather};
})();
