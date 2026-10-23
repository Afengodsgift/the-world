// WestTown: real, ENTERABLE western buildings made from the "Low Poly Wild West" modular kit (assets/west, tools/convert_west.mjs), for Outlaw Isle.
// plan(spec) is PURE (no THREE / DOM; tests/westtown.sim.js): from a small spec it returns
//   pieces: what to draw  [{n:'wall-door-a', x,y,z, ry, s:[sx,sy,sz]}]
//   boxes : wall boxes with REAL door and window openings (derived from the kit's own geometry: manifest `prof`), parapets, railings
//   floors: walkable rectangles: interior floors, stair STEPS (so you really climb), balconies, roofs, porch
//   posts : places a raider can use: window ambush posts, rooftop sniper posts, door/stair nodes for pathing
// Every building: 1 or 2 storeys, a flat walkable roof with a low parapet (cover for snipers), interior stairs (ground -> 2nd floor -> roof hatch) or an outside stair to the roof,
// a front porch, front balcony on two-storey buildings, interior props. Building frame: +z is the FRONT (street side), x across; yaw quarter-turns only, so every box stays axis-aligned.
// Kit pieces are thin in X (outward = +x) and run along Z; one wall module = 3.0 m kit units x SC.
const WestTown=(()=>{
  const SC=1.25,M=3*SC,H=2.2*SC,FT=.22,PAR=1.1,STEPS=6;
  let MAN={};
  const setManifest=m=>{MAN=m||{}};
  const OUT={f:{a:-Math.PI/2,nx:0,nz:1},b:{a:Math.PI/2,nx:0,nz:-1},r:{a:0,nx:1,nz:0},l:{a:Math.PI,nx:-1,nz:0}};
  // ---------- one building plan ----------
  function plan(spec){
    const k=((spec.q||0)%4+4)%4,tb=k*Math.PI/2,cb=Math.cos(tb),sb=Math.sin(tb),nx=spec.nx,nz=spec.nz,fl=spec.floors||1,W=nx*M,D=nz*M,y0=spec.y||0;
    const P={id:spec.id,kind:spec.kind,out:!!spec.out,x:spec.cx,z:spec.cz,q:k,W,D,floors:fl,pieces:[],boxes:[],floorsR:[],posts:[],nav:[],props:[],door:null,roofY:y0+fl*H+FT};
    const wx=(lx,lz)=>spec.cx+lx*cb+lz*sb,wz=(lx,lz)=>spec.cz-lx*sb+lz*cb;            // building-local -> world
    const wx_wz=(lx,lz)=>({x:wx(lx,lz),z:wz(lx,lz)});
    const rect=(ax,az,bx,bz)=>{const p=[[wx(ax,az),wz(ax,az)],[wx(bx,bz),wz(bx,bz)]];return {x0:Math.min(p[0][0],p[1][0]),x1:Math.max(p[0][0],p[1][0]),z0:Math.min(p[0][1],p[1][1]),z1:Math.max(p[0][1],p[1][1])}};
    const piece=(n,lx,ly,lz,a,s)=>{P.pieces.push({n,x:wx(lx,lz),y:y0+ly,z:wz(lx,lz),ry:a+tb,s:s||[SC,SC,SC]})};
    const bx=(ax,az,bx_,bz,ly0,ly1,tag)=>{const r=rect(ax,az,bx_,bz);P.boxes.push(Object.assign(r,{y0:y0+ly0,y1:y0+ly1,tag:tag||'wall'}))};
    const fl_=(ax,az,bx_,bz,ly,tag,step)=>{const r=rect(ax,az,bx_,bz);P.floorsR.push(Object.assign(r,{y:y0+ly,tag:tag||'floor',step:!!step}))};
    const pbox=(ax,az,bx_,bz,ly0,ly1,col)=>{const r=rect(ax,az,bx_,bz);P.pieces.push({box:Object.assign(r,{y0:y0+ly0,y1:y0+ly1}),col:col||'#7a4a26'})};   // a plain drawn box (stair steps...)
    const post=(o)=>{const p=Object.assign({},o);p.x=wx(o.lx,o.lz);p.z=wz(o.lx,o.lz);p.y=y0+o.ly;p.face=Math.atan2(OUT[o.side].nx*cb+OUT[o.side].nz*sb,-OUT[o.side].nx*sb+OUT[o.side].nz*cb);P.posts.push(p)};
    const node=(id,lx,ly,lz,tag)=>{const n={id:spec.id+':'+id,x:wx(lx,lz),y:y0+ly,z:wz(lx,lz),tag,b:spec.id};P.nav.push(n);return n};
    // wall piece placement: side f/b/l/r, module i along that side, storey s. The kit piece's collision rects become boxes.
    function wall(name,side,i,s,o){
      o=o||{};const O=OUT[side],along=side==='f'||side==='b'?nx:nz,len=side==='f'||side==='b'?W:D;void along;
      const c=-len/2+M*(i+.5),px=side==='f'?c:side==='b'?c:side==='r'?W/2:-W/2,pz=side==='f'?D/2:side==='b'?-D/2:c,ly=s*H,sy=o.sy||1;
      piece(name,px,ly,pz,O.a,[SC,SC*sy,SC]);
      const pr=MAN[name]&&MAN[name].prof,th=.3,ca=Math.cos(O.a),sa=Math.sin(O.a);
      const rects=pr?pr.r:[[-1.5,1.5,0,2.25]];
      for(const [z0,z1,a0,a1] of rects){
        // piece-local (x thickness, z width) -> building-local via Ry(a): x' = x cos + z sin ; z' = -x sin + z cos
        const pts=[[-th/2,z0*SC],[th/2,z1*SC]].map(([xp,zp])=>[px+xp*ca+zp*sa,pz-xp*sa+zp*ca]);
        bx(pts[0][0],pts[0][1],pts[1][0],pts[1][1],ly+a0*SC*sy,ly+a1*SC*sy,o.tag)}
      const map=(xp,zp)=>({lx:px+xp*ca+zp*sa,lz:pz-xp*sa+zp*ca});   // piece space (x out, z along) -> building space
      return {px,pz,ly,map}}
    const front=spec.front||{},door=front.door===undefined?(nx>>1):front.door;
    // ---- walls, storey by storey ----
    for(let s=0;s<fl;s++){
      for(let i=0;i<nx;i++){   // front
        let n=(i+s)%2?'window-a':'window-c';
        if(s===0&&i===door)n=spec.saloon?'saloon-door-a':'wall-door-a';
        else if(s===1&&i===door&&spec.balcony!==false)n='wall-door-b';
        const w=wall(n,'f',i,s);
        if(/window/.test(n)){const q=w.map(-.9,(i%2?-1:1)*.75*SC);post({lx:q.lx,lz:q.lz,ly:s*H+FT,side:'f',kind:'win',s})}
        if(s===0&&i===door)P.door={lx:w.px,lz:w.pz,side:'f'}}
      for(let i=0;i<nx;i++){   // back
        let n=i%2?'wall-a':'window-a';if(s===0&&i===(spec.backDoor===undefined?0:spec.backDoor))n='wall-door-c';
        const w=wall(n,'b',i,s);if(/window/.test(n)){const q=w.map(-.9,.75*SC);post({lx:q.lx,lz:q.lz,ly:s*H+FT,side:'b',kind:'win',s})}}
      for(const side of ['l','r'])for(let j=0;j<nz;j++){
        const n=j===(nz>>1)&&(s+(side==='l'?0:1))%2===0?'window-c':'wall-a';const w=wall(n,side,j,s);if(/window/.test(n)){const q=w.map(-.9,.75*SC);post({lx:q.lx,lz:q.lz,ly:s*H+FT,side,kind:'win',s})}}
      for(const [px,pz] of [[-W/2,-D/2],[W/2,-D/2],[-W/2,D/2],[W/2,D/2]]){piece('corner-post-b',px,s*H,pz,0);bx(px-.16,pz-.16,px+.16,pz+.16,s*H,s*H+H,'post')}
    }
    // ---- floors: interior ground floor, upper floors with a stair hole, roof with a hatch ----
    const stairCell={i:0,j:0};                                    // stairwell: back-left cell (i along x, j along z from the back)
    const hatch=fl>=2?{i:nx-1,j:0}:null;                          // 2nd -> roof stair: back-right cell
    const ftile=(k,lx,ly,lz,w,d)=>pbox(lx-w/2,lz-d/2,lx+w/2,lz+d/2,ly-.06,ly+FT,['#8a6a42','#7f6038','#936f46','#86663d','#7a5c36'][k%5]);   // plain plank slab: the kit's floor tiles cost ~700 triangles each
    const cx_=i=>-W/2+M*i,cz_=j=>-D/2+M*j,tiles=['floor-a','floor-b','floor-c','floor-d','floor-e'],ts=M/3.08;
    for(let s=0;s<=fl;s++){
      const top=s===fl;
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
        const hole=(s===1&&fl>=2&&i===stairCell.i&&j===stairCell.j)||(s===fl&&hatch&&i===hatch.i&&j===hatch.j&&fl>=2);
        const lx=cx_(i)+M/2,lz=cz_(j)+M/2,ly=s*H;
        if(s===0){ftile(i*3+j*7,lx,0,lz,M,M);continue}
        if(hole){ // the stair strip stays open; only the landing beside it gets a tile
          const left=i===0,lw=M-1.84,cxl=left?cx_(i)+1.84+lw/2:cx_(i)+lw/2,kt=top?3.3:3.08;if(top)piece('roof-a',cxl,ly,lz,0,[lw/kt,SC,M/kt]);else ftile(i+j,cxl,ly,lz,lw,M);   // side part
          {const bxl=left?cx_(i)+.92:cx_(i)+M-.92;if(top)piece('roof-a',bxl,ly,cz_(j)+.65,0,[1.84/kt,SC,1.3/kt]);else ftile(i+j+1,bxl,ly,cz_(j)+.65,1.84,1.3)}continue}   // back landing
        if(top)piece('roof-a',lx,ly,lz,0,[M/3.3,SC,M/3.3]);else ftile(i+j*2,lx,ly,lz,M,M)}
      // floor rectangles (hole = strip of the stair cell)
      const ly=s*H+FT;
      if(s===0){fl_(-W/2+.15,-D/2+.15,W/2-.15,D/2-.15,FT,'floor');continue}
      const holes=[];if(s===1&&fl>=2)holes.push([cx_(stairCell.i),cz_(stairCell.j),stairCell.i,stairCell.j]);if(s===fl&&hatch&&fl>=2)holes.push([cx_(hatch.i),cz_(hatch.j),hatch.i,hatch.j]);
      // cut the slab into cells, skip hole cells but keep the part of the cell the stairs do not use
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
        const h=holes.find(q=>q[2]===i&&q[3]===j);
        if(!h){fl_(cx_(i),cz_(j),cx_(i)+M,cz_(j)+M,ly,top?'roof':'floor');continue}
        // the stair strip (1.5 m along the left/right wall) is open from the landing to the cell's front edge; the rest of the cell stays floor
        const left=h[2]===0,tg=top?'roof':'floor',z0=cz_(j),sx0=left?cx_(i)+.14:cx_(i)+M-1.84,sx1=sx0+1.7;
        fl_(cx_(i),z0,cx_(i)+M,z0+1.3,ly,tg);                                  // back landing across the whole cell
        if(left)fl_(sx1,z0+1.3,cx_(i)+M,z0+M,ly,tg);else fl_(cx_(i),z0+1.3,sx0,z0+M,ly,tg);
        if(left)fl_(cx_(i),z0+1.3,sx0,z0+M,ly,tg);else fl_(sx1,z0+1.3,cx_(i)+M,z0+M,ly,tg)}
    }
    // ---- stairs (real steps). They rise TOWARD the back wall, so you walk straight onto the bottom step from the room; a landing at the top joins the upper floor sideways ----
    const risePer=H/STEPS,LAND=1.3;
    function stairs(i,j,s,name){
      const left=i===0,sx0=left?cx_(i)+.14:cx_(i)+M-1.84,sx1=sx0+1.7,z0=cz_(j),run=(M-LAND)/STEPS,base=s*H+FT;
      for(let k=0;k<STEPS;k++){
        const zb=z0+M-k*run,za=zb-run,top=base+(k+1)*risePer;
        fl_(sx0,za,sx1,zb,top,'step',true);
        pbox(sx0,za,sx1,zb,base-.02,top,k%2?'#8a5530':'#7a4a26')}
      const open=left?sx1:sx0,wallSide=left?sx0-.2:sx1;
      bx(open-.06,z0+LAND+.6,open+.06,z0+M-1.3,base+risePer*2,base+H+1.0,'rail');                      // rail along the open side of the climb and the hole above it
      bx(sx0,z0+M-.06,sx1,z0+M+.06,base+H,base+H+1.0,'rail');                                    // rail across the hole's front edge (upstairs only)
      bx(wallSide,z0,wallSide+.2,z0+M,base,base+H+1.0,'rail');
      node(name+':bot',(sx0+sx1)/2,base,z0+M-.35,'stairbot');node(name+':top',(sx0+sx1)/2,base+H,z0+LAND*.82,'stairtop')}
    if(fl>=2)stairs(stairCell.i,stairCell.j,0,'s0');
    if(hatch&&fl>=2)stairs(hatch.i,hatch.j,1,'s1');
    // ---- single storey: an outside stair up the right wall to the roof ----
    if(fl===1){
      const run=.62,w=1.8,x0=W/2+.5,zA=-D/2+.6,n=Math.round((H+FT)/.42);
      for(let k=0;k<n;k++){const top=(k+1)*((H+FT)/n);fl_(x0,zA+k*run,x0+w,zA+(k+1)*run+(k===n-1?.01:0),top,'step',true);
        pbox(x0,zA+k*run,x0+w,zA+(k+1)*run,-.02,top,k%2?'#8a5530':'#7a4a26')}
      // landing from the top step onto the roof (roof slab reaches x = W/2; bridge)
      fl_(W/2-.2,zA+n*run-.01,x0+w,zA+n*run+1.0,H+FT,'floor');fl_(W/2-.2,-D/2,x0,zA+n*run+1.0,H+FT,'floor');
      P.roofStair={x:x0+w/2,z:zA+n*run+.5};
      bx(x0-.06,zA,x0+.06,zA+n*run,FT,FT+1.0,'rail');bx(x0+w-.06,zA,x0+w+.06,zA+n*run,FT,FT+1.0,'rail');
      node('rs:bot',x0+w/2,FT,zA-.6,'stairbot');node('rs:top',x0+w/2,H+FT,zA+n*run+.5,'stairtop')}
    // ---- porch (front boardwalk) and balcony ----
    {const pd=2.0;fl_(-W/2,D/2,W/2,D/2+pd,FT,'porch');pbox(-W/2,D/2,W/2,D/2+pd,-.06,FT,'#7a5c36');
     if(fl>=2&&spec.balcony!==false){const b0=Math.max(0,door-1),b1=Math.min(nx-1,door+1),bw=b1-b0+1,bxl=-W/2+M*b0,bxr=-W/2+M*(b1+1);
       fl_(bxl,D/2,bxr,D/2+1.5,H+FT,'balcony');
       for(let i=b0;i<=b1;i++)piece('balcony-with-railing-a',-W/2+M*(i+.5),H,D/2,OUT.f.a,[SC,SC,M/3.3]);
       bx(bxl,D/2+1.42,bxr,D/2+1.5,H+FT,H+FT+1.05,'rail');bx(bxl,D/2,bxl+.08,D/2+1.5,H+FT,H+FT+1.05,'rail');bx(bxr-.08,D/2,bxr,D/2+1.5,H+FT,H+FT+1.05,'rail');void bw;
       node('balcony',(bxl+bxr)/2,H+FT,D/2+.8,'balcony')}}
    // ---- roof parapet (cover for snipers) ----
    {const ry=fl*H+FT,e=.14;
     const gapR=P.roofStair;                                       // opening where the outside stair comes onto the roof
     bx(-W/2,D/2-e*2,W/2,D/2,ry,ry+PAR,'parapet');bx(-W/2,-D/2,W/2,-D/2+e*2,ry,ry+PAR,'parapet');bx(-W/2,-D/2,-W/2+e*2,D/2,ry,ry+PAR,'parapet');
     if(gapR){bx(W/2-e*2,-D/2,W/2,gapR.z-1.0,ry,ry+PAR,'parapet');bx(W/2-e*2,gapR.z+1.0,W/2,D/2,ry,ry+PAR,'parapet')}else bx(W/2-e*2,-D/2,W/2,D/2,ry,ry+PAR,'parapet');
     for(let i=0;i<nx;i++){piece('wall-a',-W/2+M*(i+.5),ry-.02,D/2,OUT.f.a,[SC,SC*.42,SC]);piece('wall-a',-W/2+M*(i+.5),ry-.02,-D/2,OUT.b.a,[SC,SC*.42,SC])}
     for(let j=0;j<nz;j++){if(!gapR)piece('wall-a',W/2,ry-.02,-D/2+M*(j+.5),OUT.r.a,[SC,SC*.42,SC]);piece('wall-a',-W/2,ry-.02,-D/2+M*(j+.5),OUT.l.a,[SC,SC*.42,SC])}
     // rooftop sniper posts: just behind the parapet, looking out
     for(let i=0;i<nx;i++){post({lx:-W/2+M*(i+.5),lz:D/2-.9,ly:ry,side:'f',kind:'roof',s:fl});post({lx:-W/2+M*(i+.5),lz:-D/2+.9,ly:ry,side:'b',kind:'roof',s:fl})}
     for(let j=0;j<nz;j++){post({lx:-W/2+.9,lz:-D/2+M*(j+.5),ly:ry,side:'l',kind:'roof',s:fl});if(!gapR)post({lx:W/2-.9,lz:-D/2+M*(j+.5),ly:ry,side:'r',kind:'roof',s:fl})}}
    // ---- sign over the door, interior props ----
    if(spec.sign){const z=D/2+.06;piece(spec.sign,0,fl>=2?H*.98:fl*H+.1,z,OUT.f.a,[SC*.8,SC*.8,SC*.8])}
    for(const pr of (spec.props||[])){const ly=(pr.s||0)*H+FT;piece(pr.n,pr.lx,ly,pr.lz,pr.a||0,pr.sc||[SC,SC,SC]);if(pr.box)bx(pr.lx-pr.box[0],pr.lz-pr.box[1],pr.lx+pr.box[0],pr.lz+pr.box[1],ly,ly+pr.box[2],'prop')}
    // ---- doors / stairs nodes ----
    if(P.door){node('door:out',P.door.lx,0,P.door.lz+2.2,'door-out');node('door:in',P.door.lx,FT,P.door.lz-1.6,'door-in');node('hall',P.door.lx,FT,0,'hall')}
    P.y0=y0;P.toWorld=wx_wz;
    P.roofPosts=P.posts.filter(p=>p.kind==='roof');P.winPosts=P.posts.filter(p=>p.kind==='win');
    return P}
  // register a plan's collision in Blocks (and return the cover entries). Blocks must be loaded.
  function register(P,B){const cov=[];for(const b of P.boxes){const c=B.box(b);if(c){c.post=0;cov.push(c)}}for(const f of P.floorsR)B.floor(f);return cov}
  // ---------- the town (Outlaw Isle): centre C, main street along x, buildings facing it ----------
  function layout(Cx,Cz,y){
    const B=(id,kind,dx,dz,q,nx,nz,floors,o)=>Object.assign({id,kind,cx:Cx+dx,cz:Cz+dz,q,nx,nz,floors,y},o||{});
    const T=1.25,BAR={n:'bar',lx:0,lz:0,a:Math.PI/2,box:[1.9,.7,1.15]},tb=(lx,lz)=>({n:'table-a',lx,lz,box:[.8,.8,.85]}),ch=(lx,lz,a)=>({n:'chair',lx,lz,a:a||0}),bar_=(n,lx,lz,hw,hd,h,a)=>({n,lx,lz,a:a||0,box:[hw,hd,h]});void T;
    return [
      B('saloon','saloon',-17,-12,0,4,3,2,{saloon:1,sign:'saloon-sign-b',props:[Object.assign({},BAR,{lx:-1.5,lz:-3.2}),tb(-5,1),tb(3.5,1.5),tb(-1,3),ch(-5.9,1,1.6),ch(-4,1,-1.6),ch(3.5,2.5,3.1),bar_('barrel-a',5.4,-3.6,.5,.5,1.1),bar_('barrel-b',-5.6,-4.2,.5,.5,1.1),bar_('crate',5.2,-2.4,.6,.6,.9)]}),
      B('bank','bank',16,-10,0,3,2,1,{sign:'bank-sign-b',front:{door:1},props:[bar_('table-b',0,-1.4,1.3,.7,1.0),bar_('crate',-4,-2.5,.6,.6,.9),bar_('crate',4.3,-2.5,.6,.6,.9),{n:'gold-bar',lx:-4,lz:-2.5,sc:[SC,SC,SC],a:0},{n:'carpet',lx:0,lz:1.2}]}),
      B('jail','jail',31,-10,0,3,2,1,{sign:'sheriff-sign-a',front:{door:1},props:[bar_('table-a',-3,.8,.8,.8,.85),ch(-3,2,3.1),bar_('crate',4.2,-2.6,.6,.6,.9),{n:'cell-wall',lx:3.2,lz:-1.4,a:0,box:[.12,2.2,2.2]},{n:'cell-door',lx:3.2,lz:.6,a:0},{n:'cell-wall',lx:3.2,lz:2.5,a:0,box:[.12,1.2,2.2]}]}),
      B('store','store',-36,-10,0,2,2,2,{sign:'general-sign-b',front:{door:0},props:[bar_('crate',-2.5,-2.6,.6,.6,.9),bar_('crate',-1.2,-2.7,.6,.6,.9),bar_('barrel-a',2.4,-2.5,.5,.5,1.1),bar_('table-b',1,1.5,1.3,.7,1.0)]}),
      B('hotel','hotel',-18,13,2,3,2,2,{sign:'hotel-sign-b',front:{door:1},props:[bar_('table-b',0,-1.5,1.3,.7,1.0),ch(-1,-.6,3.1),ch(1,-.6,3.1),{n:'carpet',lx:0,lz:1.2}]}),
      B('gunsmith','gunsmith',12,26,2,2,2,1,{sign:'gun-sign-a',front:{door:0},props:[bar_('table-b',.5,-.6,1.3,.7,1.0),bar_('crate',-2.5,-2.6,.6,.6,.9),bar_('barrel-a',2.5,-2.5,.5,.5,1.1),{n:'dynamite-b',lx:-2.5,lz:-2.6,s:0}]}),
      B('doctor','doctor',31,12,2,2,2,2,{sign:'doctor-sign-b',front:{door:0},props:[bar_('table-a',-1,-1.5,.8,.8,.85),ch(.3,-1.5,-1.6),bar_('crate',2.5,-2.7,.6,.6,.9)]})];
  }
  // ---------- outposts: enterable buildings out on the island (ranch, mine, lookout, hideouts, depot...). Positions are offsets from the town centre; buildTown nudges each onto flat ground. ----------
  function outposts(Cx,Cz){
    const B=(id,kind,dx,dz,q,nx,nz,floors,o)=>Object.assign({id,kind,cx:Cx+dx,cz:Cz+dz,q,nx,nz,floors,out:1,y:0},o||{});
    const crate=(lx,lz)=>({n:'crate',lx,lz,box:[.6,.6,.9]}),barrel=(lx,lz)=>({n:'barrel-a',lx,lz,box:[.5,.5,1.1]}),tbl=(lx,lz)=>({n:'table-a',lx,lz,box:[.8,.8,.85]});
    return [
      B('ranch','ranch',-6,103,2,3,2,2,{sign:'general-sign-a',front:{door:1},props:[tbl(0,-1.5),crate(-3.5,-2.6),barrel(4,-2.6)]}),
      B('bunk','bunkhouse',34,128,3,2,2,1,{front:{door:0},props:[crate(-2.4,-2.6),barrel(2.4,-2.6),tbl(0,.8)]}),
      B('assay','assay office',112,-8,1,2,2,2,{sign:'bank-sign-a',front:{door:0},props:[crate(-2.4,-2.6),crate(-1.1,-2.7),barrel(2.4,-2.6)]}),
      B('shaft','mine shed',139,46,2,2,2,1,{front:{door:1},props:[barrel(-2.4,-2.6),crate(2.4,-2.6),{n:'dynamite-b',lx:2.4,lz:-2.6,s:0}]}),
      B('lookcab','ridge cabin',-110,22,1,2,2,2,{front:{door:0},props:[crate(-2.4,-2.6),tbl(1,-1.5)]}),
      B('lookstore','ridge store',-140,48,3,2,2,1,{sign:'general-sign-c',front:{door:1},props:[crate(-2.4,-2.6),barrel(2.4,-2.6)]}),
      B('depot','depot',-72,-62,0,3,2,1,{sign:'hotel-sign-a',front:{door:1},props:[crate(-4,-2.6),crate(-2.7,-2.7),barrel(4.2,-2.6)]}),
      B('hide1','hideout',72,70,2,2,2,2,{front:{door:0},props:[crate(-2.4,-2.6),tbl(1,-1.5)]}),
      B('hide2','hideout',-78,-84,0,2,2,2,{front:{door:1},props:[crate(2.4,-2.6),tbl(-1,-1.5)]}),
      B('post','trading post',108,-62,3,2,2,1,{sign:'gun-sign-b',front:{door:0},props:[crate(-2.4,-2.6),barrel(2.4,-2.6)]})];
  }
  // street dressing (merged into one mesh): [piece, dx, dz, yaw, scale, circle radius, cover height (0 = low prop with no collision)]
  const DECOR=[['hitching-post',-17,-3.9,Math.PI/2,1,.6,1.1],['hitching-post',17,-3.9,Math.PI/2,1,.6,1.1],['trough-a',-11,-3.6,0,1,1.0,.9],['trough-a',11,-3.6,0,1,1.0,.9],['hitching-post',-18,4.2,Math.PI/2,1,.6,1.1],['hitching-post',18,4.2,Math.PI/2,1,.6,1.1],
    ['stagecoach',7,3.4,.35,1,2.4,2.2],['cart-b',-27,3.5,-.4,1,2.0,1.6],['cart-a',38,3,.5,1,1.8,1.4],['gallows',0,-14.5,0,1,2.6,3.0],['barrel-a',-3,-2,0,1,.55,1.2],['barrel-b',3,-2.5,0,1,.55,1.2],['crate',-13.5,4.3,.4,1,.8,1.3],['crate',-12.2,4.6,1.1,1,.8,1.3],['barrel-a',26,3.5,0,1,.55,1.2],['crate',24.5,3.8,.2,1,.8,1.3],
    ['cactus-a',-44,6,0,1.4,.6,0],['cactus-b',43,-5,.5,1.4,.6,0],['cactus-c',-42,-6,.2,1.4,.5,0],['welcome-sign',-46,0,Math.PI/2,1,.8,0],['lantern',-8,-5,0,1.5,.2,0],['lantern',8,-5,0,1.5,.2,0],['lantern',-8,5,0,1.5,.2,0],['lantern',8,5,0,1.5,.2,0]];
  // build the whole town: plans -> Blocks (walls, floors) + cover + merged meshes. X: {C:{x,z,y}, scene, cover, solids, Kit:WestKit, Blocks}
  async function buildTown(X){
    const man=await X.Kit.manifest();setManifest(man);const C=X.C,plans=layout(C.x,C.z,C.y).map(plan);
    // outposts: nudge each onto flat ground (terrain X.H), raise to the highest corner + a skirt below, skip if the spot is water / too steep
    const outs=[];if(X.H){for(const sp of outposts(C.x,C.z)){let best=null;
        for(const [ox,oz] of [[0,0],[8,0],[-8,0],[0,8],[0,-8],[14,0],[-14,0],[0,14],[0,-14],[10,10],[-10,-10],[10,-10],[-10,10]]){
          const cx=sp.cx+ox,cz=sp.cz+oz,hw=sp.nx*M/2+3,hd=sp.nz*M/2+3;let lo=1e9,hi=-1e9;
          for(const [a,b] of [[0,0],[-hw,-hd],[hw,-hd],[-hw,hd],[hw,hd],[0,hd],[0,-hd],[hw,0],[-hw,0]]){const h=X.H(cx+a,cz+b);lo=Math.min(lo,h);hi=Math.max(hi,h)}
          if(lo<1.2)continue;const range=hi-lo;if(!best||range<best.range)best={cx,cz,range,hi,lo};if(range<.45)break}
        if(!best||best.range>.9)continue;
        sp.cx=best.cx;sp.cz=best.cz;sp.y=best.hi+.02;sp.skirt=best.lo-1.2;outs.push(sp)}}
    for(const sp of outs)plans.push(plan(sp));
    X.Blocks.clear();for(const P of plans){for(const c of register(P,X.Blocks))X.cover.push(c);P.cover=1}
    for(const f of X.Blocks.cover)if(f.slab&&X.cover.indexOf(f)<0)X.cover.push(f);
    // street decor: circle solids / cover (not enterable)
    const dec=[];for(const [n,dx,dz,a,sc,r,h] of DECOR){const x=C.x+dx,z=C.z+dz;dec.push({n,x,y:C.y,z,ry:a,s:[SC*sc,SC*sc,SC*sc]});if(r&&h){const c={x,z,r,y:C.y-.05,h};X.solids.push(c);X.cover.push(c)}}
    const tint=X.tint||[1,1,1];
    for(const P of plans){const sp=outs.find(o=>o.id===P.id);if(sp){const hw=P.W/2+.4,hd=P.D/2+2.4,q=P.q,sw=q%2?hd:hw,sd=q%2?hw:hd;P.pieces.push({box:{x0:P.x-sw,x1:P.x+sw,z0:P.z-sd,z1:P.z+sd,y0:sp.skirt,y1:sp.y-.02},col:'#6e5a46'})}   // foundation skirt down to the ground
      const m=await X.Kit.mesh(P.pieces,{tint});m.name='west-'+P.id;X.scene.add(m);P.mesh=m}
    const dm=await X.Kit.mesh(dec,{tint});dm.name='west-decor';X.scene.add(dm);
    return {plans,decor:dm}}
  return {plan,register,setManifest,layout,outposts,buildTown,DECOR,SC,M,H,FT,PAR};
})();
if(typeof module!=='undefined')module.exports=WestTown;
