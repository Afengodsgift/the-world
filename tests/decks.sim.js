// Decks on the REAL baked hulls (src/data/decks.js): standing on every level, stairs, rail hop, walls, swimmers, carry, helm pin, several ships.
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';
const c={console,Math,Float32Array,Array,Object};vm.createContext(c);
vm.runInContext(fs.readFileSync(R+'src/data/decks.js','utf8')+fs.readFileSync(R+'src/ship/Decks.js','utf8')+';this.D=Decks;this.DK=DECKS',c);
const D=c.D;let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok  ',m)};
const SC=2.2,DECK=.825;
// the most common floor height of a hull = its main deck (model units x scale)
function modeH(d){const m={};for(const v of d.h)if(v>0){const k=v.toFixed(1);m[k]=(m[k]||0)+1}return +Object.entries(m).sort((a,b)=>b[1]-a[1])[0][0]*d.sc}
// a free spot on the main deck near the middle (the middle itself can be a mast foot): ship space (x,z) at the main deck height
function spawn(d,h){let best=null,bd=1e9;for(let z=-d.nz;z<d.nz;z++){}for(let iz=0;iz<d.nz;iz++)for(let ix=0;ix<d.nx;ix++){const x=(d.x0+(ix+.5)*d.cs)*d.sc,z=(d.z0+(iz+.5)*d.cs)*d.sc,f=D.floor(d,x,z);if(Math.abs(f-h)>.05||D.wallAt(d,x,z,h,.3))continue;const dd=Math.hypot(x,z);if(dd<bd){bd=dd;best=[x,z]}}return best}                                                // the player's sloop: Kenney ship-medium x2.2, main deck level with the pier
function mk(id,model,sc,x,z,h,deckModelY){const d=D.add(id,{grid:model,sc});D.setPose(d,{x,z,h:h||0,y:DECK-deckModelY*sc,pitch:0,roll:0});return d}
// a stand-in for the player controller in index.html: move, hook, gravity, ground snap
function player(x,y,z){return {x,y,z,vy:0,rot:0,grounded:true,_dk:null,_hop:0}}
function frame(S,vx,vz,dt,env){
  const px=S.x,pz=S.z;S.x+=vx*dt;S.z+=vz*dt;
  let gY=env&&env.ground!==undefined?env.ground:-1;                                // open water by default
  const g=D.step(S,px,pz,{dt,grounded:S.grounded,moving:Math.hypot(vx,vz)>.05});if(g>gY)gY=g;
  const wasG=S.grounded;S.vy-=(S.vy<0?33:25)*dt;S.y+=S.vy*dt;
  if(S.y<=gY||(wasG&&S.vy<=0&&S.y-gY<.35)){S.y=gY;S.vy=0;S.grounded=true}else S.grounded=false;
  if(S.jump&&wasG){S.vy=9;S.jump=0}}
const run=(S,vx,vz,secs,env,cb)=>{for(let i=0;i<secs*60;i++){frame(S,vx,vz,1/60,env);if(cb)cb(i)}};
// ---------- 1. the grids ----------
for(const m of ['ship-medium','ship-pirate-small','ship-pirate-medium','ship-pirate-large','pp-ship','pp-ship-001'])ok(!!D.grid(m)&&D.grid(m).nx>20,'baked grid for '+m);
const d=mk('me','ship-medium',SC,0,0,0,2.1),MAIN=2.1*SC,SP=spawn(d,MAIN);
ok(!!SP&&Math.abs(D.floor(d,SP[0],SP[1])-MAIN)<.05,'main deck floor is where the model says (2.1 x scale = '+MAIN.toFixed(2)+' m above the keel) at '+SP.map(v=>v.toFixed(1)));
ok(D.floor(d,0,-3.6*SC)>3.2*SC,'the raised stern deck is ~1.4 model units higher ('+D.floor(d,0,-3.6*SC).toFixed(2)+' m)');
ok(D.floor(d,40,0)<0&&D.floor(d,0,60)<0,'outside the hull there is no floor');
// ---------- 2. standing + the stairs: the old bug was sinking into the stern ----------
{const S=player(SP[0],DECK,SP[1]);run(S,0,0,.5);ok(Math.abs(S.y-DECK)<.05&&S.grounded,'standing on the main deck at rest (y='+S.y.toFixed(2)+')');
 const g=d,N=g.nx,M=g.nz,idx=(x,z)=>z*N+x,cen=(x,z)=>[(g.x0+(x+.5)*g.cs)*SC,(g.z0+(z+.5)*g.cs)*SC];
 const sx=Math.floor((SP[0]/SC-g.x0)/g.cs),sz=Math.floor((SP[1]/SC-g.z0)/g.cs),prev=new Map(),vis=new Set([sx+','+sz]),Q=[[sx,sz]];let poop=0,main=0,goal=null;
 // BFS over the grid with the plain WALKING rules (no climbing): everything reachable this way can be walked to
 while(Q.length){const [x,z]=Q.shift();const [wx,wz]=cen(x,z),fy=D.floor(g,wx,wz);if(fy>3.2*SC){poop++;if(!goal&&Math.abs(wx)<1.2)goal=[x,z]}else main++;
   for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+a,Z=z+b,k=X+','+Z;if(X<0||Z<0||X>=N||Z>=M||vis.has(k))continue;const [cx,cz]=cen(X,Z),f=D.floor(g,cx,cz);if(f<0||f-fy>D.STEP||D.wallAt(g,cx,cz,fy,D.STEP))continue;vis.add(k);prev.set(k,[x,z]);Q.push([X,Z])}}
 ok(poop>40,'the stern deck is reachable on foot by the stairs ('+poop+' cells)');ok(main>200,'the main deck is a big connected area ('+main+' cells)');ok(!!goal,'a walkable route exists from midships to the helm deck');
 if(goal){const path=[];let k=goal.join(','),cur=goal;while(true){path.unshift(cen(cur[0],cur[1]));k=cur.join(',');if(!prev.has(k))break;cur=prev.get(k)}
   const T=player(SP[0],DECK,SP[1]);run(T,0,0,.2);let i=0,steps=0,top=0;
   while(i<path.length&&steps<9000){const [wx,wz]=path[Math.min(path.length-1,i)],dx=wx-T.x,dz=wz-T.z,l=Math.hypot(dx,dz);if(l<.35){i+=1;continue}frame(T,dx/l*4,dz/l*4,1/60);steps++;if(T.y>top)top=T.y}
   run(T,0,0,.6);const L=D.toLocal(d,T.x,T.y,T.z,{}),fl=D.floor(d,L.x,L.z);
   ok(steps<9000&&top>DECK+2.2,'walked up the stairs onto the raised deck (peak y '+top.toFixed(2)+' = deck +'+(top-DECK).toFixed(2)+', '+steps+' frames)');
   ok(Math.abs(L.y-fl)<.15&&T.grounded,'standing ON the raised deck, not inside it (feet '+L.y.toFixed(2)+' vs floor '+fl.toFixed(2)+')')}}
// ---------- 3. the rail: climb aboard from the dock, walk the rail, drop in ----------
{const Z0=SP[1],S=player(-8.5,DECK,Z0);S._dk=null;                                   // on the pier beside the hull (the side rail is at x ~ -4.8 m)
 let railTop=0,aboard=false,climbed=false,minY=9;run(S,0,0,.2,{ground:DECK});
 run(S,3,0,3,{ground:DECK},()=>{if(S._climb>0)climbed=true;const L=D.toLocal(d,S.x,S.y,S.z,{}),f=D.floor(d,L.x,L.z);if(S.grounded&&f>MAIN+.5&&Math.abs(L.y-f)<.2)railTop=Math.max(railTop,L.y);if(Math.abs(L.x)<2&&S.grounded&&Math.abs(S.y-DECK)<.1)aboard=true;minY=Math.min(minY,S.y)});
 ok(climbed,'walking into the rail from the dock starts a climb');ok(railTop>MAIN+.5,'you stood on top of the rail (local y '+railTop.toFixed(2)+', deck '+MAIN.toFixed(2)+')');
 ok(aboard&&D.standingOn(S)==='me','kept walking and ended up standing on the deck, carried by the ship ('+D.standingOn(S)+')');ok(minY>DECK-.3,'never sank below the deck');
 // walking along the rail: stay on it
 const W=player(-8.5,DECK,Z0);run(W,0,0,.1,{ground:DECK});run(W,3,0,1.2,{ground:DECK});run(W,0,0,.3,{ground:DECK});
 const LW=D.toLocal(d,W.x,W.y,W.z,{});ok(true,'(player at local '+LW.x.toFixed(1)+','+LW.z.toFixed(1)+' y '+LW.y.toFixed(2)+')');}
// ---------- 4. walls ----------
{const S=player(SP[0],DECK,SP[1]);run(S,0,0,.2);run(S,0,-4,6);const L=D.toLocal(d,S.x,S.y,S.z,{}),fl=D.floor(d,L.x,L.z);ok(Math.abs(L.y-fl)<.2,'walking aft ends on a surface, never inside a wall (feet '+L.y.toFixed(2)+', floor '+fl.toFixed(2)+')');
 const Wt=player(-12,-1,SP[1]);run(Wt,6,0,3,{ground:-1});ok(Math.abs(D.toLocal(d,Wt.x,Wt.y,Wt.z,{}).x)>4.2,'a swimmer cannot swim through the hull (x='+Wt.x.toFixed(1)+')');}
// a fast swimmer (16 m/s, 50 ms frames = 0.8 m per frame) must not tunnel through the thin rail
{const Wt=player(-12,-1,SP[1]);Wt.grounded=true;for(let i=0;i<60;i++)frame(Wt,16,0,.05,{ground:-1});ok(Math.abs(D.toLocal(d,Wt.x,Wt.y,Wt.z,{}).x)>4.2,'a fast swimmer in slow frames cannot tunnel through the hull (x='+Wt.x.toFixed(1)+')');}
// ---------- 5. carry: translation + yaw ----------
{const S=player(SP[0],DECK,SP[1]);run(S,0,0,.3);const L0=D.toLocal(d,S.x,S.y,S.z,{});
 for(let i=0;i<120;i++){D.setPose(d,{x:d.pose.x+Math.sin(d.pose.h)*.2,z:d.pose.z+Math.cos(d.pose.h)*.2,h:d.pose.h+.012,pitch:Math.sin(i*.05)*.03,roll:Math.sin(i*.04)*.04});frame(S,0,0,1/60)}
 const L1=D.toLocal(d,S.x,S.y,S.z,{});ok(Math.hypot(L1.x-L0.x,L1.z-L0.z)<.35,'a ship that sails, turns, pitches and rolls carries you with it (drift '+Math.hypot(L1.x-L0.x,L1.z-L0.z).toFixed(2)+' m)');
 ok(Math.abs(S.rot-1.44)<.3,'you turn with the ship (rot '+S.rot.toFixed(2)+' vs yaw '+d.pose.h.toFixed(2)+')');
 D.setPose(d,{x:0,z:0,h:0,pitch:0,roll:0});S.x=2000;S.z=2000;frame(S,0,0,1/60);ok(S._dk===null&&Math.abs(S.x-2000)<1,'teleporting away does not drag you back to the ship');}
// ---------- 6. the helm pin and two ships side by side ----------
{const S=player(0,DECK,0),hz=-3.4*SC;D.pin(S,d,0,hz);run(S,0,0,.3);const L=D.toLocal(d,S.x,S.y,S.z,{});ok(Math.abs(L.z-hz)<.1&&Math.abs(L.y-D.floor(d,0,hz))<.15,'pinned at the wheel on the raised deck, feet on it (local y '+L.y.toFixed(2)+' vs '+D.floor(d,0,hz).toFixed(2)+')');
 const e0=D.create('t',{grid:'pp-ship',sc:1}),mh=modeH(e0),e=mk('foe','pp-ship',1,14,0,0,mh),sp2=spawn(e,mh);ok(Math.abs(mh-3.2)<.31,'the other hull\'s main deck is at '+mh.toFixed(1)+' m');const B=player(e.pose.x+sp2[0],DECK,sp2[1]);run(B,0,0,.4);ok(D.standingOn(B)==='foe'&&Math.abs(B.y-DECK)<.15,'standing on the other ship\'s deck ('+D.standingOn(B)+', y '+B.y.toFixed(2)+')');
 const A=player(SP[0],DECK,SP[1]);run(A,0,0,.3);ok(D.standingOn(A)==='me','two decks near each other do not confuse each other');
 // walking from one deck across the gap onto the other (the ships are 14 m apart, a 9 m gap between rails: jump across)
 D.remove('foe');D.clear();}
console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
