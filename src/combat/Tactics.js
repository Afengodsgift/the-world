// Tactics: how raiders USE the town. Built on Nav (src/world/Nav.js: paths through doors / stairs / roofs) and Blocks (walls).
//   Tactics.pickPost(n,t,o)   choose a rooftop or window post that sees the target from a sensible distance, spread out over the squad (claims)
//   Tactics.assign(n,post)    start heading there      Tactics.release(n)   give it back
//   Tactics.follow(n,dt)      -> {mx,mz,hold,stand,done}: where to walk this frame (outside straight to the door, then the Nav path), or "hold the post"
//   Tactics.breach(n,t)       the target is inside / on a building: path to them (door -> rooms -> stairs), waits for a stack-up at the door first
//   Tactics.flushPoint(b)     where to throw dynamite to flush someone out of a building
// Pure helpers: the game passes a visibility function (EnemyAI.sees) so this file stays testable (tests/tactics.sim.js).
const Tactics=(()=>{
  const claims=new Map();   // post -> npc id
  const key=p=>p;           // posts are plan objects: identity is the key
  const all=[];             // [{b,post,kind}]
  function setup(){all.length=0;claims.clear();for(const b of Nav.list){for(const p of b.P.roofPosts){p.bid=b.id;all.push({b,post:p,kind:'roof'})}for(const p of b.P.winPosts){p.bid=b.id;all.push({b,post:p,kind:'win'})}}}
  const d2=(ax,az,bx,bz)=>Math.hypot(ax-bx,az-bz);
  // opts: {kind:'roof'|'win'|undefined, min, max (distance post->target), vis:(x,y,z,stance)=>bool, near:(max distance npc->entry), avoid:[buildings]}
  function pickPost(n,t,o){
    o=o||{};const ty=t.y===undefined?0:t.y,inB=Nav.inside(t.x,t.z,ty),cand=[];
    for(const e of all){
      if(o.kind&&e.kind!==o.kind)continue;
      const c=claims.get(e.post);if(c!==undefined&&c!==n.id)continue;
      const p=e.post,dt=d2(p.x,p.z,t.x,t.z);if(dt<(o.min||12)||dt>(o.max||50))continue;
      if(Math.abs(p.y-ty)<.3&&dt<20&&e.kind==='roof')continue;             // a roof post level with you and close is just a worse street position
      const dn=d2(p.x,p.z,n.x,n.z);if(dn>(o.near||90))continue;
      // prefer: near me, around the middle of the weapon band, a building few others use, not the building the target is in
      let sc=dn*.6+Math.abs(dt-((o.min||12)+(o.max||50))/2)*.5,used=0;for(const [q,id] of claims)if(q.bid===p.bid&&id!==n.id)used++;sc+=used*8;if(e.b===inB)sc+=15;
      cand.push([sc,e])}
    cand.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<cand.length&&i<8;i++){const e=cand[i][1];if(!o.vis||o.vis(e.post.x,e.post.y,e.post.z,t))return e}
    return null}
  // drop claims of raiders that died / vanished
  function sweep(map){for(const [p,id] of claims){const n=map.get(id);if(!n||n.dead||n.post!==p)claims.delete(p)}}
  function assign(n,e){release(n);claims.set(e.post,n.id);n.post=e.post;n.pb=e.b;n.pk=e.kind;n.pstage='approach';n.pi=0;n.path=null;n.ph0=0;n.mode='post'}
  function release(n){if(n.post&&claims.get(n.post)===n.id)claims.delete(n.post);n.post=null;n.pb=null;n.path=null;if(n.mode==='post'||n.mode==='breach')n.mode='advance'}
  const arrive=(n,w)=>Math.hypot(w.x-n.x,w.z-n.z)<.55&&Math.abs((n.y===undefined?w.y:n.y)-w.y)<.32;
  // walk toward a point on the street: around the town's buildings (Nav street grid) when inside it, straight otherwise. now = any increasing clock (seconds)
  function walkTo(n,e,now){
    if(!n.apath||now-(n.at||0)>2.5||n.ae!==e){n.at=now;n.ae=e;n.apath=Nav.streetPath(n,e);n.ai=0}
    let tx=e.x,tz=e.z;if(n.apath&&n.apath.length){let w=n.apath[n.ai];while(w&&Math.hypot(w.x-n.x,w.z-n.z)<.9){n.ai++;w=n.apath[n.ai]}if(w){tx=w.x;tz=w.z}}
    const dx=tx-n.x,dz=tz-n.z,l=Math.hypot(dx,dz)||1;return [dx/l,dz/l]}
  // one frame of "going to / holding a post". Returns {mx,mz,hold,stand,done}
  function follow(n,dt){
    const b=n.pb;if(!b)return {mx:0,mz:0,done:true};
    const dir=(x,z)=>{const dx=x-n.x,dz=z-n.z,l=Math.hypot(dx,dz)||1;return [dx/l,dz/l]};
    if(n.pstage==='approach'){const e=Nav.entry(b);if(d2(e.x,e.z,n.x,n.z)<1.2||Nav.at(n.x,n.z,n.y===undefined?e.y:n.y,0)===b){n.pstage='path';n.path=Nav.postPath(b,n.post);n.pi=0;if(!n.path){release(n);return {mx:0,mz:0,done:true}}}
      else{n.pc=(n.pc||0)+dt;const [mx,mz]=walkTo(n,e,n.pc);return {mx,mz,hold:false}}}
    if(n.pstage==='path'){const w=n.path[n.pi];if(!w){n.pstage='hold';n.hold=0}
      else{if(arrive(n,w)){n.pi++;if(n.pi>=n.path.length){n.pstage='hold';n.hold=0}}
        const w2=n.path[Math.min(n.pi,n.path.length-1)];const [mx,mz]=dir(w2.x,w2.z);if(n.pstage==='path')return {mx,mz,hold:false}}}
    // hold: stand up to shoot for a while, duck behind the parapet / wall in between (roof posts are behind a 1.1 m parapet: crouched you are hidden)
    n.hold=(n.hold||0)+dt;const roof=n.pk==='roof',up=n.type===5?!!n.ambUp:roof?(n.hold%3.6)<1.6:true;
    return {mx:0,mz:0,hold:true,stand:up}}
  // the target is inside or on a building: stack up at the door, then go in after them.  Returns {mx,mz,hold,wait} or null when there is no way in
  function breach(n,t,now){
    const ty=t.y===undefined?0:t.y,b=Nav.at(t.x,t.z,ty,2.4);if(!b)return null;
    const mine=Nav.at(n.x,n.z,n.y===undefined?b.ground:n.y,1.2);
    const dir=(x,z)=>{const dx=x-n.x,dz=z-n.z,l=Math.hypot(dx,dz)||1;return [dx/l,dz/l]};
    if(mine!==b){const e=Nav.entry(b);                       // outside: go to the door, wait there until a squad mate is close or a moment passed
      const dd=d2(e.x,e.z,n.x,n.z);n.bw=n.bw||now;
      if(dd>7){const [mx,mz]=walkTo(n,e,now);return {mx,mz,hold:false}}
      let mates=0;for(const o of Tactics.npcs()){if(o!==n&&!o.dead&&o.bw&&d2(o.x,o.z,e.x,e.z)<9)mates++}
      if(mates<1&&now-n.bw<3.2)return {mx:0,mz:0,hold:true,wait:true};
      n.bpath=null}
    if(!n.bpath||now-(n.bpt||0)>1.1){n.bpt=now;n.bpath=Nav.path(b,mine===b?{x:n.x,z:n.z,y:n.y===undefined?b.ground:n.y}:Nav.entry(b),{x:t.x,z:t.z,y:ty});n.bi=0}
    if(!n.bpath||!n.bpath.length)return null;
    let w=n.bpath[n.bi];while(w&&arrive(n,w)){n.bi++;w=n.bpath[n.bi]}
    if(!w)return {mx:0,mz:0,hold:true};
    const [mx,mz]=dir(w.x,w.z);return {mx,mz,hold:false,inside:mine===b}}
  function flushPoint(b){const P=b.P,w=P.toWorld(P.door.lx,P.door.lz-3);return {x:w.x,z:w.z}}
  let npcsFn=()=>[];function bind(f){npcsFn=f}
  return {setup,sweep,pickPost,assign,release,follow,breach,flushPoint,bind,npcs:()=>npcsFn(),get posts(){return all}};
})();
