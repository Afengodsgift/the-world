// Ship camera modes in the REAL game (software GL ~1 fps): third / captain / cannon screenshots + state checks. Not in run_all.sh.
//   NODE_PATH=<three + playwright-core> node tests/shipcam_browser.mjs --shots dir
import {start,real} from './lib/browser.mjs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const B=await start();
{const p=await B.open('?perf=1');await p.waitForTimeout(3000);
 const snap=async n=>{if(shots)await p.screenshot({path:shots+'/'+n+'.png'})};
 const wait=(f,a)=>p.waitForFunction(f,a,{timeout:60000}).catch(()=>{});
 await p.evaluate(()=>{Ship._board();});await p.waitForTimeout(2500);
 await p.evaluate(()=>{const d=Decks.get('ship');Decks.pin(S,d,SHIP.stations.helm[0],SHIP.stations.helm[1]);Ship._claim('helm');Ship._ship.v=6;Ship._ship.sail=1});
 await wait(()=>CameraRig.shipK()>.9);await p.waitForTimeout(1500);await snap('a_third');
 ok(await p.evaluate(()=>Ship.cam()==='third'&&Ship.seated()),'helm: third-person');
 await p.evaluate(()=>Ship.toggleCam());await wait(()=>CameraRig.eyeK()>.95);await p.waitForTimeout(1500);await snap('b_captain');
 ok(await p.evaluate(()=>CameraRig.eyeK()>.9&&!me.visible),'captain view: camera on the anchor, avatar hidden');
 await p.evaluate(()=>Ship.leave());await wait(()=>CameraRig.eyeK()<.05);await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!Ship.locked()&&me.visible),'leaving the helm: avatar back, controls free');await snap('c_after_leave');
 // cannon
 await p.evaluate(()=>{Ship._ship.v=0;const v=Ship.vessel(),g=v.guns.find(q=>q.side>0),m=Vessel.muzzle(v,g,{});Decks.pin(S,Decks.get('ship'),g.x-1.4,g.z);window.__g=g});
 await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>Interaction.current()==='cannon-fire'),'next to a cannon the prompt is "Man the cannon"');
 await p.evaluate(()=>Interaction.use());await wait(()=>CameraRig.eyeK()>.95);await p.waitForTimeout(1500);await snap('d_cannon');
 ok(await p.evaluate(()=>Ship.gunning()&&Interaction.current()==='cannon-shoot'),'cannon camera on, Fire! is the action');
 await p.evaluate(()=>Interaction.use());await p.waitForTimeout(1500);await snap('e_fired');
 await p.evaluate(()=>Ship.leave());await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>!Ship.gunning()&&!Ship.locked()),'leaving the cannon');
 ok(real(p.errs).length===0,'no page errors: '+JSON.stringify(real(p.errs).slice(0,3)));
 await p.close2();}
await B.close();console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
