// Browser behaviour test for the Outlaw Isle HUD: two fire buttons (left/right/both/cancel), the ☰ reveal + auto-hide, leaving the isle.
// Run through a headless harness on a loaded game placed on Outlaw Isle (S.x=-600,S.z=-1190), e.g. tools/headless_smoke.mjs; it returns an object of PASS/FAIL values.
(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const T=Outlaw._t(),out={};
 const pe=(el,type,id)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,clientX:100,clientY:100,pointerType:'touch'}));
 T.SAVE.own[3]=1;Outlaw.equip(3);await sleep(1500);
 const f1=document.getElementById('owfire'),f2=document.getElementById('owfire2');
 const shots=()=>T.lastShot;
 // 1) left button alone fires
 let a=shots();pe(f2,'pointerdown',7);await sleep(4000);out.leftFires=shots()!==a;
 // 2) add the right button, release the left: must keep firing
 pe(f1,'pointerdown',8);await sleep(800);pe(f2,'pointerup',7);await sleep(500);let b=shots();await sleep(4000);out.keepsFiringWhenOneReleased=shots()!==b;
 // 3) release the right button too: must stop
 pe(f1,'pointerup',8);await sleep(1500);let c=shots();await sleep(4000);out.stopsWhenAllReleased=shots()===c;
 // 4) right button alone still fires (unchanged behaviour), cancel stops it
 let d=shots();pe(f1,'pointerdown',9);await sleep(4000);out.rightFires=shots()!==d;pe(f1,'pointercancel',9);await sleep(1500);let e=shots();await sleep(3500);out.cancelStops=shots()===e;
 // 5) pressing the same button twice without releasing must not leave it stuck on
 pe(f2,'pointerdown',11);pe(f2,'pointerdown',12);pe(f2,'pointerup',11);await sleep(1500);let g=shots();await sleep(3500);out.noStuckFire=shots()===g;pe(f2,'pointerup',12);
 // 6) the menu button reveals the hidden HUD, then hides it again
 const mb=document.querySelector('.dk-owm');pe(mb,'pointerdown',20);await sleep(400);
 out.reveal={cls:document.body.className,infoShown:getComputedStyle(document.getElementById('info')).display!=='none',mapShown:getComputedStyle(document.querySelector('.dk-map')).display!=='none',menuBtnHidden:getComputedStyle(mb).display==='none'};
 await sleep(8000);out.autoHide={cls:document.body.className,infoHidden:getComputedStyle(document.getElementById('info')).display==='none'};
 // 7) leaving the isle restores the full HUD and removes the left fire button
 S.x=25;S.z=88;await sleep(4000);out.offIsle={cls:document.body.className,infoShown:getComputedStyle(document.getElementById('info')).display!=='none',emoShown:getComputedStyle(document.getElementById('emobtn')).display!=='none',fire2:getComputedStyle(f2).display};
 return out})()
