// Arcane magic replaces Flow; buffered taps; guest->host magic damage
const fs=require('fs');const s=fs.readFileSync('src/combat/PlayerCombat.js','utf8');let n=0;const ok=(c,m)=>{if(!c){console.log('FAIL '+m);process.exitCode=1}else n++};
ok(/function magicStrike/.test(s)&&/THUNDERFALL/.test(s)&&/ARCANE STORM/.test(s),'Thunderfall and Arcane Storm exist');
ok(!/flowOn=true;flowN=0;msg\('FLOW'/.test(s),'the old Flow mode no longer starts');
ok(/<button id="wFlow">Magic<\/button>/.test(s),'the button says Magic');
ok(/p\.t==='mg'&&NET\.mode==='host'/.test(s)&&/p\.t==='pf'\|\|p\.t==='mg'/.test(s),'guest magic is applied by the host');
ok(/function magicHit[^}]*NET\.mode==='guest'\)return/.test(s),'only the host applies magic damage');
ok(/function bufTick/.test(s)&&/bufSet\('jump'\)/.test(s)&&/bufSet\('shadow'\)/.test(s)&&/bufSet\('swap'\)/.test(s)&&/bufTick\(\)/.test(s),'jump / shadow / twin taps are buffered 0.35 s');
ok(/ptr\[name\]!==undefined&&holdy/.test(s),'a stale pointer can no longer swallow taps on a tap button');
console.log(n+' checks')
{const pc=require('fs').readFileSync('src/combat/PlayerCombat.js','utf8');let m=0;const k=(c,t)=>{if(!c){console.log('FAIL '+t);process.exitCode=1}else m++};
k(/gR:\{rx:0,ry:0,rz:1\.5708/.test(pc)&&/gL:\{rx:0,ry:0,rz:-1\.5708/.test(pc)&&/g=g\|\|st\.gr\|\|GRIP/.test(pc),'twin blades are gripped with a mirrored quarter-turn per hand');
const v=require('fs').readFileSync('src/combat/WardenVfx.js','utf8');k(/heavy\?2\.4:1\.8/.test(v)&&/heavy\?1\.8:1\.25/.test(v),'slash and hit VFX trimmed');console.log(m+' grip checks')}
{const pc=require('fs').readFileSync('src/combat/PlayerCombat.js','utf8');let m=0;const k=(c,t)=>{if(!c){console.log('FAIL '+t);process.exitCode=1}else m++};
k(/function comboHit/.test(pc)&&/comboHit\(\)\}else if\(e\.t==='hit'&&e\.d==='P'\)comboBreak/.test(pc)&&/SHADOW CROSS/.test(pc)&&/id="wCombo"/.test(pc),'hit counter and string name');
k(/KeyH:'clip'/.test(pc)&&/id="wClipB"/.test(pc)&&/\.wclip #wh/.test(require('fs').readFileSync('src/ui/warden.css','utf8')),'Clip mode');console.log(m+' clip checks')}
