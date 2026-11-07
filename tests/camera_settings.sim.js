// camera settings UI (sensitivity / distance / invert), scenery fade, vertical-combat pitch
const fs=require('fs');const pc=fs.readFileSync('src/combat/PlayerCombat.js','utf8'),im=fs.readFileSync('src/input/InputManager.js','utf8');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
ok(/S\.lookU\|\|1\)/.test(im)&&/if\(S\.invY\)dy=-dy/.test(im),'look speed and invert apply in lookBy');
ok(/function camPanel/.test(pc)&&/id="wCamB"/.test(pc)&&/cpS/.test(pc)&&/cpD/.test(pc)&&/cpI/.test(pc),'camera panel with speed / distance / invert');
ok(/lookU:1,invY:0,fade:1/.test(pc)&&/function camSave/.test(pc),'settings persist (wcam)');
ok(/scenery fade/.test(pc)&&/CAMS\.fade&&d<1\.9/.test(pc),'pillars between camera and you fade');
ok(/vertical-combat pitch/.test(pc)&&/S\.lookT/.test(pc),'camera pitch follows a foe on different ground, never while you drag');
console.log(n+' checks')
ok(!/^  S\./m.test(pc),'PlayerCombat touches S only inside functions (S does not exist yet when the file loads)');
