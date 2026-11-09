// PARKOUR COURSE: the Parkour Isle race track as pure data (no THREE, no DOM). Built from axis-aligned boxes so ParkourCore collides with it exactly.
// Coordinates are ISLAND-LOCAL (origin = island centre); add PKI.x / PKI.z for world. Point-to-point: START -> 4 sides spiralling inwards -> FINISH.
//   build() -> {boxes, wps (AI guide waypoints with action hints), cps (checkpoints), start:{x,z,yaw}, finish:{x,z,r}, length, base(x,z), GY}
// Modules (each is a skill check): vaults, slide arches, wall-up towers, gap runs (long jumps), rising ledge gaps (ledge grab + mantle), wall-run corridors, drop + roll, flip run-in.
const ParkourCourse=(()=>{
  const GY=3.2,LANE=4.2,DX=[1,0,-1,0],DZ=[0,1,0,-1],PLAT=180;
  function build(){
    const boxes=[],wps=[],cps=[],pits=[];let ps=null;let c={x:-100,z:-100,d:0,y:GY},len=0;
    const left=d=>(d+1)&3;
    const P=(u,v)=>({x:c.x+DX[c.d]*u+DX[left(c.d)]*v,z:c.z+DZ[c.d]*u+DZ[left(c.d)]*v});
    const box=(u0,u1,v0,v1,y0,y1,k)=>{const a=P(u0,v0),b=P(u1,v1);boxes.push({x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z),y0,y1,k:k||'solid'})};
    const way=(u,v,act,o)=>{const p=P(u,v);wps.push(Object.assign({x:p.x,z:p.z,y:c.y,act:act||null,r:act?1.1:2.6},o||{}))};
    const adv=l=>{c.x+=DX[c.d]*l;c.z+=DZ[c.d]*l;len+=l};
    const turn=()=>{way(5,0);adv(8);c.d=left(c.d);way(3,0)};
    const cp=name=>cps.push({x:P(1,0).x,z:P(1,0).z,y:c.y,d:c.d,wi:wps.length,name});
    const straight=l=>{for(let u=12;u<=l;u+=12)way(u,0);adv(l)};
    const vault=(h,sp)=>{box(sp-.3,sp+.3,-LANE,LANE,c.y-2,c.y+h,'vault');way(sp-4,0);way(sp+2,0);};
    const arch=(sp)=>{way(sp-3.4,0,'slide');box(sp,sp+7,-LANE,LANE,c.y+1.05,c.y+3.4,'arch');box(sp,sp+7,LANE,LANE+1,c.y-2,c.y+3.4,'side');box(sp,sp+7,-LANE-1,-LANE,c.y-2,c.y+3.4,'side');way(sp+9,0)};
    const platform=(l,w)=>{w=w||3.6;box(0,l,-w,w,c.y-3,c.y,'plat');for(let u=l<12?l/2:5;u<l;u+=10)way(u,0);adv(l)};
    // climb n blocks of height h, each `dep` deep (wall-up chain)
    const tower=(n,h,dep)=>{for(let i=0;i<n;i++){const u0=8+dep*i;box(u0,u0+dep,-LANE,LANE,c.y-3-h*i*0,c.y+h*(i+1),'wall');way(u0-1.6,0,'jump',{ar:1.0});way(u0+dep*.5,0)}adv(8+dep*n);c.y+=h*n;way(2,0)};
    // platforms across gaps. list of [platLen,gap,dy]; the AI jumps from the last metre of every platform
    const gaps=list=>{for(const[pl,gp,dy]of list){box(0,pl,-3.6,3.6,c.y-3,c.y,'plat');way(Math.max(1.5,pl-1.35),0,'jump',{ar:.9});adv(pl);c.y+=0;adv(gp);c.y+=dy||0;if(dy)way(.01,0)}}
    // a wall-run corridor: runway, gap with a tall wall along its left edge, landing
    const wallrun=(gap)=>{const run=9,land=9;box(0,run,-3.6,3.6,c.y-3,c.y,'plat');box(0,run+gap+land,3.6,4.8,c.y-3,c.y+14,'wall');
      way(2,2.9);way(run-2.4,3.0,'jump',{ar:.9});way(run+gap*.6,3.0,null,{r:3});box(run+gap,run+gap+land,-3.6,3.6,c.y-3,c.y,'plat');way(run+gap+4,1.5);adv(run+gap+land)};
    const pitOn=()=>{const q=P(7.5,0);ps={x:q.x,z:q.z,d:c.d}};
    const pitOff=()=>{if(!ps)return;const a=ps,b=c,W=10,x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),z0=Math.min(a.z,b.z),z1=Math.max(a.z,b.z);
      pits.push(a.d&1?{x0:x0-W,x1:x1+W,z0,z1}:{x0,x1,z0:z0-W,z1:z1+W});ps=null};
    const drop=()=>{pitOff();way(3,0);adv(14);c.y=GY;way(2,0);cp('ground')};
    const flipRun=()=>{way(14,0,'flip',{ar:1.3})};
    // ---- side 1 (east): start, vaults, arches, tower, gap run, drop
    cp('start');straight(18);
    [1.0,1.25,1.45,1.0,1.55].forEach((h,i)=>vault(h,10+i*10));adv(60);cp('vaults');
    for(let i=0;i<3;i++)arch(7+i*14);adv(46);
    straight(6);cp('tower');pitOn();tower(2,2.8,6);platform(10);cp('gaps');
    gaps([[8,4],[8,4.6],[8,5]]);platform(8);drop();turn();
    // ---- side 2 (south): ladder tower, wall-run corridor, rising ledge gaps, drop
    cp('ladder');straight(8);pitOn();tower(3,2.4,5);platform(8);cp('wallrun');wallrun(14);platform(6);
    cp('ledges');gaps([[7,3.6,2.0],[7,3.6,2.0],[8,3.6,0]]);platform(8);drop();turn();
    // ---- side 3 (west): gauntlet, tower, second wall-run, long gaps, drop
    cp('gauntlet');straight(4);vault(1.3,10);arch(18);vault(1.4,36);arch(44);vault(1.2,62);adv(72);
    cp('tower2');pitOn();tower(2,2.8,6);platform(8);cp('wallrun2');wallrun(12);platform(6);
    gaps([[6,4.4],[6,5],[8,5.4]]);platform(8);drop();turn();
    // ---- side 4 (north): the run-in with a flip, then the line
    cp('final');straight(14);flipRun();straight(36);
    // ---- INNER LAP (the course doubles back through the middle of the island): hurdles, slalom, rails of arches, a tower + wall-run, long gaps
    const slalom=n=>{for(let i=0;i<n;i++){const u=8+i*9,sd=i&1?-1:1;box(u,u+1.8,sd>0?.5:-LANE,sd>0?LANE:-.5,c.y-3,c.y+9,'wall');way(u-1,-sd*2.3);way(u+.9,-sd*2.3)}adv(8+n*9+4);way(0,0)};
    const hurdles=(n,sp)=>{for(let i=0;i<n;i++)vault([1,1.2,.9,1.35,1,1.5,1.1][i%7],sp+i*7);adv(sp+n*7+4)};
    turn();cp('inner');straight(8);hurdles(5,8);cp('slalom');slalom(5);
    arch(6);vault(1.4,22);adv(36);
    turn();straight(4);turn();
    cp('wallrun3');straight(4);pitOn();tower(2,2.6,6);platform(8);wallrun(13);platform(6);gaps([[6,4.6,1.6],[7,4.8,0]]);platform(8);drop();
    cp('sprint');straight(12);vault(1.3,10);arch(22);adv(20);
    const fin=P(14,0);way(12,0);
    const inPit=(x,z)=>pits.some(r=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1);
    return{boxes,wps,cps,pits,inPit,start:{x:-100+0,z:-100,yaw:Math.PI/2},finish:{x:fin.x,z:fin.z,r:5,y:GY},length:len,GY,PLAT,
      base:(x,z)=>Math.hypot(x,z)<PLAT?GY:-Infinity}}
  return{build,GY,PLAT}})();
