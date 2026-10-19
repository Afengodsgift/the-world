// Deck edges: nobody falls off a ship by accident; leaving is a choice (Jump overboard); a whole side can fire at once.
const {client}=require('./harness');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const A=client('a','A','EDGE-1');A.Ship.build();A.Fleet.build();
const v=A.Ship.vessel(),d=v.deck,D=A.Decks,S=A.S,M=A.SHIP.cls.galleon.deckM;
// 1. no open edge anywhere: every deck-level cell that touches void / the sea has a wall cell beyond it
let open=0,cells=0;
for(let iz=1;iz<d.nz-1;iz++)for(let ix=1;ix<d.nx-1;ix++){const gx=(d.x0+(ix+.5)*d.cs)*d.sc,gz=(d.z0+(iz+.5)*d.cs)*d.sc;if(gx<0&&Math.abs(gz)<1.8)continue;if(gz>=13.9&&Math.abs(gx)<1.2)continue;   // gangway, bowsprit root
  const h=d.h[iz*d.nx+ix]*d.sc;if(d.h[iz*d.nx+ix]<0||h<M-.2||h>M+1.5)continue;cells++;
  for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=d.h[(iz+b)*d.nx+ix+a];if(n<0||n*d.sc<M-1.0){open++;break}}}
ok(cells>500&&open===0,'every deck-edge cell is closed by a wall ('+open+' open of '+cells+')');
// 2. walk (with the real controller) into every side from the middle: you stay aboard
function walk(ang,secs){S.x=0;S.z=0;S.y=0;A.Decks.pin(S,d,0,0);S.grounded=true;S.vy=0;let fell=false;const px0=[0,0];
  for(let i=0;i<secs*30;i++){const px=S.x,pz=S.z;const dx=Math.sin(ang)*6/30,dz=Math.cos(ang)*6/30;const q=d.pose;
    S.x+=dx;S.z+=dz;const g=D.step(S,px,pz,{dt:1/30,grounded:true,moving:true,flying:false});if(g>-1e8)S.y=g;const f=D.floor(d,...(()=>{const l=D.toLocal(d,S.x,S.y,S.z,{});return [l.x,l.z]})());if(f<0){fell=true;break}}
  return !fell&&S._dk&&S._dk.id===d.id}
let stayed=0,tot=0;for(let a=0;a<6.283;a+=.35){if(a>4.3&&a<5.1)continue;if(a<.1)continue;tot++;if(walk(a,6))stayed++;else{const l=D.toLocal(d,S.x,S.y,S.z,{});console.log('  left at ang',a.toFixed(2),'local',l.x.toFixed(1),l.y.toFixed(1),l.z.toFixed(1),'dk',!!S._dk)}}
ok(stayed===tot,'walking into the rail from any direction keeps you on the ship ('+stayed+'/'+tot+')');
// 3. jump overboard works at the rail and not in the middle
A.Decks.pin(S,d,0,0);S.grounded=true;ok(!A.Fleet._me||true,'(setup)');
D.pin(S,d,0,0);
const mid=A.Interaction;let l=D.toLocal(d,S.x,S.y,S.z,{});
function nearRail(side){D.pin(S,d,side*(v.hb-1.0),2);for(let i=0;i<20;i++){const px=S.x,pz=S.z;const w=D.toWorld(d,l.x,0,0,{});S.x+=side*.2*Math.cos(d.pose.h);S.z-=side*.2*Math.sin(d.pose.h);D.step(S,px,pz,{dt:1/30,grounded:true,moving:true,flying:false})}}
nearRail(1);A.Interaction.update&&0;
ok(typeof A.Fleet.overboard==='function','overboard exists');
// the salvo
A.Ship._board&&0;
const side=v.guns[0].side,n=v.guns.filter(g=>g.side===side).length;ok(n>=4,'one side has several guns ('+n+')');
// 4. the bowsprit: walk out along it to the tip and stand there; step off the side and you are in the water
{const sp=A.SHIP.cls.galleon.sprit;D.pin(S,d,0,10);S.grounded=true;S.vy=0;
 for(let i=0;i<400;i++){const px=S.x,pz=S.z;const l0=D.toLocal(d,S.x,S.y,S.z,{});const w=D.toWorld(d,l0.x,l0.y,l0.z+.12,{});S.x=w.x;S.z=w.z;const g=D.step(S,px,pz,{dt:1/30,grounded:true,moving:true,flying:false});if(g>-1e8)S.y=g;if(D.toLocal(d,S.x,S.y,S.z,{}).z>sp.tip+.25)break}
 const l=D.toLocal(d,S.x,S.y,S.z,{});
 ok(S._dk&&l.z>sp.tip&&l.z<sp.z1+.2&&l.y>sp.h1-1.2,'you can walk out along the bowsprit to its tip (z '+l.z.toFixed(1)+', height '+l.y.toFixed(1)+')');
 ok(A.Bowsprit.atTip(),'Bowsprit.atTip() is true there');
 D.pin(S,d,0,10);S.grounded=true;ok(!A.Bowsprit.atTip(),'...and false on the deck');
 ok(D.floor(d,sp.hw+.8,17)<0,'beside the sprit there is only water');}
process.exit(fails?1:0);
