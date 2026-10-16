// Your ship in the REAL game (headless Chromium, software WebGL): walk from the pier over the rail onto the deck, climb the stairs to the wheel, take the helm, sail, be carried. Not part of run_all.sh:
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/ship_browser.mjs [--shots dir]
// Software GL runs at ~1 fps (the sim steps are capped at 50 ms), so every wait is "until the game state says so", not a fixed time.
import {start,real} from './lib/browser.mjs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const B=await start();
{const p=await B.open('?perf=1');await p.waitForTimeout(3000);
 const snap=async n=>{if(shots)await p.screenshot({path:shots+'/'+n+'.png'})};
 ok(await p.evaluate(()=>!!Ship.vessel()&&Decks.get('ship')&&Ship.vessel().hl>11),'the big ship exists with a baked walkable deck');
 // ---- 1. from the pier into the rail ----
 await p.evaluate(()=>{S.x=DOCK.x;S.z=DOCK.z0+1.25+2.5*13;S.y=DOCK.top;S.vy=0;S.yaw=0;S.grounded=true;S._dk=null;me.position.set(S.x,S.y,S.z)});
 await p.waitForTimeout(1500);await snap('1_pier');
 const drive=(tx,tz)=>p.evaluate(([tx,tz])=>{window.__drv=setInterval(()=>{S.yaw=0;const dx=tx-S.x,dz=tz-S.z,l=Math.hypot(dx,dz);stickV=l<.4?{x:0,y:0}:{x:dx/l,y:dz/l}},30)},[tx,tz]);
 const stop=()=>p.evaluate(()=>{clearInterval(window.__drv);stickV={x:0,y:0}});
 await drive(...await p.evaluate(()=>[DOCK.ship.x,DOCK.z0+1.25+2.5*13]));
 await p.waitForFunction(()=>Ship._onDeck(),null,{timeout:120000}).then(()=>ok(true,'walking from the pier into the ship climbs the rail and puts you ON the deck'),()=>ok(false,'walking from the pier onto the deck (S.y='+0+')'));
 await stop();await p.waitForFunction(()=>{const l=Decks.toLocal(Decks.get('ship'),S.x,S.y,S.z,{});return S.grounded&&l.y>SHIP.cls.sloop.deckM-.35},null,{timeout:60000}).catch(()=>{});
 const st=await p.evaluate(()=>{const l=Decks.toLocal(Decks.get('ship'),S.x,S.y,S.z,{});return {y:S.y,dk:S._dk&&S._dk.id,ly:l.y,deck:SHIP.cls.sloop.deckM,grounded:S.grounded,state:S.state}});
 ok(st.dk==='ship'&&st.ly>st.deck-.35&&st.ly<st.deck+1.3,'standing on the deck or its rail, not sunk, feet on the planks (local y '+st.ly.toFixed(2)+' vs '+st.deck.toFixed(2)+', state '+st.state+')');
 await snap('2_on_deck');
 // ---- 2. walk to the wheel along the real route (stairs) ----
 await p.evaluate(()=>{const d=Decks.get('ship'),l=Decks.toLocal(d,S.x,S.y,S.z,{});window.__path=Decks.route(d,l.x,l.z,SHIP.stations.helm[0],SHIP.stations.helm[1]);window.__wi=0;window.__tr=[];
   window.__drv2=setInterval(()=>{S.yaw=0;const P=window.__path;if(!P||window.__wi>=P.length){stickV={x:0,y:0};return}const d=Decks.get('ship'),l=Decks.toLocal(d,S.x,S.y,S.z,{}),t=P[window.__wi];window.__tr.push([+l.x.toFixed(2),+l.y.toFixed(2),+l.z.toFixed(2),window.__wi,S.grounded?1:0,S._dk?1:0,+S.x.toFixed(1),+S.y.toFixed(1),+S.z.toFixed(1),+(d.pose.x).toFixed(1),+(d.pose.z).toFixed(1),+d.pose.h.toFixed(2),+(S.vy||0).toFixed(1)]);if(window.__tr.length>60&&!window.__lost)window.__tr.shift();if(!S._dk&&window.__tr.length>20)window.__lost=(window.__lost||0)+1;if(window.__lost>12)window.__tr.length=Math.min(window.__tr.length,60);if(Math.hypot(t.x-l.x,t.z-l.z)<.4){window.__wi++;return}
     const w=Decks.toWorld(d,t.x,t.y||0,t.z,{}),dx=w.x-S.x,dz=w.z-S.z,L=Math.hypot(dx,dz);stickV={x:dx/L,y:dz/L}},30)});
 ok(await p.evaluate(()=>!!window.__path&&window.__path.length>5),'a walking route exists from the main deck to the wheel');
 await p.waitForFunction(()=>window.__wi>=window.__path.length,null,{timeout:240000}).then(()=>ok(true,'walked the whole route'),async()=>ok(false,'walked the whole route (tr '+JSON.stringify((await p.evaluate(()=>window.__tr)).slice(-40).filter((_,i)=>i%2==0))+' wi '+JSON.stringify(await p.evaluate(()=>{const d=Decks.get('ship'),l=Decks.toLocal(d,S.x,S.y,S.z,{});return {wi:window.__wi,n:window.__path&&window.__path.length,t:window.__path&&window.__path[window.__wi],l:[l.x,l.y,l.z]}}))+')'));
 await p.evaluate(()=>{clearInterval(window.__drv2);stickV={x:0,y:0}});await p.waitForTimeout(1500);
 const hs=await p.evaluate(()=>{const d=Decks.get('ship'),l=Decks.toLocal(d,S.x,S.y,S.z,{});return {ly:l.y,fl:Decks.floor(d,l.x,l.z),main:SHIP.cls.sloop.deckM,g:S.grounded}});
 ok(hs.ly>hs.main+2.4&&Math.abs(hs.ly-hs.fl)<.4&&hs.g,'standing ON the raised stern deck, not inside it ('+(hs.ly-hs.main).toFixed(1)+' m above the main deck)');
 await snap('3_stern');
 // ---- 3. take the helm, sail, be carried ----
 await p.evaluate(()=>{Ship._claim('helm');Ship._raw.x=0;Ship._raw.y=-1});
 ok(await p.evaluate(()=>Ship.seated()&&Ship._s.host===myId),'the helm can be taken from the stern deck');
 const p0=await p.evaluate(()=>({x:S.x,z:S.z,sx:Ship._ship.x,sz:Ship._ship.z}));
 await p.evaluate(()=>{Ship._ship.v=7;Ship._ship.sail=1});await p.waitForFunction(([x,z])=>Math.hypot(Ship._ship.x-x,Ship._ship.z-z)>4,[p0.sx,p0.sz],{timeout:60000}).catch(()=>{});
 const p1=await p.evaluate(()=>{const d=Decks.get('ship'),h=SHIP.stations.helm,w=Decks.toWorld(d,h[0],Decks.floor(d,h[0],h[1]),h[1],{});return {x:S.x,z:S.z,sx:Ship._ship.x,sz:Ship._ship.z,hx:w.x,hz:w.z,dk:S._dk&&S._dk.id,y:S.y,wy:w.y}});
 ok(Math.hypot(p1.sx-p0.sx,p1.sz-p0.sz)>3.5,'the ship sails ('+Math.hypot(p1.sx-p0.sx,p1.sz-p0.sz).toFixed(1)+' m)');
 ok(Math.hypot(p1.x-p1.hx,p1.z-p1.hz)<.8&&Math.abs(p1.y-p1.wy)<.5&&p1.dk==='ship','the helmsman rides at the wheel ('+Math.hypot(p1.x-p1.hx,p1.z-p1.hz).toFixed(2)+' m off, dk='+p1.dk+')');
 await snap('4_sailing');
 ok(real(p.errs).length===0,'no page errors: '+JSON.stringify(real(p.errs).slice(0,3)));
 await p.close2();}
await B.close();console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
